import { mean, signTest, type SignResult } from "./proofStats.js";

/** One results shape for every Proof v3 test (docs/qloo/proof-v3-protocol.md). Each CLI fills its own section; the file is private (Qloo-derived ranks). */
export type ArmName = "winnability" | "fan_heat" | "llm" | "population";
export const ARMS: readonly ArmName[] = ["winnability", "fan_heat", "llm", "population"];
export const ARM_LABEL: Record<ArmName, string> = { winnability: "Winnability", fan_heat: "Fan heat", llm: "The generic LLM", population: "Population" };

export type CityArmResult =
  | { status: "ok"; /** City ids, best first. */ ranking: string[]; rPrecision: number; /** Names of the played cities in the arm's top N. */ hits: string[] }
  | { status: "no_answer"; reason: string };

export interface CandidateRow {
  id: string; name: string; country: string; population: number;
  /** Where the city came from: the live board (heat or major market) or added from the tour's played cities. */
  origin: "board" | "added_played"; candidateSource: string; played: boolean;
  winnability: number | null; fanHeat: number | null; verdict: string; fanHeatFloor?: true; insufficientReason?: string;
}

export interface CityRankArtist {
  position: number; artist: string; tourTitle: string; url: string; sessionId: string; regions: string[]; firstShowYear: number;
  playedTotal: number; boardCount: number; addedCount: number; boardMostlyPlayed: boolean;
  candidateCount: number; /** Played cities among the candidates. */ n: number; /** n / candidateCount. */ chance: number;
  candidates: CandidateRow[];
  arms: Record<ArmName, CityArmResult>;
  llmModel?: string;
}

export type SignRow = SignResult & { pairs: number };
export interface CityRankStats {
  arms: Record<ArmName, { answered: number; mean: number | null }>;
  meanChance: number | null;
  signTests: { vs_fan_heat: SignRow; vs_llm: SignRow; vs_population: SignRow };
}

export interface CityRankSection {
  batch: number; plannedArtists: number; /** Artists in the full plan (12), for "6 of a planned 12". */ plannedTotal: number;
  artists: CityRankArtist[];
  dropped: Array<{ position: number; artist: string; reason: string }>;
  notRun: Array<{ position: number; artist: string }>;
  stats: CityRankStats;
}

const rOf = (a: CityRankArtist, arm: ArmName): number | null => { const r = a.arms[arm]; return r.status === "ok" ? r.rPrecision : null; };

function paired(artists: CityRankArtist[], other: ArmName): SignRow {
  const pairs: Array<[number, number]> = [];
  for (const a of artists) { const w = rOf(a, "winnability"), o = rOf(a, other); if (w !== null && o !== null) pairs.push([w, o]); }
  return { ...signTest(pairs), pairs: pairs.length };
}

export function computeCityRankStats(artists: CityRankArtist[]): CityRankStats {
  const arms = Object.fromEntries(ARMS.map((arm) => {
    const xs = artists.map((a) => rOf(a, arm)).filter((x): x is number => x !== null);
    return [arm, { answered: xs.length, mean: mean(xs) }];
  })) as CityRankStats["arms"];
  return {
    arms, meanChance: mean(artists.map((a) => a.chance)),
    signTests: { vs_fan_heat: paired(artists, "fan_heat"), vs_llm: paired(artists, "llm"), vs_population: paired(artists, "population") },
  };
}

// Test B ---------------------------------------------------------------------------------------------------------------------------

export type FixedArmName = "qloo_rank" | "gemini" | "popularity";
export const FIXED_ARMS: readonly FixedArmName[] = ["qloo_rank", "gemini", "popularity"];
export const FIXED_LABEL: Record<FixedArmName, string> = { qloo_rank: "Qloo rank", gemini: "Gemini", popularity: "Popularity" };
export const FIXED_CANDIDATES = 10;

export type FixedArmResult =
  | { status: "ok"; /** Candidate entity ids, best first. */ ranking: string[]; rank: number; rr: number }
  | { status: "no_answer"; reason: string };

export interface FixedCaseResult {
  id: string; artist: string; city: string; country: string; activationType: string; status: "scored";
  realPick: { name: string; entityId: string };
  candidates: Array<{ name: string; entityId: string; real: boolean }>;
  arms: Record<FixedArmName, FixedArmResult>;
  geminiModel?: string;
}

