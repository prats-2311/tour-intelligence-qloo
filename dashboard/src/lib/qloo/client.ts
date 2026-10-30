import { LONG_NAMES_SAMPLE, LUMEN_VALE_SAMPLE } from "./fixtures/lumenVale";
import { getSessionId } from "./session";
import { SseParser } from "./sse";
import { samplePlaybookEvents, sampleThisWeek } from "./fixtures/lumenValePlaybooks";
import { SAMPLE_WITHOUT_QLOO, sampleStrategistEvents } from "./fixtures/strategistSample";
import { recordedQuestion, showcaseBoardEvents, showcaseStrategist, showcasePlaybookEvents, showcaseThisWeek, showcaseWithoutQloo, variantOfBrief } from "./showcase";
import { parseWithoutQloo } from "./withoutQloo";
import { parseSponsorSegments, SEGMENTS_ERROR, type SponsorSegments } from "./segments";
import type { AdvanceRisks, ChatMessage, DateWindow, GatewayEvent, SampleSet, StrategistContext, ThisWeek, TourBrief, WithoutQloo } from "./types";

export const SHOWCASE_STRATEGIST_NOTE = "The live strategist needs a live run";

type StreamOpts = { signal?: AbortSignal; fetchImpl?: typeof fetch; sample?: boolean; sampleSet?: SampleSet; /** Which recording a showcase replay reads: "routing" for the recorded routing example. */ variant?: "routing"; delayMs?: number };

export const isSampleMode = (): boolean => import.meta.env.VITE_QLOO_FIXTURES === "1";

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
  if (ms <= 0) return resolve();
  const onAbort = () => { clearTimeout(t); reject(new DOMException("aborted", "AbortError")); };
  const t = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
  signal?.addEventListener("abort", onAbort, { once: true });
});

async function* sample(events: GatewayEvent[], opts: StreamOpts): AsyncGenerator<GatewayEvent> {
  for (const e of events) { await sleep(opts.delayMs ?? 60, opts.signal); yield e; }
}

async function* stream(url: string, init: RequestInit, opts: StreamOpts): AsyncGenerator<GatewayEvent> {
  const res = await (opts.fetchImpl ?? fetch)(url, { ...init, signal: opts.signal });
  if (!res.ok || !res.body) {
    let message = `request failed: ${res.status}`;
    try { const j = (await res.json()) as { error?: string }; if (j.error) message = j.error; } catch { /* keep default */ }
    yield { type: "error", code: `HTTP_${res.status}`, message };
    return;
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  const parser = new SseParser();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    for (const { data } of parser.feed(value)) {
      try { yield JSON.parse(data) as GatewayEvent; } catch { /* skip malformed payload */ }
    }
  }
}

export function streamTourBoard(brief: TourBrief, opts: StreamOpts = {}): AsyncGenerator<GatewayEvent> {
  if (opts.sample && opts.sampleSet === "showcase") return sample(showcaseBoardEvents(variantOfBrief(brief)), opts);
  if (opts.sample) return sample(opts.sampleSet === "long" ? LONG_NAMES_SAMPLE : LUMEN_VALE_SAMPLE, opts);
  return stream("/api/qloo/tour-board", {
    method: "POST",
    headers: { "content-type": "application/json", "x-session-id": getSessionId() },
    body: JSON.stringify(brief),
  }, opts);
}

export function streamCityPlaybook(q: { artist: string; artistEntityId: string; artistPopularity?: number; city: string; country: string }, opts: StreamOpts & { cityId?: string; lat?: number; lon?: number } = {}): AsyncGenerator<GatewayEvent> {
  if (opts.sample) {
    if (opts.sampleSet === "showcase") {
      const rec = opts.cityId ? showcasePlaybookEvents(opts.cityId, opts.variant ?? "main") : null;
      return sample(rec ?? [{ type: "error", code: "NO_SAMPLE", message: `No recorded playbook for ${q.city}` }], opts);
    }
    const events = opts.cityId ? samplePlaybookEvents(opts.cityId, { long: opts.sampleSet === "long" }) : null;
    return sample(events ?? [{ type: "error", code: "NO_SAMPLE", message: `No sample playbook for ${q.city}` }], opts);
  }
  const { artistPopularity, ...rest } = q;
  const params = new URLSearchParams(rest);
  if (typeof artistPopularity === "number" && Number.isFinite(artistPopularity)) params.set("artistPopularity", String(artistPopularity));
  if (opts.cityId) params.set("cityId", opts.cityId);
  if (typeof opts.lat === "number" && typeof opts.lon === "number") { params.set("lat", String(opts.lat)); params.set("lon", String(opts.lon)); }
  const qs = params.toString();
  return stream(`/api/qloo/city-playbook?${qs}`, { method: "GET", headers: { "x-session-id": getSessionId() } }, opts);
}

