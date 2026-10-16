import raw from "./fixtures/showcase.json";
import { recordedText } from "./labels";
import { ordinal } from "./ranking";
import type { GatewayEvent, ScoredCity, ThisWeek, TourBrief } from "./types";

/** One recorded Tour Board run (see scripts/record-showcase.mjs). `recordedAt: null` marks the committed placeholder built from the Lumen Vale sample. */
export interface Showcase {
  recordedAt: string | null;
  artist: string;
  brief: TourBrief;
  boardEvents: GatewayEvent[];
  playbooks: Record<string, GatewayEvent[]>;
  thisWeek: Record<string, ThisWeek>;
}

const KNOWN_EVENTS: ReadonlySet<string> = new Set([
  "resolve", "artist_profile", "region_unavailable", "needs_input", "tool_call", "tool_result", "region_empty",
  "city_scored", "playbook", "narrative", "strategist_thinking", "strategist_tool_call", "strategist_tool_result",
  "strategist_message", "strategist_error", "done", "error",
]);

/** Drops anything that is not a known gateway event, so an unexpected type in the JSON can never crash a replay. */
export function cleanEvents(events: unknown): GatewayEvent[] {
  if (!Array.isArray(events)) return [];
  return events.filter((e): e is GatewayEvent => !!e && typeof e === "object" && typeof (e as { type?: unknown }).type === "string" && KNOWN_EVENTS.has((e as { type: string }).type));
}

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
  };
}

export const SHOWCASE: Showcase = parseShowcase(raw);

export const showcaseBrief = (): TourBrief => SHOWCASE.brief;
export const showcaseBoardEvents = (): GatewayEvent[] => SHOWCASE.boardEvents;
export const showcasePlaybookEvents = (cityId: string): GatewayEvent[] | null => SHOWCASE.playbooks[cityId] ?? null;
export const showcaseThisWeek = (cityId: string): ThisWeek | null => SHOWCASE.thisWeek[cityId] ?? null;
export const showcaseBannerText = (): string => recordedText(SHOWCASE.recordedAt);

export function showcaseCities(show: Showcase = SHOWCASE): ScoredCity[] {
  return show.boardEvents.flatMap((e) => (e.type === "city_scored" ? [e.city] : []));
}
export const showcasePlaybookCities = (): ScoredCity[] => showcaseCities().filter((c) => SHOWCASE.playbooks[c.id]);

export interface Proof { city: ScoredCity; line: string }

/**
 * The Landing proof card. Ranks use the whole board (the Density tab's set) and only a strictly higher score
 * ranks ahead, so ties never count. Candidates are the cities with a recorded playbook (`withPlaybook`; all
 * scored cities when omitted), because the card links to that playbook. Picks the largest climb from the
 * fan-density rank to the winnability rank; with no climb, the top-winnability candidate with no claim about a shift.
 */
export function proofFor(all: ScoredCity[], withPlaybook?: readonly string[]): Proof | null {
  const scored = all.filter((c) => c.winnability.value !== null && c.fanHeat.value !== null);
  const pool = withPlaybook ? scored.filter((c) => withPlaybook.includes(c.id)) : scored;
  if (pool.length === 0) return null;
  const rankOf = (c: ScoredCity, key: "fanHeat" | "winnability") => 1 + scored.filter((x) => x[key].value! > c[key].value!).length;
  const rows = pool.map((c) => ({ city: c, d: rankOf(c, "fanHeat"), w: rankOf(c, "winnability") }));
  const best = rows.reduce((a, b) => (b.d - b.w > a.d - a.w ? b : a));
  if (best.d - best.w > 0) return { city: best.city, line: `Ranked ${ordinal(best.d)} on fan density alone. ${ordinal(best.w)} on winnability.` };
  const top = rows.reduce((a, b) => (b.w < a.w ? b : a));
  return { city: top.city, line: `Ranked ${ordinal(top.w)} of ${scored.length} scored ${scored.length === 1 ? "market" : "markets"} on winnability.` };
}
