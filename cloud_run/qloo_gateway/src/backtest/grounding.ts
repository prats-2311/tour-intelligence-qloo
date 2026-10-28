import { normaliseName } from "../claims/verify.js";
import type { BudgetGuard } from "../budget.js";
import type { City } from "../geo/cities.js";
import { generateJson, type GenerateFn } from "../narrative/gemini.js";
import { runCityPlaybook } from "../pipeline/cityPlaybook.js";
import { suggestLocalActs } from "../pipeline/localActs.js";
import type { PlaybookCard } from "../types.js";
import type { GroundArm, GroundCategory } from "./proofResults.js";
import { resolve, sep } from "node:path";
import { REPO_ROOT } from "./proofCli.js";
import { countryLabel, memoQloo, monitoredCallTool, retryingGenerate, type CallTool } from "./proofShared.js";
import { sha256Hex, StopMonitor, StopRun } from "./proofStats.js";

/**
 * Test C, grounding (docs/qloo/proof-v3-protocol.md, Amendment 4): do the venues, sponsor brands and local acts in a playbook exist in the city?
 * Arm (a) is the City Playbook pipeline as shipped; arm (b) is one Gemini call with no Qloo data. Their names go to a blinded review sheet.
 */
export type { GroundArm, GroundCategory };
export const CAPS: Record<GroundCategory, number> = { venue: 4, brand: 4, local_act: 3 };
/** The protocol's expected list. If the recorded board differs, the recorded board wins and the difference is reported. */
export const EXPECTED_CITIES: readonly string[] = ["Portland", "Austin", "Los Angeles", "New York City", "Mexico City", "Guadalajara", "São Paulo", "Salvador", "Fortaleza"];
export const MAX_CITIES = 10;

export interface GroundCity { id: string; name: string; country: string; lat: number; lon: number }
export interface GroundItem { cityId: string; city: string; country: string; category: GroundCategory; arm: GroundArm; name: string; rank: number }
export interface GroundRow { id: string; cityId: string; city: string; country: string; category: GroundCategory; name: string; arms: GroundArm[] }
/** The private arm key: row id to arms (and the row's city and category, so the scorer needs nothing else). */
export interface GroundKey { /** Shared with the items file; the scorer refuses a mismatch. */ runId?: string; rows: Record<string, Omit<GroundRow, "id">> }
export interface CityStatus { cityId: string; city: string; country: string; qloo: "ok" | "excluded" | "not_run"; qlooReason?: string; llm: "ok" | "no_answer" | "not_run" }
export interface GroundItemsFile {
  schemaVersion: 1; runId?: string; generatedAt: string; protocolCommit: string; artist: string; models: string[]; geminiUsed: string[];
  callCounts: { qloo: number; gemini: number; qlooErrors: number; geminiErrors: number };
  stop: { status: "running" | "complete" | "stopped"; reason?: string };
  cityDifference: { missing: string[]; extra: string[] };
  excluded: Array<{ cityId: string; city: string; reason: string; code?: string }>;
  notRun: Array<{ cityId: string; city: string; reason?: string }>;
  cities: CityStatus[];
  items: GroundItem[];
}

// City selection -------------------------------------------------------------------------------------------------------------------

interface ScoredEvent { type?: string; city?: { id?: unknown; name?: unknown; country?: unknown; lat?: unknown; lon?: unknown; fanHeat?: { value?: unknown }; winnability?: { value?: unknown } } }
export interface ShowcaseLike { artist?: unknown; boardEvents?: unknown }

