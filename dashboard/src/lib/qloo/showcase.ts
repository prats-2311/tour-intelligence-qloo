import { recordedText } from "./labels";
import { distinctCountries } from "./routing";
import { PLACEHOLDER_SHOWCASE } from "./placeholderShowcase";
import { ordinal } from "./ranking";
import type { GatewayEvent, RoutingCity, ScoredCity, ThisWeek, TourBrief, WithoutQloo } from "./types";
import { parseWithoutQloo, WITHOUT_SHOWCASE_MISSING } from "./withoutQloo";

/** One recorded Tour Board run (see scripts/record-showcase.mjs). `recordedAt: null` marks the committed placeholder built from the Lumen Vale sample. */
export interface Showcase {
  recordedAt: string | null;
  artist: string;
  brief: TourBrief;
  boardEvents: GatewayEvent[];
  playbooks: Record<string, GatewayEvent[]>;
  thisWeek: Record<string, ThisWeek>;
  /** The recorded generic-LLM ranking; null when the recording predates it or it was malformed. */
  withoutQloo: WithoutQloo | null;
  /** The recorded "paste your cities" example (record-showcase.mjs --cities); null when the recording has none, which hides the "Try a routing" link. */
  routing: RoutingShowcase | null;
  /** Recorded "Ask about this tour" Q&As (record-showcase.mjs --questions); empty when the recording has none. */
  strategist: StrategistRecording[];
}
/** One recorded strategist turn: the question and every event the gateway streamed for it (reasoning summary, Qloo calls, answer). */
export interface StrategistRecording { question: string; events: GatewayEvent[] }
/** A second recorded board, run in pasted-cities mode: the cities that were pasted, the board stream, and playbooks for the top few. */
export interface RoutingShowcase { cities: RoutingCity[]; boardEvents: GatewayEvent[]; playbooks: Record<string, GatewayEvent[]> }

const KNOWN_EVENTS: ReadonlySet<string> = new Set([
  "resolve", "artist_profile", "region_unavailable", "needs_input", "tool_call", "tool_result", "region_empty",
  "routing_unmatched", "city_scored", "scoring", "playbook", "narrative", "strategist_thinking", "strategist_tool_call", "strategist_tool_result",
  "strategist_message", "strategist_error", "done", "error",
]);

/** Drops anything that is not a known gateway event, so an unexpected type in the JSON can never crash a replay. */
export function cleanEvents(events: unknown): GatewayEvent[] {
  if (!Array.isArray(events)) return [];
  return events.filter((e): e is GatewayEvent => !!e && typeof e === "object" && typeof (e as { type?: unknown }).type === "string" && KNOWN_EVENTS.has((e as { type: string }).type))
    .filter((e) => e.type !== "scoring" || (!!e.scoring && typeof e.scoring === "object" && !!e.scoring.thresholds && typeof e.scoring.thresholds === "object"));
}

/** The optional `routing` key: needs 1-8 `{name, country?}` cities and a non-empty board stream, otherwise there is no routing example. */
function parseRouting(input: unknown): RoutingShowcase | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (!Array.isArray(o.cities) || o.cities.length < 1 || o.cities.length > 8) return null;
  const cities: RoutingCity[] = [];
  for (const c of o.cities) {
    const x = c as { name?: unknown; country?: unknown } | null;
    if (!x || typeof x !== "object" || typeof x.name !== "string" || !x.name.trim() || (x.country !== undefined && typeof x.country !== "string")) return null;
    cities.push({ name: x.name, ...(x.country !== undefined ? { country: x.country as string } : {}) });
  }
  const boardEvents = cleanEvents(o.boardEvents);
  if (boardEvents.length === 0) return null;
  const playbooks: Record<string, GatewayEvent[]> = {};
  for (const [id, evs] of Object.entries((o.playbooks ?? {}) as Record<string, unknown>)) playbooks[id] = cleanEvents(evs);
  return { cities, boardEvents, playbooks };
}

/** The optional `strategist` key: keeps entries with a non-empty question and at least one known event; anything else is dropped. */
function parseStrategist(input: unknown): StrategistRecording[] {
  if (!Array.isArray(input)) return [];
  const out: StrategistRecording[] = [];
  for (const r of input) {
    const x = r as { question?: unknown; events?: unknown } | null;
    if (!x || typeof x !== "object" || typeof x.question !== "string" || !x.question.trim()) continue;
    const events = cleanEvents(x.events);
    if (events.length > 0) out.push({ question: x.question, events });
  }
  return out;
}