export function streamStrategist(body: { messages: ChatMessage[]; context: StrategistContext }, opts: StreamOpts = {}): AsyncGenerator<GatewayEvent> {
  if (opts.sample && opts.sampleSet === "showcase") {
    // Recorded Q&As replay with their full work log; a recording without any keeps the original note.
    const hasRecorded = showcaseStrategist().length > 0;
    const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
    const rec = lastUser ? recordedQuestion(lastUser.text) : null;
    if (rec) return sample(rec.events.some((e) => e.type === "done") ? rec.events : [...rec.events, { type: "done", summary: {} }], opts);
    // The example's context (artist, regions, scored cities) is all the live strategist needs, so a free-text question runs live.
    if (hasRecorded) return liveStrategist(body, opts);
    return sample([
      { type: "strategist_error", code: "UNAVAILABLE", message: SHOWCASE_STRATEGIST_NOTE },
      { type: "done", summary: {} },
    ], opts);
  }
  if (opts.sample) {
    const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
    return sample(sampleStrategistEvents(lastUser?.text ?? ""), opts);
  }
  return liveStrategist(body, opts);
}

function liveStrategist(body: { messages: ChatMessage[]; context: StrategistContext }, opts: StreamOpts): AsyncGenerator<GatewayEvent> {
  return friendlyStrategistErrors(stream("/api/qloo/strategist", {
    method: "POST",
    headers: { "content-type": "application/json", "x-session-id": getSessionId() },
    body: JSON.stringify(body),
  }, opts));
}

/** A 400 carries raw validator text; the user gets plain copy instead. */
async function* friendlyStrategistErrors(events: AsyncGenerator<GatewayEvent>): AsyncGenerator<GatewayEvent> {
  for await (const e of events) {
    yield e.type === "error" && e.code === "HTTP_400" ? { ...e, message: "The strategist couldn't read this board — try again" } : e;
  }
}

const WITHOUT_QLOO_ERROR: WithoutQloo = { status: "unavailable", reason: "error", message: "Generic ranking unavailable" };

