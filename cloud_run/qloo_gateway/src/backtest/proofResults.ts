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
  /** The live board, or an extra (a played city or an unplayed decoy: the two are indistinguishable here and in every arm's input). */
  origin: "board" | "extra"; candidateSource: string; /** Ground truth; read only when scoring, never by an arm. */ played: boolean;
  winnability: number | null; fanHeat: number | null; verdict: string; fanHeatFloor?: true; insufficientReason?: string;
}

export interface CityRankArtist {
  position: number; artist: string; tourTitle: string; url: string; sessionId: string; regions: string[]; firstShowYear: number;
  playedTotal: number; boardCount: number; /** Extras added after the board: played cities and unplayed decoys, in pairs. */ playedExtras: number; decoyExtras: number; boardMostlyPlayed: boolean;
  /** Played cities the runner re-anchored with the board's anchoring function (Amendment 2.4). */
  anchoring: Array<{ from: string; to: string }>;
  /** Secondary: R-precision over the board's own cities only (both arms have real Qloo fan heat). Null when the board has no played city. */
  boardOnly: { n: number; count: number; winnability: number; fan_heat: number } | null;
  candidateCount: number; /** Played cities among the candidates. */ n: number; /** n / candidateCount. */ chance: number;
  candidates: CandidateRow[];
  arms: Record<ArmName, CityArmResult>;
  llmModel?: string;
}