/** Question text compared case-, accent- and punctuation-insensitively in spacing only: letters (accents included) must match. */
export const normaliseQuestion = (q: string): string => q.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function parseShowcase(input: unknown): Showcase {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const playbooks: Record<string, GatewayEvent[]> = {};
  for (const [id, evs] of Object.entries((o.playbooks ?? {}) as Record<string, unknown>)) playbooks[id] = cleanEvents(evs);
  const brief = (o.brief ?? { artist: String(o.artist ?? ""), regions: [], maxStops: 8 }) as TourBrief;
  return {
    recordedAt: typeof o.recordedAt === "string" ? o.recordedAt : null,
    artist: typeof o.artist === "string" ? o.artist : brief.artist,
    brief,
    boardEvents: cleanEvents(o.boardEvents),
    playbooks,
    thisWeek: ((o.thisWeek ?? {}) as Record<string, ThisWeek>),
    withoutQloo: parseWithoutQloo(o.withoutQloo),
    routing: parseRouting(o.routing),
    strategist: parseStrategist(o.strategist),
  };
}

/**
 * The recorded run. The real recording is private (Qloo's terms keep response data out of the public repo), so it is
 * fetched at boot (see recordings.ts) and set with `setShowcase`; until then this holds the Lumen Vale placeholder
 * (`recordedAt: null`). It is a live binding: never copy it into a module-level constant, read it in render or a function.
 */
export let SHOWCASE: Showcase = parseShowcase(PLACEHOLDER_SHOWCASE);
export function setShowcase(s: Showcase): void { SHOWCASE = s; }
/** True once a real recording has been loaded (the placeholder has `recordedAt: null`). */
export const showcaseAvailable = (): boolean => SHOWCASE.recordedAt !== null;

/**
 * Which recording the accessors below read: the main example, or the recorded "paste your cities" routing (`?showcase=routing`).
 * Every page reads the active one through these accessors, so the board, playbook and book work on either without knowing which.
 * The app sets it from the URL on each navigation (`App`); tests set it directly. Asking for routing without one recorded means main.
 */
let variant: "main" | "routing" = "main";
export function setShowcaseVariant(v: "main" | "routing"): void { variant = v === "routing" && SHOWCASE.routing ? "routing" : "main"; }
/** What `?showcase=` asks for: "1" the main example, "routing" the recorded routing, anything else (or absent) neither. */
export const showcaseParam = (v: string | null): "main" | "routing" | null => (v === "1" ? "main" : v === "routing" ? "routing" : null);
/** The query that reopens the same recording: pages carry it from step to step. */
export const showcaseQuery = (routing: boolean): string => (routing ? "?showcase=routing" : "?showcase=1");
/** True for a brief that ran in pasted-cities mode (live, or the recorded routing). */
export const isRoutingBrief = (b: { cities?: unknown[] } | undefined): boolean => !!b?.cities?.length;
export const showcaseVariant = (): "main" | "routing" => variant;
/** The recorded Q&As of the main example (the routing example has none). */
export const showcaseStrategist = (): StrategistRecording[] => (variant === "routing" ? [] : SHOWCASE.strategist);
export const recordedQuestion = (text: string): StrategistRecording | null => {
  const n = normaliseQuestion(text);
  return n ? showcaseStrategist().find((r) => normaliseQuestion(r.question) === n) ?? null : null;
};
export const showcaseRoutingAvailable = (): boolean => SHOWCASE.routing !== null;
export type ShowcaseVariant = "main" | "routing";
/** The routing recording when `v` (default: the URL-driven variant) asks for it and one exists. Pages holding a run pass the run's own variant. */
const routing = (v: ShowcaseVariant = variant): RoutingShowcase | null => (v === "routing" ? SHOWCASE.routing : null);
/** Regions of a pasted run are the countries of its cities (the recorded routing carries no regions of its own). */
const routingBrief = (r: RoutingShowcase): TourBrief => {
  const cs = r.boardEvents.flatMap((e) => (e.type === "city_scored" ? [e.city] : []));
  return { artist: SHOWCASE.artist, regions: distinctCountries(cs), maxStops: r.cities.length, cities: r.cities };
};
const routingBriefMemo = new WeakMap<RoutingShowcase, TourBrief>();

