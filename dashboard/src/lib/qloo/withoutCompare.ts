import { boardRank } from "./showcase";
import type { ScoredCity } from "./types";

export type CompareFlag = "not_on_board" | "unplaced" | "skip" | "capped" | "moved" | "agrees";

export interface CompareRow {
  llmRank: number;
  name: string;
  country: string;
  city?: ScoredCity;
  /** Winnability rank among the cities that have a winnability value (1-based; ties share a rank). */
  qlooRank?: number;
  flag: CompareFlag;
  /** Only on `moved`: where Qloo puts the city relative to the LLM. */
  direction?: "up" | "down";
}

export const FLAG_TEXT: Record<Exclude<CompareFlag, "agrees" | "moved">, string> = {
  not_on_board: "Not on Qloo's board",
  unplaced: "Qloo couldn't score it",
  skip: "Qloo says Skip",
  capped: "Capped: no Qloo fan-heat evidence",
};

/** The gap (in places) from which the LLM's position counts as a disagreement. */
export const MOVED_BY = 3;

const fold = (v: string): string => v.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
// Accent and case folding plus a trailing " city" — no other aliases.
const key = (name: string, country: string): string => `${fold(name).replace(/ city$/, "")}|${fold(country)}`;

/** Joins the generic LLM's order with the Qloo board. A pure display join: no calls, LLM order kept. */
export function compareWithQloo(ranked: ReadonlyArray<{ name: string; country: string }>, cities: readonly ScoredCity[]): CompareRow[] {
  const byKey = new Map<string, ScoredCity>();
  for (const c of cities) { const k = key(c.name, c.country); if (!byKey.has(k)) byKey.set(k, c); }
  const scored = cities.filter((c) => c.winnability.value !== null);
  return ranked.map((r, i): CompareRow => {
    const llmRank = i + 1;
    const city = byKey.get(key(r.name, r.country));
    const base = { llmRank, name: r.name, country: r.country };
    if (!city) return { ...base, flag: "not_on_board" };
    const qlooRank = city.winnability.value === null ? undefined : boardRank(scored, city, "winnability");
    if (city.insufficientReason === "location_unresolved" || city.verdict === "insufficient_data") return { ...base, city, qlooRank, flag: "unplaced" };
    if (city.verdict === "skip") return { ...base, city, qlooRank, flag: "skip" };
    if (city.fanHeatFloor === true && city.verdict === "consider") return { ...base, city, qlooRank, flag: "capped" };
    if (qlooRank !== undefined && Math.abs(llmRank - qlooRank) >= MOVED_BY) return { ...base, city, qlooRank, flag: "moved", direction: qlooRank < llmRank ? "up" : "down" };
    return { ...base, city, qlooRank, flag: "agrees" };
  });
}

/** The one line above the comparison list, counted from the flags. */
export function disagreementLine(rows: readonly CompareRow[]): string {
  const n = (f: CompareFlag) => rows.filter((r) => r.flag === f).length;
  const parts: Array<[number, string]> = [
    [n("not_on_board"), "not on Qloo's board"], [n("capped"), "capped"], [n("skip"), "Skip"],
    [n("unplaced"), "couldn't be scored"], [n("moved"), "moved"],
  ];
  const total = parts.reduce((s, [c]) => s + c, 0);
  if (total === 0) return "Qloo agrees with this order — the difference is in each city's playbook.";
  return `Qloo disagrees on ${total} of ${rows.length}: ${parts.filter(([c]) => c > 0).map(([c, t]) => `${c} ${t}`).join(", ")}.`;
}
