import { boardRank, hasBothScores } from "./showcase";
import type { ComponentName, ScoredCity, ScoringConfig } from "./types";

/** One city's position on fan heat versus winnability. Ranks are 1-based over cities that have both scores. */
export interface Move {
  city: ScoredCity;
  fanRank: number;
  winRank: number;
  /** fanRank - winRank: positive = ranks higher on winnability, negative = lower, 0 = holds. */
  delta: number;
}

export const COMPONENT_WORDS: Record<ComponentName, string> = {
  sponsor_fit: "sponsor fit",
  local_hooks: "local culture fit",
  fan_concentration: "fans packed into a few neighbourhoods",
  venue_fit: "venue fit",
};
export const NO_DETAIL_LINE = "No activation detail recorded.";
export const MAJOR_MARKET_SUFFIX = " · major market, fan heat at the board's floor";
const COMPONENTS = Object.keys(COMPONENT_WORDS) as ComponentName[];

/** Every city with both scores, with its two ranks and the difference. Largest absolute move first; ties by winnability (higher first), then name. */
export function computeMoves(cities: ScoredCity[]): Move[] {
  const scored = cities.filter(hasBothScores);
  return scored
    .map((city) => {
      const fanRank = boardRank(scored, city, "fanHeat");
      const winRank = boardRank(scored, city, "winnability");
      return { city, fanRank, winRank, delta: fanRank - winRank };
    })
    .sort((a, b) =>
      Math.abs(b.delta) - Math.abs(a.delta) ||
      b.city.winnability.value! - a.city.winnability.value! ||
      a.city.name.localeCompare(b.city.name));
}

/** Cities Qloo could not place: they carry no scores and are listed in a footnote, never ranked. */
export const unplacedCities = (cities: ScoredCity[]): ScoredCity[] => cities.filter((c) => c.insufficientReason === "location_unresolved");

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const pct = (x: number) => Math.round(x * 100);

/**
 * The one line that explains a move. Compares each activation component (0-1) with the board median over
 * cities with both scores, weights the gap by the scoring weight (equal weights when none were streamed), and
 * names the component with the largest weighted gap. A climbing city prefers a component where it sits above
 * the median, a dropping city one where it sits below, so the line never reads against the move; if none
 * lines up it falls back to the largest gap overall.
 */
export function reasonFor(move: Move, cities: ScoredCity[], scoring?: Pick<ScoringConfig, "weights"> | null): string {
  const { city, delta } = move;
  const suffix = city.fanHeatFloor ? MAJOR_MARKET_SUFFIX : "";
  const own = city.activation.components;
  if (!own || delta === 0) return (own ? "" : NO_DETAIL_LINE) + suffix;
  const pool = cities.filter(hasBothScores);
  const gaps: Array<{ name: ComponentName; value: number; med: number; diff: number; weighted: number }> = [];
  for (const name of COMPONENTS) {
    const value = own[name];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const peers = pool.map((c) => c.activation.components?.[name]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (peers.length === 0) continue;
    const med = median(peers);
    const diff = value - med;
    gaps.push({ name, value, med, diff, weighted: Math.abs(diff) * (scoring?.weights?.[name] ?? 1) });
  }
  if (gaps.length === 0) return NO_DETAIL_LINE + suffix;
  const up = delta > 0;
  const aligned = gaps.filter((g) => (up ? g.diff > 0 : g.diff < 0));
  const best = (aligned.length > 0 ? aligned : gaps).reduce((a, b) => (b.weighted > a.weighted ? b : a));
  return `${up ? "Climbs" : "Drops"} on ${COMPONENT_WORDS[best.name]}: ${pct(best.value)} vs board median ${pct(best.med)}${suffix}`;
}