/** Every city on the recorded board with both a fan-heat and a winnability score, ordered by sha256(city id) ascending, at most 10. */
export function selectCities(showcase: ShowcaseLike): { artist: { name: string; entityId: string }; cities: GroundCity[]; difference: { missing: string[]; extra: string[] } } {
  const events = (Array.isArray(showcase.boardEvents) ? showcase.boardEvents : []) as Array<ScoredEvent & { entity?: { entityId?: unknown; name?: unknown } }>;
  const resolved = events.find((e) => e.type === "resolve")?.entity;
  const entityId = resolved?.entityId;
  if (typeof entityId !== "string" || entityId === "") throw new Error("the recording has no resolved artist (no resolve event)");
  const name = typeof resolved?.name === "string" && resolved.name !== "" ? resolved.name : typeof showcase.artist === "string" ? showcase.artist : "";
  if (name === "") throw new Error("the recording has no artist name");
  const seen = new Set<string>();
  const all: GroundCity[] = [];
  for (const e of events) {
    if (e.type !== "city_scored" || !e.city) continue;
    const c = e.city;
    if (typeof c.id !== "string" || typeof c.name !== "string" || typeof c.country !== "string" || typeof c.lat !== "number" || typeof c.lon !== "number") continue;
    if (typeof c.fanHeat?.value !== "number" || typeof c.winnability?.value !== "number") continue;
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    all.push({ id: c.id, name: c.name, country: c.country, lat: c.lat, lon: c.lon });
  }
  const cities = all.sort((a, b) => (sha256Hex(a.id) < sha256Hex(b.id) ? -1 : sha256Hex(a.id) > sha256Hex(b.id) ? 1 : 0)).slice(0, MAX_CITIES);
  const got = new Set(cities.map((c) => normaliseName(c.name)));
  const want = new Set(EXPECTED_CITIES.map(normaliseName));
  return {
    artist: { name, entityId }, cities,
    difference: { missing: EXPECTED_CITIES.filter((n) => !got.has(normaliseName(n))), extra: cities.filter((c) => !want.has(normaliseName(c.name))).map((c) => c.name) },
  };
}

// Qloo arm -------------------------------------------------------------------------------------------------------------------------

const CARD_FOR: Record<string, GroundCategory> = { venue_fit: "venue", sponsors: "brand", talent: "local_act" };

/** Venue, sponsor and local-act card items in card order, capped at 4, 4 and 3. Fewer items than the cap are kept as they are. */
export function extractQlooItems(cards: Array<Pick<PlaybookCard, "kind"> & { items?: unknown }>): Record<GroundCategory, string[]> {
  const out: Record<GroundCategory, string[]> = { venue: [], brand: [], local_act: [] };
  for (const card of cards) {
    const category = CARD_FOR[card.kind];
    if (!category) continue;
    out[category] = cleanNames((Array.isArray(card.items) ? card.items : []).map((i) => (i as { name?: unknown } | null)?.name), CAPS[category]);
  }
  return out;
}

/** Trim, drop blanks and non-strings and repeats (folded), keep the first `cap`. */
function cleanNames(raw: unknown[], cap: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    const key = normaliseName(t);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= cap) break;
  }
  return out;
}

// LLM arm --------------------------------------------------------------------------------------------------------------------------

const strArray = (maxItems: number) => ({ type: "ARRAY", maxItems, items: { type: "STRING" } });
export const LLM_SCHEMA = {
  type: "OBJECT", required: ["venues", "brands", "local_acts"],
  properties: { venues: strArray(CAPS.venue), brands: strArray(CAPS.brand), local_acts: strArray(CAPS.local_act) },
};

/** The fixed prompt of Amendment 4, verbatim. */
export const llmPrompt = (artist: string, city: string, country: string): string =>
  `You are planning a concert in ${city}, ${country} for ${artist}. List up to 4 real music venues in ${city}, up to 4 real brands that could sponsor the show, and up to 3 real local artists from ${city} who could open. Only names that exist in ${city}.`;

export type LlmAnswer = { status: "ok"; model: string } & Record<GroundCategory, string[]> | { status: "no_answer"; reason: string; model?: string };