export async function fetchWithoutQloo(body: { artist: string; regions: string[]; cities: Array<{ name: string; country: string }> }, opts: { sample?: boolean; sampleSet?: SampleSet; variant?: "routing"; fetchImpl?: typeof fetch; signal?: AbortSignal } = {}): Promise<WithoutQloo> {
  if (opts.sample && opts.sampleSet === "showcase") return showcaseWithoutQloo(opts.variant ?? "main");
  if (opts.sample) return SAMPLE_WITHOUT_QLOO;
  try {
    const res = await (opts.fetchImpl ?? fetch)("/api/qloo/without-qloo", {
      method: "POST", signal: opts.signal,
      headers: { "content-type": "application/json", "x-session-id": getSessionId() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return WITHOUT_QLOO_ERROR;
    const parsed = parseWithoutQloo(await res.json());
    return parsed ?? WITHOUT_QLOO_ERROR;
  } catch {
    return WITHOUT_QLOO_ERROR;
  }
}

const WEB_ERROR: ThisWeek = { status: "unavailable", reason: "error", message: "Live web context unavailable — search failed" };

export async function fetchThisWeek(q: { city: string; country: string; window?: DateWindow }, opts: { sample?: boolean; sampleSet?: SampleSet; variant?: "routing"; cityId?: string; fetchImpl?: typeof fetch; signal?: AbortSignal } = {}): Promise<ThisWeek> {
  if (opts.sample && opts.sampleSet === "showcase") return (opts.cityId ? showcaseThisWeek(opts.cityId, opts.variant ?? "main") : null) ?? { status: "unavailable", reason: "no_window", message: "No recorded web context for this city" };
  if (opts.sample) return (opts.cityId ? sampleThisWeek(opts.cityId) : null) ?? { status: "unavailable", reason: "no_key", message: "No sample web context for this city" };
  if (!q.window) return { status: "unavailable", reason: "no_window", message: "Add a date window to the brief to check this week in the city" };
  const qs = new URLSearchParams({ city: q.city, country: q.country, start: q.window.start, end: q.window.end }).toString();
  try {
    const res = await (opts.fetchImpl ?? fetch)(`/api/qloo/this-week?${qs}`, { signal: opts.signal, headers: { "x-session-id": getSessionId() } });
    if (res.status === 400) return { status: "unavailable", reason: "error", message: "Date window too long (max 62 days)" };
    if (!res.ok) return WEB_ERROR;
    return (await res.json()) as ThisWeek;
  } catch {
    return WEB_ERROR;
  }
}

const ADVANCE_DOWN = "Could not load this. Try again later.";
const advanceError = (): AdvanceRisks => ({ weather: { status: "unavailable", message: ADVANCE_DOWN }, holidays: { status: "unavailable", message: ADVANCE_DOWN }, visa: { status: "unavailable", message: ADVANCE_DOWN }, equipment: { status: "unavailable", message: ADVANCE_DOWN }, generatedAt: "" });

/** Advance & risks for one city; a failed request becomes four "unavailable" sections. */
export async function fetchAdvance(q: { city: string; country: string; window: DateWindow; artistCountry?: string; lat?: number; lon?: number }, opts: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {}): Promise<AdvanceRisks> {
  const p = new URLSearchParams({ city: q.city, country: q.country, start: q.window.start, end: q.window.end });
  if (q.artistCountry?.trim()) p.set("artistCountry", q.artistCountry.trim());
  if (typeof q.lat === "number" && typeof q.lon === "number") { p.set("lat", String(q.lat)); p.set("lon", String(q.lon)); }
  try {
    const res = await (opts.fetchImpl ?? fetch)(`/api/qloo/advance?${p}`, { signal: opts.signal, headers: { "x-session-id": getSessionId() } });
    return res.ok ? ((await res.json()) as AdvanceRisks) : advanceError();
  } catch {
    return advanceError();
  }
}

/** Sponsors by age group for one artist and city. Always a live gateway read (a recorded run has no segment data), made only when asked for. Never throws. */
export async function fetchSponsorSegments(q: { artistId: string; artist?: string; city: string; country: string; cityId?: string; lat?: number; lon?: number }, opts: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {}): Promise<SponsorSegments> {
  const params = new URLSearchParams({ artistId: q.artistId, city: q.city, country: q.country });
  if (q.artist) params.set("artist", q.artist);
  if (q.cityId) params.set("cityId", q.cityId);
  if (typeof q.lat === "number" && typeof q.lon === "number") { params.set("lat", String(q.lat)); params.set("lon", String(q.lon)); }
  try {
    const res = await (opts.fetchImpl ?? fetch)(`/api/qloo/sponsor-segments?${params}`, { signal: opts.signal, headers: { "x-session-id": getSessionId() } });
    if (!res.ok) return SEGMENTS_ERROR;
    return parseSponsorSegments(await res.json());
  } catch {
    return SEGMENTS_ERROR;
  }
}

export async function callQlooTool(name: string, args: Record<string, unknown>, opts: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {}) {
  const res = await (opts.fetchImpl ?? fetch)(`/api/qloo/tools/${encodeURIComponent(name)}`, {
    method: "POST", signal: opts.signal,
    headers: { "content-type": "application/json", "x-session-id": getSessionId() },
    body: JSON.stringify(args),
  });
  let json: { envelope?: unknown; cached?: boolean; stale?: boolean; error?: string };
  try { json = (await res.json()) as typeof json; } catch { throw new Error("Qloo gateway unavailable"); }
  if (!res.ok) throw new Error(json.error ?? `tool ${name} failed: ${res.status}`);
  return { envelope: json.envelope, cached: Boolean(json.cached), stale: Boolean(json.stale) };
}