export interface FixedStats {
  arms: Record<FixedArmName, { answered: number; mrr: number | null }>;
  chanceMrr: number;
  signTests: { qloo_vs_gemini: SignRow; qloo_vs_popularity: SignRow };
}
export interface FixedRankSection {
  plannedCases: number; cases: FixedCaseResult[];
  excluded: Array<{ id: string; reason: string }>; notRun: string[];
  stats: FixedStats;
}

const rrOf = (c: FixedCaseResult, arm: FixedArmName): number | null => { const r = c.arms[arm]; return r.status === "ok" ? r.rr : null; };

export function computeFixedStats(cases: FixedCaseResult[]): FixedStats {
  const arms = Object.fromEntries(FIXED_ARMS.map((arm) => {
    const xs = cases.map((c) => rrOf(c, arm)).filter((x): x is number => x !== null);
    return [arm, { answered: xs.length, mrr: mean(xs) }];
  })) as FixedStats["arms"];
  const pair = (other: FixedArmName): SignRow => {
    const pairs: Array<[number, number]> = [];
    for (const c of cases) { const q = rrOf(c, "qloo_rank"), o = rrOf(c, other); if (q !== null && o !== null) pairs.push([q, o]); }
    return { ...signTest(pairs), pairs: pairs.length };
  };
  let chance = 0;
  for (let k = 1; k <= FIXED_CANDIDATES; k += 1) chance += 1 / k;
  return { arms, chanceMrr: chance / FIXED_CANDIDATES, signTests: { qloo_vs_gemini: pair("gemini"), qloo_vs_popularity: pair("popularity") } };
}

// Catch rate -----------------------------------------------------------------------------------------------------------------------

export interface CatchRow {
  id: string; playbook: string; text: string; planted: boolean; plantKind?: "number" | "entity"; original?: string;
  removed: boolean; reason?: string; detail?: string;
}
export interface CatchRateSection {
  source: string; claims: number; planted: number; caught: number; catchRate: number;
  trueClaims: number; falseAlarms: number; falseAlarmRate: number; rows: CatchRow[];
}

// Whole file -----------------------------------------------------------------------------------------------------------------------

export interface ProofV3Results {
  schemaVersion: 3;
  generatedAt: string;
  protocol: { path: string; /** Last commit that touched the protocol file. */ commit: string };
  calibrationVersion: string;
  models: { /** Configured, primary first. */ gemini: string[]; geminiUsed: string[] };
  callCounts: { qloo: number; gemini: number; qlooErrors: number; geminiErrors: number };
  stop: { status: "running" | "complete" | "stopped"; reason?: string };
  cityRank?: CityRankSection;
  fixedRank?: FixedRankSection;
  catchRate?: CatchRateSection;
  summary: string[];
}

// Claim rule -----------------------------------------------------------------------------------------------------------------------

const fmtP = (p: number): string => (p < 0.001 ? "<0.001" : p.toFixed(3));
const fmtV = (v: number | null): string => (v === null ? "n/a" : v.toFixed(2));
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** A name as it opens a sentence and as it reads mid-sentence ("Winnability" / "winnability", "Gemini" / "Gemini"). */
interface Name { start: string; inline: string }
const N = (start: string, inline = start.toLowerCase()): Name => ({ start, inline });

/**
 * The protocol's claim rule: "X beat Y" only where the mean is higher AND the two-sided sign test gives p < 0.05. Otherwise the difference is
 * reported as not significant at this sample size, with its direction. A significant result against us is stated as plainly as one for us.
 */
function compare(ours: Name, theirs: Name, a: number | null, b: number | null, t: SignRow, metric: string, unit: string): string {
  const detail = `${plural(t.wins, "win")}, ${plural(t.losses, "loss", "losses")}${t.ties ? `, ${plural(t.ties, "tie")}` : ""} over ${plural(t.pairs, unit)}`;
  if (a === null || b === null || t.pairs === 0) return `Not significant at this sample size: ${ours.inline} has no paired ${metric} against ${theirs.inline} yet.`;
  if (t.p < 0.05 && a > b) return `${ours.start} beat ${theirs.inline} (p=${fmtP(t.p)}): mean ${metric} ${fmtV(a)} vs ${fmtV(b)}, ${detail}.`;
  if (t.p < 0.05 && b > a) return `${theirs.start} beat ${ours.inline} (p=${fmtP(t.p)}): mean ${metric} ${fmtV(b)} vs ${fmtV(a)}, ${detail}.`;
  const dir = a > b ? "leads" : a < b ? "trails" : "ties";
  return `Not significant at this sample size: ${ours.inline} ${dir} ${theirs.inline} on mean ${metric} (${fmtV(a)} vs ${fmtV(b)}; p=${fmtP(t.p)}; ${detail}).`;
}

