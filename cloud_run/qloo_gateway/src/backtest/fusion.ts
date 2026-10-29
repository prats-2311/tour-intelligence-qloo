import { rPrecision } from "./cityRank.js";
import { computeCityRankStats, type CityRankArtist, type CityRankStats, type FixedCaseResult, type FixedStats, type SignRow } from "./proofResults.js";
import { mean, signTest } from "./proofStats.js";

/**
 * Amendment 7 (docs/qloo/proof-v3-protocol.md): Gemini + Qloo combined, offline, on the rankings already stored for Test A and B.
 * The rule is fixed in advance: reciprocal rank fusion, k = 60, ties broken by the LLM's rank. No alternative is implemented.
 */
export const RRF_K = 60;

/** `a` is the LLM's ranking (it breaks ties), `b` is Qloo's. An item absent from a list contributes 0 for that list. */
export function rrf(a: string[], b: string[], k: number = RRF_K): string[] {
  const rankA = new Map(a.map((x, i) => [x, i + 1] as const));
  const rankB = new Map(b.map((x, i) => [x, i + 1] as const));
  const items = [...new Set([...a, ...b])];
  const score = (x: string) => (rankA.has(x) ? 1 / (k + rankA.get(x)!) : 0) + (rankB.has(x) ? 1 / (k + rankB.get(x)!) : 0);
  const EPS = 1e-12;
  return items
    .map((x, i) => ({ x, i, s: score(x) }))
    .sort((p, q) => (Math.abs(p.s - q.s) > EPS ? q.s - p.s : (rankA.get(p.x) ?? Infinity) - (rankA.get(q.x) ?? Infinity) || p.i - q.i))
    .map((e) => e.x);
}

export type Sign = SignRow;
const sign = (pairs: Array<[number, number]>): Sign => ({ ...signTest(pairs), pairs: pairs.length });

/** The protocol's claim rule: mean higher AND more wins than losses AND p < 0.05. */
export function claimMet(fusionMean: number | null, refMean: number | null, t: Sign): boolean {
  return fusionMean !== null && refMean !== null && t.pairs > 0 && fusionMean > refMean && t.wins > t.losses && t.p < 0.05;
}

export interface Exclusion { id: string; reason: string }
/** One scored unit: a Test B case or a Test A artist. `scores` has every arm (null where an arm has no answer) and `fusion`. */
export interface FusionRow { id: string; model?: string; scores: Record<string, number | null>; fusion: number }
export interface FusionSummary {
  n: number; rows: FusionRow[]; exclusions: Exclusion[]; means: Record<string, number | null>; signTest: Sign; claim: boolean;
}

function summarise(rows: FusionRow[], exclusions: Exclusion[], arms: readonly string[], ref: string): FusionSummary {
  const means: Record<string, number | null> = {};
  for (const a of arms) means[a] = mean(rows.map((r) => r.scores[a]).filter((x): x is number => x !== null));
  means.fusion = mean(rows.map((r) => r.fusion));
  const st = sign(rows.flatMap((r) => (r.scores[ref] === null || r.scores[ref] === undefined ? [] : [[r.fusion, r.scores[ref]!] as [number, number]])));
  return { n: rows.length, rows, exclusions, means, signTest: st, claim: claimMet(means.fusion, means[ref] ?? null, st) };
}

export const FIXED_FUSION_ARMS = ["gemini", "qloo_rank", "popularity"] as const;
export const CITY_FUSION_ARMS = ["llm", "winnability", "fan_heat", "population"] as const;

// Test B ---------------------------------------------------------------------------------------------------------------------

export function fuseFixed(cases: FixedCaseResult[]): FusionSummary {
  const rows: FusionRow[] = [], exclusions: Exclusion[] = [];
  for (const c of cases) {
    const g = c.arms.gemini, q = c.arms.qloo_rank;
    if (g.status !== "ok") { exclusions.push({ id: c.id, reason: "gemini has no valid answer" }); continue; }
    if (q.status !== "ok") { exclusions.push({ id: c.id, reason: "qloo_rank has no valid answer" }); continue; }
    const real = c.candidates.find((x) => x.real)?.entityId ?? c.realPick.entityId;
    const pos = rrf(g.ranking, q.ranking).indexOf(real) + 1;
    if (pos === 0) { exclusions.push({ id: c.id, reason: "real pick missing from the fused list" }); continue; }
    rows.push({
      id: c.id, model: c.geminiModel, fusion: 1 / pos,
      scores: { gemini: g.rr, qloo_rank: q.rr, popularity: c.arms.popularity.status === "ok" ? c.arms.popularity.rr : null },
    });
  }
  return summarise(rows, exclusions, FIXED_FUSION_ARMS, "gemini");
}

// Test A ---------------------------------------------------------------------------------------------------------------------