function parseLlm(json: unknown): Record<GroundCategory, string[]> | null {
  const o = json as { venues?: unknown; brands?: unknown; local_acts?: unknown } | null;
  if (!o || typeof o !== "object") return null;
  const lists = [o.venues, o.brands, o.local_acts];
  if (!lists.every((l) => Array.isArray(l) && l.every((x) => typeof x === "string"))) return null;
  return { venue: cleanNames(o.venues as string[], CAPS.venue), brand: cleanNames(o.brands as string[], CAPS.brand), local_act: cleanNames(o.local_acts as string[], CAPS.local_act) };
}

/**
 * One Gemini call at temperature 0.2 with the schema above (Amendment 3 retries via `retryingGenerate`). Invalid JSON or a wrong shape is retried once,
 * then recorded as no answer. Every model failing after its retries halts the run (an infrastructure failure, not "no answer") and throws StopRun.
 */
export async function askLlm(input: { artist: string; city: string; country: string }, deps: { generate: GenerateFn; models: string[]; monitor: StopMonitor; sleep?: (ms: number) => Promise<void> }): Promise<LlmAnswer> {
  const { monitor } = deps;
  const generate = retryingGenerate({ generate: deps.generate, monitor, ...(deps.sleep ? { sleep: deps.sleep } : {}) });
  const body = {
    contents: [{ role: "user", parts: [{ text: llmPrompt(input.artist, input.city, input.country) }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.2, responseSchema: LLM_SCHEMA },
  };
  let model: string | undefined;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let json: unknown;
    try {
      const r = await generateJson(generate, deps.models, body, { beforeAttempt: () => monitor.assertOk() });
      model = r.model;
      json = r.json;
    } catch (err) {
      if (err instanceof StopRun) throw err;
      monitor.assertOk();
      if (!(err instanceof SyntaxError)) {
        monitor.halt(`all Gemini models failed (${String((err as Error)?.message ?? err)})`);
        monitor.assertOk();
      }
    }
    const parsed = json === undefined ? null : parseLlm(json);
    if (parsed) return { status: "ok", model: model!, ...parsed };
  }
  return { status: "no_answer", reason: "invalid_json_twice", ...(model ? { model } : {}) };
}

/** The de-duplication key for a name: `normaliseName` with "&" read as "and" (sheet only; claims/verify.ts is untouched). */
export const dedupeKey = (name: string): string => normaliseName(name.replace(/&/g, " and "));

// Rows -----------------------------------------------------------------------------------------------------------------------------

/**
 * One row per (city, category, normalised name); a name both arms gave is one row crediting both. The shown name is the smallest of the
 * spellings given, so it does not depend on input order. Rows are sorted by sha256(city + category + name) and numbered in that order.
 */
export function buildRows(items: GroundItem[]): GroundRow[] {
  const groups = new Map<string, Omit<GroundRow, "id" | "arms"> & { arms: Set<GroundArm> }>();
  for (const it of items) {
    const norm = dedupeKey(it.name);
    if (norm === "") continue;
    const key = `${it.cityId}\u0000${it.category}\u0000${norm}`;
    const g = groups.get(key);
    if (!g) groups.set(key, { cityId: it.cityId, city: it.city, country: it.country, category: it.category, name: it.name, arms: new Set([it.arm]) });
    else { g.arms.add(it.arm); if (it.name < g.name) g.name = it.name; }
  }
  const rows = [...groups.values()].map((g) => ({ ...g, arms: [...g.arms].sort() as GroundArm[], hash: sha256Hex(g.city + g.category + g.name) }));
  rows.sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : a.cityId < b.cityId ? -1 : a.cityId > b.cityId ? 1 : 0));
  return rows.map(({ hash: _h, ...r }, i) => ({ id: `r${String(i + 1).padStart(3, "0")}`, ...r }));
}

export function buildKey(rows: GroundRow[], runId?: string): GroundKey {
  return { ...(runId ? { runId } : {}), rows: Object.fromEntries(rows.map(({ id, ...rest }) => [id, rest])) };
}