export type SignRow = SignResult & { pairs: number };
export interface CityRankStats {
  arms: Record<ArmName, { answered: number; mean: number | null }>;
  meanChance: number | null;
  /** Secondary (Amendment 2.2): winnability vs fan heat over the board's own cities. */
  boardOnly: { answered: number; winnability: number | null; fan_heat: number | null; signTest: SignRow };
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

function boardOnlyStats(artists: CityRankArtist[]): CityRankStats["boardOnly"] {
  const rows = artists.filter((a) => a.boardOnly !== null).map((a) => a.boardOnly!);
  return {
    answered: rows.length, winnability: mean(rows.map((r) => r.winnability)), fan_heat: mean(rows.map((r) => r.fan_heat)),
    signTest: { ...signTest(rows.map((r) => [r.winnability, r.fan_heat] as const)), pairs: rows.length },
  };
}

export function computeCityRankStats(artists: CityRankArtist[]): CityRankStats {
  const arms = Object.fromEntries(ARMS.map((arm) => {
    const xs = artists.map((a) => rOf(a, arm)).filter((x): x is number => x !== null);
    return [arm, { answered: xs.length, mean: mean(xs) }];
  })) as CityRankStats["arms"];
  return {
    arms, meanChance: mean(artists.map((a) => a.chance)), boardOnly: boardOnlyStats(artists),
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

/** number_plausible: a number real elsewhere in the playbook but not on the cited cards; number_absent: a number in no evidence; entity: a name from another card. */
export type PlantKind = "number_plausible" | "number_absent" | "entity";
export const PLANT_KINDS: readonly PlantKind[] = ["number_plausible", "number_absent", "entity"];
export interface CatchRow {
  id: string; playbook: string; text: string; planted: boolean; plantKind?: PlantKind; original?: string;
  removed: boolean; reason?: string; detail?: string;
}
export interface CatchRateSection {
  source: string; claims: number; planted: number; caught: number; catchRate: number;
  trueClaims: number; falseAlarms: number; falseAlarmRate: number;
  /** Catch rate per plant type (the headline numbers). */
  byType: Record<PlantKind, { planted: number; caught: number; catchRate: number | null }>;
  /** Why falseAlarmRate is not a finding. */
  falseAlarmNote: string; rows: CatchRow[];
}

// Test C (grounding) ---------------------------------------------------------------------------------------------------------------

export type GroundCategory = "venue" | "brand" | "local_act";
export const GROUND_CATEGORIES: readonly GroundCategory[] = ["venue", "brand", "local_act"];
export const GROUND_CATEGORY_LABEL: Record<GroundCategory, string> = { venue: "Venue", brand: "Brand", local_act: "Local act" };
export type GroundArm = "qloo" | "llm";
export const GROUND_ARMS: readonly GroundArm[] = ["qloo", "llm"];

/** Counts of ratings credited to one arm; `share` = inCity / rated, where "can't tell" is outside `rated`. */
export interface ShareRow { rated: number; inCity: number; otherCity: number; notExist: number; cantTell: number; share: number | null }

export interface GroundingSection {
  artist: string;
  /** Cities rated: those with a Qloo playbook (excluded and not-run ones are listed apart). */
  cities: Array<{ cityId: string; city: string; country: string }>;
  excluded: Array<{ cityId: string; city: string; reason: string }>;
  notRun: Array<{ cityId: string; city: string }>;
  /** Cities with no LLM answer (invalid JSON twice): unpaired. */
  llmNoAnswer: string[];
  cityDifference: { missing: string[]; extra: string[] };
  rows: { total: number; rated: number; unrated: number; cantTell: number };
  byArm: Record<GroundArm, { overall: ShareRow; byCategory: Record<GroundCategory, ShareRow> }>;
  /** Per-city in-city share over all three categories, null when the arm has no rated row there. */
  perCity: Array<{ cityId: string; city: string; qloo: number | null; llm: number | null }>;
  /** Means over the paired cities only. */
  meanPerCity: Record<GroundArm, number | null>;
  signTest: SignRow;
}

// Whole file -----------------------------------------------------------------------------------------------------------------------

export interface ProofV3Results {
  schemaVersion: 3;
  generatedAt: string;
  protocol: { path: string; /** Last commit that touched the protocol file. */ commit: string };
  calibrationVersion: string;
  models: { /** Configured, primary first. */ gemini: string[]; geminiUsed: string[] };
  callCounts: { qloo: number; gemini: number; qlooErrors: number; geminiErrors: number };
  /** First 200 characters of each Gemini error (retried ones included), for diagnosing a stop. */
  geminiErrorTexts: string[];
  stop: { status: "running" | "complete" | "stopped"; reason?: string };
  cityRank?: CityRankSection;
  fixedRank?: FixedRankSection;
  catchRate?: CatchRateSection;
  grounding?: GroundingSection;
  summary: string[];
}

/** Fixed disclosures the protocol requires with Test A's results (the method's properties, the known limits, and the amendments). */
export const DISCLOSURES: readonly string[] = [
  "Method: cities added after the board (played cities and unplayed decoys, in pairs) that are absent from Qloo's heat list get fan heat at the board's floor, so among them fan heat carries no information and ties break by hash order; any advantage winnability gains there comes only from activation.",
  "Data timing: Qloo's taste data is current, not as of the tour date, so some fan heat may reflect the tour itself; Gemini's training data may include the tour.",
  "What it tests: agreement with the routing an agent chose, not whether those cities were the most profitable.",
  "Sample size: 12 artists (or 6) is a small sample, so the sign test has low power.",
  "Eligibility proxy: excluding tours by venue name lets some arena-tier acts through, so this is a mid-tier test only approximately.",
  "Stop rule: the gateway itself retries a retryable error envelope, a RATE one included, up to twice upstream before the runner sees it, so a rate limit is noticed after up to 3 upstream attempts.",
  "Amendments 1 and 2 to the protocol were made before any Qloo or Gemini call.",
];

// Claim rule -----------------------------------------------------------------------------------------------------------------------

const fmtP = (p: number): string => (p < 0.001 ? "<0.001" : p.toFixed(3));
const fmtV = (v: number | null): string => (v === null ? "n/a" : v.toFixed(2));
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** A name as it opens a sentence and as it reads mid-sentence ("Winnability" / "winnability", "Gemini" / "Gemini"). */
export interface Name { start: string; inline: string }
export const N = (start: string, inline = start.toLowerCase()): Name => ({ start, inline });

/**
 * The protocol's claim rule (Amendment 2.3): "X beat Y" only where the mean is higher AND there are more per-artist wins than losses AND the two-sided sign test gives p < 0.05. Otherwise the difference is
 * reported as not significant at this sample size, with its direction. A significant result against us is stated as plainly as one for us.
 */
export function compare(ours: Name, theirs: Name, a: number | null, b: number | null, t: SignRow, metric: string, unit: string): string {
  const detail = `${plural(t.wins, "win")}, ${plural(t.losses, "loss", "losses")}${t.ties ? `, ${plural(t.ties, "tie")}` : ""} over ${plural(t.pairs, unit)}`;
  if (a === null || b === null || t.pairs === 0) return `Not significant at this sample size: ${ours.inline} has no paired ${metric} against ${theirs.inline} yet.`;
  if (t.p < 0.05 && a > b && t.wins > t.losses) return `${ours.start} beat ${theirs.inline} (p=${fmtP(t.p)}): mean ${metric} ${fmtV(a)} vs ${fmtV(b)}, ${detail}.`;
  if (t.p < 0.05 && b > a && t.losses > t.wins) return `${theirs.start} beat ${ours.inline} (p=${fmtP(t.p)}): mean ${metric} ${fmtV(b)} vs ${fmtV(a)}, ${detail}.`;
  const dir = a > b ? "leads" : a < b ? "trails" : "ties";
  return `Not significant at this sample size: ${ours.inline} ${dir} ${theirs.inline} on mean ${metric} (${fmtV(a)} vs ${fmtV(b)}; p=${fmtP(t.p)}; ${detail}).`;
}


/** Pure: Test C's sentences. No venue, brand or act names: only counts, shares and city names. */
export function groundingSummary(g: GroundingSection, stopNote = ""): string[] {
  const out: string[] = [];
  out.push(`Test C (grounding) covers ${plural(g.cities.length, "city", "cities")} for ${g.artist}: ${g.rows.rated} of ${g.rows.total} names rated, ${g.rows.unrated} unrated, ${g.rows.cantTell} marked can't tell.${stopNote}`);
  const label: Record<GroundCategory, string> = { venue: "venues", brand: "brands", local_act: "local acts" };
  for (const arm of GROUND_ARMS) {
    const a = g.byArm[arm];
    const parts = GROUND_CATEGORIES.map((c) => `${label[c]} ${fmtV(a.byCategory[c].share)} (${a.byCategory[c].inCity} of ${a.byCategory[c].rated})`);
    out.push(`Share of ${arm === "qloo" ? "Qloo" : "LLM-only"} names rated as existing in the city: ${parts.join(", ")}; overall ${fmtV(a.overall.share)}.`);
  }
  out.push(compare(N("Qloo", "Qloo"), N("The LLM-only playbook", "the LLM-only playbook"), g.meanPerCity.qloo, g.meanPerCity.llm, g.signTest, "share in city", "city"));
  for (const c of g.perCity) if (c.qloo !== null && c.llm !== null && c.llm > c.qloo + 1e-9) out.push(`The LLM-only playbook beat Qloo in ${c.city}.`);
  for (const e of g.excluded) out.push(`${e.city} was excluded (${e.reason}).`);
  for (const c of g.llmNoAnswer) out.push(`The LLM-only playbook gave no valid answer for ${c}, so it is unpaired.`);
  if (g.cityDifference.missing.length || g.cityDifference.extra.length) out.push(`The recorded board differs from the protocol's expected city list (missing: ${g.cityDifference.missing.join(", ") || "none"}; extra: ${g.cityDifference.extra.join(", ") || "none"}); the recorded board was used.`);
  out.push("Method: one reviewer, blind to which playbook gave each name; 'exists in another city' counts as not in this city; a name both playbooks gave counts for both; ratings are published in aggregate only because the names stay private.");
  return out;
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
    const bo = s.boardOnly;
    out.push(`Secondary, board cities only (both arms have real Qloo fan heat; ${plural(bo.answered, "artist")}): ${compare(N("Winnability"), N("Fan heat", "fan heat"), bo.winnability, bo.fan_heat, { ...bo.signTest }, "R-precision", "artist")}`);
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
    for (const a of c.artists) for (const ch of a.anchoring) out.push(`${a.artist}: played city ${ch.from} was re-anchored to ${ch.to}, the way the board anchors it.`);
    out.push(...DISCLOSURES);
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
    out.push(`The claim checker removed ${k.caught} of ${k.planted} planted false claims (catch rate ${fmtV(k.catchRate)}).`);
    const label: Record<PlantKind, string> = { number_plausible: "a plausible wrong number (real elsewhere in the playbook)", number_absent: "a number found nowhere in the evidence", entity: "a name swapped in from another card" };
    for (const t of PLANT_KINDS) if (k.byType[t].planted > 0) out.push(`Planted as ${label[t]}: caught ${k.byType[t].caught} of ${k.byType[t].planted}.`);
    if (k.byType.number_plausible.planted > 0 && k.byType.number_plausible.caught < k.byType.number_plausible.planted) out.push("The checker missed some plausible wrong numbers: a limit of the checker.");
    out.push("Method: one token means one number or one whole entity name (a multi-word name counts as one); plausible numbers exclude every number on the cited items.");
    out.push(`False alarms (${k.falseAlarms} of ${k.trueClaims}) are not a finding: ${k.falseAlarmNote}`);
  }
  if (r.grounding) out.push(...groundingSummary(r.grounding, r.stop.status === "stopped" ? ` The run stopped early: ${r.stop.reason ?? "stop rule"}.` : ""));
  return out;
}