export function fuseCity(artists: CityRankArtist[]): FusionSummary {
  const rows: FusionRow[] = [], exclusions: Exclusion[] = [];
  for (const a of artists) {
    const l = a.arms.llm, w = a.arms.winnability;
    if (l.status !== "ok") { exclusions.push({ id: a.artist, reason: "llm has no valid answer" }); continue; }
    if (w.status !== "ok") { exclusions.push({ id: a.artist, reason: "winnability has no valid answer" }); continue; }
    const played = new Set(a.candidates.filter((c) => c.played).map((c) => c.id));
    const sc = (arm: (typeof CITY_FUSION_ARMS)[number]) => { const r = a.arms[arm]; return r.status === "ok" ? r.rPrecision : null; };
    rows.push({
      id: a.artist, model: a.llmModel, fusion: rPrecision(rrf(l.ranking, w.ranking), played, a.n),
      scores: Object.fromEntries(CITY_FUSION_ARMS.map((arm) => [arm, sc(arm)])),
    });
  }
  return summarise(rows, exclusions, CITY_FUSION_ARMS, "llm");
}

// 7.2 exploratory ------------------------------------------------------------------------------------------------------------

/** Training cutoffs as Google states them (Amendment 7.2). Anything else is unknown. */
export function cutoffOf(model: string | undefined): { year: number; month: string } | null {
  if (model === "gemini-2.5-flash") return { year: 2025, month: "2025-01" };
  if (model === "gemini-3.8-flash") return { year: 2026, month: "2026-03" };
  return null;
}

export interface Subset extends FusionSummary { exploratory: true }

function subsetOf(full: FusionSummary, keep: (row: FusionRow) => string | null, arms: readonly string[], ref: string): Subset {
  const rows: FusionRow[] = [], excluded: Exclusion[] = [];
  for (const r of full.rows) { const why = keep(r); if (why === null) rows.push(r); else excluded.push({ id: r.id, reason: why }); }
  return { ...summarise(rows, excluded, arms, ref), exploratory: true };
}

/** `dates` maps case id to the tour date (YYYY-MM or YYYY-MM-DD). Keeps cases whose month is strictly after the cutoff month. */
export function postCutoffFixed(full: FusionSummary, dates: Map<string, string>): Subset {
  return subsetOf(full, (r) => {
    const cut = cutoffOf(r.model);
    if (!cut) return "unknown cutoff";
    const d = dates.get(r.id);
    if (!d) return "no tour date";
    return d.slice(0, 7) > cut.month ? null : "not after cutoff";
  }, FIXED_FUSION_ARMS, "gemini");
}

/** `info` maps artist to firstShowYear and the model. Keeps artists whose year is strictly greater than the cutoff year. */
export function postCutoffCity(full: FusionSummary, info: Map<string, { year: number; model?: string }>): Subset {
  return subsetOf(full, (r) => {
    const i = info.get(r.id);
    const cut = cutoffOf(i?.model ?? r.model);
    if (!cut) return "unknown cutoff";
    if (!i) return "no tour year";
    return i.year > cut.year ? null : "not after cutoff";
  }, CITY_FUSION_ARMS, "llm");
}

export interface FusionFile {
  schemaVersion: 1; generatedAt: string;
  rule: { name: "rrf"; k: number; tieBreak: "llm-rank" };
  sanity: { testB: "passed"; testA: "passed" };
  testB: { planned: number; scored: number; full: FusionSummary; postCutoff: Subset };
  testA: { artists: number; full: FusionSummary; postCutoff: Subset };
}

// Sanity: reproduce the published per-arm numbers --------------------------------------------------------------------------

const near = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) < 1e-9);

/** Recomputes every ok arm's rank and rr from its stored ranking, then every arm's MRR over all cases, and throws on any difference from the stored `stats`. */
export function verifyFixed(cases: FixedCaseResult[], stats: FixedStats): void {
  const bad: string[] = [];
  for (const arm of FIXED_FUSION_ARMS) {
    const xs: number[] = [];
    for (const c of cases) {
      const r = c.arms[arm];
      if (r.status !== "ok") continue;
      const real = c.candidates.find((x) => x.real)?.entityId ?? c.realPick.entityId;
      const rr = 1 / (r.ranking.indexOf(real) + 1);
      if (!near(rr, r.rr)) bad.push(`${c.id}/${arm}: recomputed rr ${rr} vs stored ${r.rr}`);
      xs.push(r.rr);
    }
    if (!near(mean(xs), stats.arms[arm].mrr)) bad.push(`${arm}: MRR ${mean(xs)} vs stored ${stats.arms[arm].mrr}`);
  }
  if (bad.length) throw new Error(`sanity check failed (Test B): ${bad.join("; ")}`);
}

export function verifyCity(artists: CityRankArtist[], stats: CityRankStats): void {
  const bad: string[] = [];
  for (const arm of CITY_FUSION_ARMS) {
    const xs: number[] = [];
    for (const a of artists) {
      const r = a.arms[arm];
      if (r.status !== "ok") continue;
      const re = rPrecision(r.ranking, new Set(a.candidates.filter((c) => c.played).map((c) => c.id)), a.n);
      if (!near(re, r.rPrecision)) bad.push(`${a.artist}/${arm}: recomputed ${re} vs stored ${r.rPrecision}`);
      xs.push(r.rPrecision);
    }
    if (!near(mean(xs), stats.arms[arm].mean)) bad.push(`${arm}: mean R-precision ${mean(xs)} vs stored ${stats.arms[arm].mean}`);
  }
  if (bad.length) throw new Error(`sanity check failed (Test A): ${bad.join("; ")}`);
}

export { computeCityRankStats };