export const showcaseBrief = (v?: ShowcaseVariant): TourBrief => {
  const r = routing(v);
  if (!r) return SHOWCASE.brief;
  if (!routingBriefMemo.has(r)) routingBriefMemo.set(r, routingBrief(r));
  return routingBriefMemo.get(r)!;
};
export const showcaseBoardEvents = (v?: ShowcaseVariant): GatewayEvent[] => routing(v)?.boardEvents ?? SHOWCASE.boardEvents;
export const showcasePlaybookEvents = (cityId: string, v?: ShowcaseVariant): GatewayEvent[] | null => (routing(v)?.playbooks ?? SHOWCASE.playbooks)[cityId] ?? null;
export const showcaseThisWeek = (cityId: string, v?: ShowcaseVariant): ThisWeek | null => (routing(v) ? null : SHOWCASE.thisWeek[cityId] ?? null);
export const showcaseWithoutQloo = (v?: ShowcaseVariant): WithoutQloo => (routing(v) ? WITHOUT_SHOWCASE_MISSING : SHOWCASE.withoutQloo ?? WITHOUT_SHOWCASE_MISSING);
/** The variant a held run belongs to: a recorded routing run carries pasted cities in its brief. */
export const variantOfBrief = (b: { cities?: unknown[] } | undefined): ShowcaseVariant => (b?.cities?.length ? "routing" : "main");

export const showcaseBannerText = (): string => recordedText(SHOWCASE.recordedAt);

export function showcaseCities(show?: Showcase, v?: ShowcaseVariant): ScoredCity[] {
  return (show ? show.boardEvents : showcaseBoardEvents(v)).flatMap((e) => (e.type === "city_scored" ? [e.city] : []));
}
export const showcasePlaybookCities = (v?: ShowcaseVariant): ScoredCity[] => showcaseCities(undefined, v).filter((c) => showcasePlaybookEvents(c.id, v));

/** "Fan density ranks it 4th of 8. Adding winnability puts it 2nd." Descriptive only: it says nothing about which ranking is better. */
export const rankShiftLine = (fanRank: number, winRank: number, n: number): string =>
  `Fan density ranks it ${ordinal(fanRank)} of ${n}. Adding winnability ${fanRank === winRank ? "keeps" : "puts"} it ${ordinal(winRank)}.`;

export interface Proof { city: ScoredCity; line: string }

/** Whole-board rank of a city on fan density or winnability (1 = best); only a strictly higher score ranks ahead. `scored` holds cities with both scores. */
export const boardRank = (scored: ScoredCity[], c: ScoredCity, key: "fanHeat" | "winnability"): number => 1 + scored.filter((x) => x[key].value! > c[key].value!).length;
export const hasBothScores = (c: ScoredCity): boolean => c.winnability.value !== null && c.fanHeat.value !== null;

/**
 * The Landing proof card. Ranks use the whole board (the Density tab's set) and only a strictly higher score
 * ranks ahead, so ties never count. Candidates are the cities with a recorded playbook (`withPlaybook`; all
 * scored cities when omitted), because the card links to that playbook. Picks the largest climb from the
 * fan-density rank to the winnability rank; with no climb, the top-winnability candidate with no claim about a shift.
 */
export function proofFor(all: ScoredCity[], withPlaybook?: readonly string[]): Proof | null {
  const scored = all.filter(hasBothScores);
  const pool = withPlaybook ? scored.filter((c) => withPlaybook.includes(c.id)) : scored;
  if (pool.length === 0) return null;
  const rankOf = (c: ScoredCity, key: "fanHeat" | "winnability") => boardRank(scored, c, key);
  const rows = pool.map((c) => ({ city: c, d: rankOf(c, "fanHeat"), w: rankOf(c, "winnability") }));
  const best = rows.reduce((a, b) => (b.d - b.w > a.d - a.w ? b : a));
  if (best.d - best.w > 0) return { city: best.city, line: rankShiftLine(best.d, best.w, scored.length) };
  const top = rows.reduce((a, b) => (b.w < a.w ? b : a));
  return { city: top.city, line: `Ranked ${ordinal(top.w)} of ${scored.length} scored ${scored.length === 1 ? "market" : "markets"} on winnability.` };
}
