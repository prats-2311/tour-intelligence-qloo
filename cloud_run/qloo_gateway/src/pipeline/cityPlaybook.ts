import { extractEntities } from "../extract.js";
import type { City } from "../geo/cities.js";
import type { CallResult, QlooCaller } from "../qlooCall.js";
import { coBillLift } from "../scoring/winnability.js";
import type { DataWarning, EvidenceRef, GatewayEvent } from "../types.js";
import { activationInputs, Aborted, BudgetStop, trackedCall } from "./tourBoard.js";

export interface PlaybookCard<T> {
  kind: "sponsors" | "promo_zones" | "local_moment" | "venue_fit" | "co_billing";
  status: "ok" | "empty";
  items: T[];
  refs: EvidenceRef[];
  warnings: DataWarning[];
}

function overlapOf(results: unknown): number {
  const r = results as Record<string, unknown> | undefined;
  const v = r && typeof r === "object" ? (r.overlap ?? r.similarity ?? r.score) : undefined;
  return typeof v === "number" && Number.isFinite(v) ? v : Number.NaN;
}

function warningsFor(tool: string, r: CallResult): DataWarning[] {
  const e = r.envelope;
  const out: DataWarning[] = [];
  if (e.status === "error") {
    const message = e.summary ?? e.error?.recovery;
    out.push({ tool, kind: "error", ...(e.error?.code ? { code: e.error.code } : {}), ...(message ? { message } : {}) });
  } else if (e.status === "partial" || e.status === "degraded") {
    out.push({ tool, kind: e.status, ...(e.summary ? { message: e.summary } : {}) });
  }
  if (r.stale) out.push({ tool, kind: "stale" });
  return out;
}

const dedupe = (ws: DataWarning[]): DataWarning[] => [...new Map(ws.map((w) => [JSON.stringify(w), w])).values()];

function card<T>(kind: PlaybookCard<T>["kind"], items: T[], refs: EvidenceRef[], warnings: DataWarning[]): PlaybookCard<T> {
  return { kind, status: items.length > 0 ? "ok" : "empty", items, refs, warnings: dedupe(warnings) };
}

export async function* runCityPlaybook(
  input: { artist: string; artistEntityId: string; city: { name: string; country: string }; sessionId: string },
  deps: { qloo: QlooCaller; cities: City[]; signal?: AbortSignal },
): AsyncGenerator<GatewayEvent> {
  const events: GatewayEvent[] = [];
  try {
    const a = await activationInputs(input.artistEntityId, input.city, deps, input.sessionId, events);
    while (events.length) yield events.shift()!;
    const ref = (tool: string, r: { cacheKey: string }) => ({ tool, cacheKey: r.cacheKey });

    const candidates = extractEntities(a.raw.artists.envelope).slice(0, 3);
    const settled = await Promise.allSettled(candidates.map(async (c) => {
      const r = await trackedCall(deps, input.sessionId, "qloo_compare_audiences", { group_a: [input.artistEntityId], group_b: [c.entityId] }, events);
      const warnings = warningsFor("qloo_compare_audiences", r);
      const overlap = overlapOf(r.envelope.results);
      if (Number.isNaN(overlap) || Number.isNaN(c.affinity)) return { warnings };
      return { warnings, lift: { name: c.name, entityId: c.entityId, overlap, localAffinity: c.affinity, lift: coBillLift(overlap, c.affinity), ref: ref("qloo_compare_audiences", r) } };
    }));
    while (events.length) yield events.shift()!;
    const bad = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected").map((s) => s.reason);
    if (bad.length) throw bad.find((b) => b instanceof Aborted || b instanceof BudgetStop) ?? bad[0];
    const compared = settled.map((s) => (s as PromiseFulfilledResult<{ warnings: DataWarning[]; lift?: { name: string; entityId: string; overlap: number; localAffinity: number; lift: number; ref: EvidenceRef } }>).value);
    const coBill = compared.flatMap((c) => (c.lift ? [c.lift] : [])).sort((x, y) => y.lift - x.lift);

    const { raw } = a;
    const cards: PlaybookCard<unknown>[] = [
      card("sponsors", extractEntities(raw.brands.envelope), [ref("qloo_recommend", raw.brands)], warningsFor("qloo_recommend", raw.brands)),
      card("promo_zones", a.zones.slice(0, 5), [ref("qloo_where_popular", raw.inCity)], warningsFor("qloo_where_popular", raw.inCity)),
      card("local_moment",
        [...extractEntities(raw.artists.envelope), ...extractEntities(raw.films.envelope), ...extractEntities(raw.tv.envelope), ...extractEntities(raw.places.envelope)].slice(0, 9),
        [ref("qloo_recommend", raw.artists), ref("qloo_recommend", raw.films), ref("qloo_recommend", raw.tv), ref("qloo_recommend", raw.places)],
        [raw.artists, raw.films, raw.tv, raw.places].flatMap((r) => warningsFor("qloo_recommend", r))),
      card("venue_fit", raw.ranked ? extractEntities(raw.ranked.envelope).slice(0, 3) : [], raw.ranked ? [ref("qloo_rank", raw.ranked)] : [],
        raw.ranked ? warningsFor("qloo_rank", raw.ranked) : []),
      card("co_billing", coBill, coBill.map((c) => c.ref), compared.flatMap((c) => c.warnings)),
    ];
    yield { type: "playbook", playbook: { city: input.city, cards } };
    yield { type: "done", summary: { city: input.city.name } };
  } catch (err) {
    while (events.length) yield events.shift()!;
    if (err instanceof Aborted) { yield { type: "error", code: "ABORTED", message: "client disconnected" }; return; }
    if (err instanceof BudgetStop) { yield { type: "error", code: "BUDGET", message: err.message }; return; }
    yield { type: "error", code: "INTERNAL", message: String((err as Error)?.message ?? err) };
  }
}