// Runner ---------------------------------------------------------------------------------------------------------------------------

export interface GroundPlan { artist: { name: string; entityId: string }; cities: GroundCity[] }
export interface GroundDeps {
  callTool: CallTool; generate: GenerateFn; models: string[]; monitor: StopMonitor; cities: City[]; log: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
  /** The playbook pipeline; real by default, replaceable in tests. */
  playbook?: typeof runCityPlaybook;
  /** Gateway calls allowed for the whole run (default QLOO_CEILING); reaching it stops the run. */
  qlooCeiling?: number;
}

/** Amendment 6: a run budget of 260 gateway calls. It counts every call, cached answers included; it is not the protocol's estimate (about 60-110 real calls). */
export const QLOO_CEILING = 260;
export interface GroundRun {
  items: GroundItem[]; cityStatus: CityStatus[];
  excluded: Array<{ cityId: string; city: string; reason: string; code: string }>;
  notRun: Array<{ cityId: string; city: string; reason?: string }>;
  stop?: string; geminiUsed: string[];
}

const NO_CEILING = { reserve: () => {} } as unknown as BudgetGuard;

/**
 * Per city: the shipped playbook in-process (deps.qloo = the monitored gateway caller, session `proof-v3-ground-<city id>`, narrative off, the city's id
 * and coordinates passed so the location check matches), then the LLM arm. A city whose playbook ends in an error is excluded for both arms and listed.
 * A stop (Amendment 3 rule) ends the run: the partly done city is dropped and listed with the cities not yet run.
 */