/** Pure: the sentences the /proof page and README may use, produced by the claim rule. */
export function summarise(r: ProofV3Results): string[] {
  const out: string[] = [];
  const stopNote = r.stop.status === "stopped" ? ` The run stopped early: ${r.stop.reason ?? "stop rule"}.` : "";
  if (r.cityRank) {
    const c = r.cityRank, s = c.stats;
    out.push(`Test A (city ranking) covers ${c.artists.length} of a planned ${c.plannedTotal} artists.${stopNote}`);
    out.push(`Mean R-precision: ${ARMS.map((a) => `${ARM_LABEL[a].toLowerCase()} ${fmtV(s.arms[a].mean)}`).join(", ")}; mean chance level ${fmtV(s.meanChance)}.`);
    out.push(compare(N("Winnability"), N("Fan heat", "fan heat"), s.arms.winnability.mean, s.arms.fan_heat.mean, s.signTests.vs_fan_heat, "R-precision", "artist"));
    out.push(compare(N("Winnability"), N("The generic LLM", "the generic LLM"), s.arms.winnability.mean, s.arms.llm.mean, s.signTests.vs_llm, "R-precision", "artist"));
    out.push(`Secondary: ${compare(N("Winnability"), N("Population", "population"), s.arms.winnability.mean, s.arms.population.mean, s.signTests.vs_population, "R-precision", "artist")}`);
    for (const a of c.artists) {
      const w = a.arms.winnability.status === "ok" ? a.arms.winnability.rPrecision : null;
      if (w === null) continue;
      for (const arm of ["fan_heat", "llm", "population"] as const) {
        const o = a.arms[arm];
        if (o.status === "ok" && o.rPrecision > w + 1e-9) out.push(`${ARM_LABEL[arm]} beat winnability for ${a.artist}.`);
      }
      if (a.boardMostlyPlayed) out.push(`Board mostly played for ${a.artist}: no cities were added.`);
    }
    for (const d of c.dropped) out.push(`${d.artist} was dropped (${d.reason}).`);
  }
  if (r.fixedRank) {
    const f = r.fixedRank, s = f.stats;
    out.push(`Test B (fixed candidates) covers ${f.cases.length} of ${f.plannedCases} cases.${r.cityRank ? "" : stopNote}`);
    out.push(`Mean reciprocal rank: ${FIXED_ARMS.map((a) => `${FIXED_LABEL[a].toLowerCase()} ${fmtV(s.arms[a].mrr)}`).join(", ")}; chance level ${fmtV(s.chanceMrr)}.`);
    out.push(compare(N("Qloo rank", "Qloo rank"), N("Gemini", "Gemini"), s.arms.qloo_rank.mrr, s.arms.gemini.mrr, s.signTests.qloo_vs_gemini, "reciprocal rank", "case"));
    out.push(compare(N("Qloo rank", "Qloo rank"), N("Popularity", "popularity"), s.arms.qloo_rank.mrr, s.arms.popularity.mrr, s.signTests.qloo_vs_popularity, "reciprocal rank", "case"));
    for (const c of f.cases) {
      const q = rrOf(c, "qloo_rank");
      if (q === null) continue;
      for (const arm of ["gemini", "popularity"] as const) { const o = rrOf(c, arm); if (o !== null && o > q + 1e-9) out.push(`${FIXED_LABEL[arm]} beat ${FIXED_LABEL.qloo_rank} for ${c.id}.`); }
    }
    for (const e of f.excluded) out.push(`${e.id} was excluded (${e.reason}).`);
  }
  if (r.catchRate) {
    const k = r.catchRate;
    out.push(`The claim checker removed ${k.caught} of ${k.planted} planted false claims (catch rate ${fmtV(k.catchRate)}) and ${k.falseAlarms} of ${k.trueClaims} true claims (false-alarm rate ${fmtV(k.falseAlarmRate)}).`);
  }
  return out;
}