export async function runGrounding(plan: GroundPlan, deps: GroundDeps, onProgress?: (run: GroundRun) => void): Promise<GroundRun> {
  const { monitor } = deps;
  const playbook = deps.playbook ?? runCityPlaybook;
  const items: GroundItem[] = [];
  const cityStatus: CityStatus[] = plan.cities.map((c) => ({ cityId: c.id, city: c.name, country: c.country, qloo: "not_run", llm: "not_run" }));
  const excluded: GroundRun["excluded"] = [];
  const notRun: GroundRun["notRun"] = [];
  const used = new Set<string>();
  let stop: string | undefined;
  const snapshot = (): GroundRun => ({ items: [...items], cityStatus: cityStatus.map((s) => ({ ...s })), excluded: [...excluded], notRun: [...notRun], ...(stop ? { stop } : {}), geminiUsed: [...used] });

  // Every real Gemini attempt passes the tracker once. The retry-and-count wrapper (Amendment 3) is applied exactly once on top of it, by each user:
  // `askLlm` for the LLM arm and `suggestGenerate` for the playbook's local-act suggestions.
  let failuresInRow = 0;
  const tracked: GenerateFn = async (model, body) => {
    try { const r = await deps.generate(model, body); used.add(model); failuresInRow = 0; return r; } catch (err) { failuresInRow += 1; throw err; }
  };
  const suggestGenerate = retryingGenerate({ generate: tracked, monitor, ...(deps.sleep ? { sleep: deps.sleep } : {}) });
  const ceiling = deps.qlooCeiling ?? QLOO_CEILING;
  const capped: CallTool = async (name, args, session) => {
    if (monitor.counts.qloo >= ceiling) monitor.halt(`Qloo call ceiling of ${ceiling} reached`);
    return monitoredCallTool(deps.callTool, monitor)(name, args, session);
  };

  for (const [index, city] of plan.cities.entries()) {
    if (monitor.stopped) { stop = monitor.stopped; }
    if (stop) {
      for (const rest of plan.cities.slice(index)) notRun.push({ cityId: rest.id, city: rest.name, reason: "stopped before this city" });
      break;
    }
    const status = cityStatus[index]!;
    const qloo = memoQloo(capped);
    const sessionId = `proof-v3-ground-${city.id}`;
    deps.log(`[${index + 1}/${plan.cities.length}] ${city.name}, ${city.country}: Qloo playbook (session ${sessionId})`);
    failuresInRow = 0;
    let cards: PlaybookCard[] | undefined;
    let failure: { code: string; message: string } | undefined;
    for await (const ev of playbook(
      { artist: plan.artist.name, artistEntityId: plan.artist.entityId, city: { name: city.name, country: city.country, id: city.id, lat: city.lat, lon: city.lon }, sessionId, narrative: false },
      {
        qloo, cities: deps.cities,
        localActs: async (input) => {
          const names = await suggestLocalActs(input, { generate: suggestGenerate, models: deps.models, ceiling: { ceiling: NO_CEILING } });
          // suggestLocalActs swallows errors; a total failure (every model, after retries) is an infrastructure failure and stops the run.
          if (names === null && failuresInRow >= deps.models.length) monitor.halt("all Gemini models failed (local act suggestions)");
          return names;
        },
      },
    )) {
      if (ev.type === "playbook") cards = (ev.playbook as { cards: PlaybookCard[] }).cards;
      else if (ev.type === "error") failure = { code: ev.code, message: ev.message };
    }
    if (monitor.stopped) {
      stop = monitor.stopped;
      notRun.push({ cityId: city.id, city: city.name, reason: "stopped while this city was running; its partial data was dropped" });
      for (const rest of plan.cities.slice(index + 1)) notRun.push({ cityId: rest.id, city: rest.name, reason: "stopped before this city" });
      break;
    }
    if (!cards) {
      const reason = failure ? `${failure.code}: ${failure.message}` : "no playbook returned";
      status.qloo = "excluded"; status.qlooReason = reason;
      excluded.push({ cityId: city.id, city: city.name, reason, code: failure?.code ?? "NO_PLAYBOOK" });
      deps.log(`  excluded: ${reason}`);
      onProgress?.(snapshot());
      continue;
    }
    const q = extractQlooItems(cards);
    const cityItems: GroundItem[] = [];
    for (const category of ["venue", "brand", "local_act"] as const) {
      q[category].forEach((name, i) => cityItems.push({ cityId: city.id, city: city.name, country: city.country, category, arm: "qloo", name, rank: i + 1 }));
    }

    deps.log(`  LLM-only list`);
    let answer: LlmAnswer;
    try {
      answer = await askLlm({ artist: plan.artist.name, city: city.name, country: countryLabel(city.country) }, { generate: tracked, models: deps.models, monitor, ...(deps.sleep ? { sleep: deps.sleep } : {}) });
    } catch (err) {
      if (!(err instanceof StopRun)) throw err;
      stop = monitor.stopped ?? err.reason;
      notRun.push({ cityId: city.id, city: city.name, reason: "stopped while this city was running; its partial data was dropped" });
      for (const rest of plan.cities.slice(index + 1)) notRun.push({ cityId: rest.id, city: rest.name, reason: "stopped before this city" });
      break;
    }
    status.qloo = "ok";
    if (answer.status === "ok") {
      status.llm = "ok";
      for (const category of ["venue", "brand", "local_act"] as const) {
        answer[category].forEach((name, i) => cityItems.push({ cityId: city.id, city: city.name, country: city.country, category, arm: "llm", name, rank: i + 1 }));
      }
    } else status.llm = "no_answer";
    items.push(...cityItems);
    onProgress?.(snapshot());
  }
  return snapshot();
}

/** Test C writes Qloo-derived names: only inside `<repo>/private-data/backtest/`, with no override (not even a path outside the repo). */
export function groundingOut(path: string): string {
  const abs = resolve(path);
  const dir = resolve(REPO_ROOT, "private-data/backtest");
  if (abs !== dir && !abs.startsWith(dir + sep)) throw new Error(`Test C outputs go under private-data/backtest/ only (got ${abs})`);
  return abs;
}
