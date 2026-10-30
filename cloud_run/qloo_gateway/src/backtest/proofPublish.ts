import {
  ARMS, ARM_LABEL, DISCLOSURES, FIXED_ARMS, FIXED_LABEL, GROUND_ARMS, GROUND_CATEGORIES, PLANT_KINDS, N, compare, computeCityRankStats, stopCode, summarise,
  type CatchRateSection, type CityRankArtist, type CityRankSection, type FixedCaseResult, type GroundingSection, type PlantKind, type ProofV3Results, type Name, type SignRow,
} from "./proofResults.js";
import type { CheckersResult } from "./checkerCatch.js";
import { claimMet, type FusionFile, type FusionSummary, type Subset } from "./fusion.js";

/**
 * The public face of Proof v3 (docs/qloo/proof-v3-protocol.md): one `proofV3` object under the private backtest file, rendered generically by the dashboard's /proof page.
 * Strings in `tables` and `perUnit` are pre-formatted, so a new test (Test C) is added as data only. Nothing here carries a Qloo-returned entity name.
 */
export interface Table { columns: string[]; rows: string[][] }
export interface SignLine { label: string; wins: number; losses: number; ties: number; pairs: number; p: number }
export interface RunLine { label: string; commit: string; status: "complete" | "stopped"; note: string }
export interface ProofV3Test {
  id: "A" | "B" | "B_post_cutoff" | "C" | "F" | "catch"; title: string; question: string; status: string; n: number;
  /** Arm table first (R-precision, MRR, catch counts, in-city shares). */
  tables: Table[]; signTests: SignLine[]; claims: string[]; limits: string[]; runs?: RunLine[];
  /** The "Per artist/case" disclosure; null when a test has no per-unit rows. */
  perUnit: Table | null;
}
export interface Amendment { n: number; commit: string; summary: string }
/** Amendment 10: one row per product checker, counts only (no case text). `claim` uses the claim checker's wording. */
export interface CheckerRow { id: string; checker: string; guards: string; caught: number; planted: number; falseAlarms: number; controls: number; claim: string; anchor: string; note: string }
export interface ProofV3Checkers { amendment: 10; rows: CheckerRow[]; nameRuleOnly: { caught: number; planted: number; falseAlarms: number; controls: number } }
export interface ProofV3Published { protocolCommit: string; generatedAt: string; amendments: Amendment[]; tests: ProofV3Test[]; checkers?: ProofV3Checkers }

export interface PublishInputs {
  protocolCommit: string; amendments: Amendment[];
  /** Test A batches, in order. */
  batches: ProofV3Results[];
  fixed?: ProofV3Results; /** Amendment 9: Test B on cases after the model's cutoff (`proof-v3-fixed-post-cutoff.json`), when present. */ fixedPostCutoff?: ProofV3Results; /** Earlier stopped runs of Test B, oldest first. */ fixedStopped?: ProofV3Results[];
  catchRate?: ProofV3Results; grounding?: ProofV3Results; /** Test C's stopped runs (the `proof-v3-ground-items.stopped-N.json` files), oldest first. */ groundingStopped?: StoppedGroundRun[]; /** Amendment 7: the offline fusion results, when computed. */ fusion?: FusionFile; /** Amendment 10: the offline checker catch rates (`proof-v3-checkers.json`), when computed. */ checkers?: CheckersFile; now: Date;
}
/** The few facts read from a stopped Test C items file; its names stay private. */
export interface StoppedGroundRun {
  callCounts: { qloo: number; gemini: number; qlooErrors: number; geminiErrors: number };
  stop: { status: string; reason?: string }; cities: unknown[]; notRun: unknown[];
}

const f2 = (v: number | null): string => (v === null ? "n/a" : v.toFixed(2));
const sign = (label: string, s: SignRow): SignLine => ({ label, wins: s.wins, losses: s.losses, ties: s.ties, pairs: s.pairs, p: s.p });
const plural = (n: number, one: string, many = /[^aeiou]y$/.test(one) ? `${one.slice(0, -1)}ies` : `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const isLimitLine = (l: string): boolean => /^(Method|Disclosure|Raters)[:\s(]|^False alarms|^The checker missed/.test(l);
const splitLines = (lines: string[]): { claims: string[]; limits: string[] } => ({ claims: lines.filter((l) => !isLimitLine(l)), limits: lines.filter(isLimitLine) });

// Test A -----------------------------------------------------------------------------------------------------------------------

/** Both batches as one section: artists pooled, stats recomputed (never averaged across batches). */
export function mergeBatches(batches: ProofV3Results[]): { merged: ProofV3Results; section: CityRankSection } {
  const parts = batches.map((b) => b.cityRank).filter((c): c is CityRankSection => !!c);
  const artists = parts.flatMap((c) => c.artists).sort((a, b) => a.position - b.position);
  const section: CityRankSection = {
    batch: parts.length, plannedArtists: parts.reduce((s, c) => s + c.plannedArtists, 0), plannedTotal: Math.max(...parts.map((c) => c.plannedTotal)), artists,
    dropped: parts.flatMap((c) => c.dropped), notRun: parts.flatMap((c) => c.notRun), stats: computeCityRankStats(artists),
  };
  const stopped = batches.find((b) => b.stop.status === "stopped");
  return { merged: { ...batches[0]!, stop: stopped ? stopped.stop : { status: "complete" }, cityRank: section, summary: [] }, section };
}

function testA(batches: ProofV3Results[]): ProofV3Test {
  const { merged, section } = mergeBatches(batches);
  const s = section.stats;
  const allClear = batches.every((b) => b.stop.status === "complete");
  const lines = summarise(merged);
  const row = (label: string, v: number | null, answered: string) => [label, f2(v), answered];
  const perUnit = section.artists.map((a: CityRankArtist) => [a.artist, ...ARMS.map((arm) => { const r = a.arms[arm]; return r.status === "ok" ? f2(r.rPrecision) : "no answer"; }), f2(a.chance)]);
  return {
    id: "A", title: "Test A: choosing the cities a tour played",
    question: "Does winnability pick the cities a tour actually played better than fan heat alone, a generic LLM, or population?",
    status: `${allClear ? "Complete" : "Stopped early"}: ${section.artists.length} of a planned ${section.plannedTotal} artists scored`,
    n: section.artists.length,
    tables: [{ columns: ["Arm", "Mean R-precision", "Artists answered"], rows: [...ARMS.map((arm) => row(ARM_LABEL[arm], s.arms[arm].mean, String(s.arms[arm].answered))), row("Chance level", s.meanChance, "-")] }],
    signTests: [
      sign("Winnability vs fan heat", s.signTests.vs_fan_heat), sign("Winnability vs the generic LLM", s.signTests.vs_llm),
      sign("Winnability vs population (secondary)", s.signTests.vs_population), sign("Winnability vs fan heat, board cities only (secondary)", s.boardOnly.signTest),
    ],
    claims: lines.filter((l) => !DISCLOSURES.includes(l)),
    limits: DISCLOSURES.map((l) => (l.startsWith("Sample size:")
      ? `Sample size: ${section.artists.length} of a planned ${section.plannedTotal} artists completed${section.dropped.length + section.notRun.length ? ` (${section.dropped.length + section.notRun.length} dropped by rule)` : ""}, a small sample, so the sign test has low power.`
      : l)),
    runs: batches.map((b, i) => {
      const c = b.cityRank;
      return { label: `Batch ${c?.batch ?? i + 1}`, commit: b.protocol.commit, status: b.stop.status === "stopped" ? "stopped" as const : "complete" as const,
        note: `${plural(c?.artists.length ?? 0, "artist")} scored${c?.dropped.length ? `, ${c.dropped.length} dropped` : ""}${b.stop.status === "stopped" ? `; stopped: ${stopCode(b.stop.reason)}` : ""}` };
    }),
    perUnit: { columns: ["Artist", ...ARMS.map((a) => ARM_LABEL[a]), "Chance"], rows: perUnit },
  };
}

// Test B -----------------------------------------------------------------------------------------------------------------------

const rankText = (c: FixedCaseResult, arm: (typeof FIXED_ARMS)[number]): string => { const r = c.arms[arm]; return r.status === "ok" ? `#${r.rank}` : "no answer"; };

function testB(fixed: ProofV3Results, earlier: ProofV3Results[]): ProofV3Test {
  const f = fixed.fixedRank!, s = f.stats;
  const lines = summarise({ ...fixed, cityRank: undefined, catchRate: undefined, grounding: undefined });
  const stoppedNote = earlier.length ? ` An earlier run stopped on an infrastructure failure (Amendment 3) and is kept below; this is the complete re-run.` : "";
  const runs: RunLine[] = [
    ...earlier.map((e, i) => ({ label: `Run ${i + 1} (stopped, infrastructure)`, commit: e.protocol.commit, status: "stopped" as const,
      note: `${plural(e.fixedRank?.cases.length ?? 0, "case")} scored of ${e.fixedRank?.plannedCases ?? 0}; ${stopCode(e.stop.reason)}` })),
    { label: earlier.length ? `Run ${earlier.length + 1}` : "Run 1", commit: fixed.protocol.commit, status: fixed.stop.status === "stopped" ? "stopped" : "complete", note: `${plural(f.cases.length, "case")} scored of ${f.plannedCases}` },
  ];
  return {
    id: "B", title: "Test B: picking the real activation among 10 candidates",
    question: "For the reviewed activation cases, does Qloo rank place the real pick higher among 10 candidates than Gemini or popularity?",
    status: `${fixed.stop.status === "stopped" ? "Stopped early" : "Complete"}: ${f.cases.length} of ${f.plannedCases} cases scored.${stoppedNote}`,
    n: f.cases.length,
    tables: [{ columns: ["Arm", "Mean reciprocal rank", "Cases answered"], rows: [...FIXED_ARMS.map((a) => [FIXED_LABEL[a], f2(s.arms[a].mrr), String(s.arms[a].answered)]), ["Chance level", f2(s.chanceMrr), "-"]] }],
    signTests: [sign("Qloo rank vs Gemini", s.signTests.qloo_vs_gemini), sign("Qloo rank vs popularity", s.signTests.qloo_vs_popularity)],
    ...splitLines(lines),
    limits: [
      "Each case has the real pick plus 9 decoys from the city's popularity list, so the test asks whether a method puts the real pick first among plausible options.",
      "Data timing: Qloo's taste data is current, not as of the activation date; Gemini's training data may include the activation.",
      `Sample size: ${f.cases.length} of ${f.plannedCases} cases scored, a small sample.`,
      ...(f.excluded.length ? [`${plural(f.excluded.length, "case")} excluded: ${f.excluded.map((e) => `${e.id} (${e.reason})`).join("; ")}.`] : []),
    ],
    runs,
    perUnit: { columns: ["Case", ...FIXED_ARMS.map((a) => FIXED_LABEL[a])], rows: f.cases.map((c) => [c.id, ...FIXED_ARMS.map((a) => rankText(c, a))]) },
  };
}

/** Amendment 9: the same Test B builder and claim rule, on the post-cutoff cases. */
function testBPostCutoff(run: ProofV3Results): ProofV3Test {
  const f = run.fixedRank!;
  const base = testB(run, []);
  const why = (r: string): string => (r === "real pick unresolved" ? `${r} in Qloo` : r);
  return {
    ...base, id: "B_post_cutoff", title: "Test B after the model's cutoff (Amendment 9)",
    question: "On cases collected after the answering model's training cutoff, does Qloo rank place the real pick higher among 10 candidates than Gemini or popularity?",
    status: `${run.stop.status === "stopped" ? "Stopped early" : "Complete"}: ${f.cases.length} of ${f.plannedCases} cases scored.`,
    limits: [
      "Each case has the real pick plus 9 decoys from the city's popularity list, so the test asks whether a method puts the real pick first among plausible options.",
      `Sample size: ${f.cases.length} of ${f.plannedCases} cases collected were scored, a small sample.`,
      ...(f.excluded.length ? [`${plural(f.excluded.length, "case")} excluded: ${f.excluded.map((e) => `${e.id} (${why(e.reason)})`).join("; ")}.`] : []),
      "Cases were collected and verified by AI agents, with no human review (Amendment 9).",
    ],
    runs: [{ label: "Run 1", commit: run.protocol.commit, status: run.stop.status === "stopped" ? "stopped" : "complete", note: `${plural(f.cases.length, "case")} scored of ${f.plannedCases}` }],
  };
}

// Catch rate -------------------------------------------------------------------------------------------------------------------

const PLANT_LABEL: Record<PlantKind, string> = { number_plausible: "A plausible wrong number", number_absent: "A number found nowhere in the evidence", entity: "A name swapped in from another card" };

function testCatch(run: ProofV3Results): ProofV3Test {
  const k: CatchRateSection = run.catchRate!;
  return {
    id: "catch", title: "Claim checker: does it remove planted false claims?",
    question: "When a number or a name in a playbook claim is changed to a wrong one, does the claim checker remove the claim?",
    status: run.stop.status === "complete" ? `Complete: ${k.planted} false claims planted among ${k.claims}` : "Stopped early", n: k.planted,
    tables: [{ columns: ["Planted as", "Caught"], rows: [...PLANT_KINDS.filter((t) => k.byType[t].planted > 0).map((t) => [PLANT_LABEL[t], `${k.byType[t].caught} of ${k.byType[t].planted}`]), ["All planted claims", `${k.caught} of ${k.planted}`]] }],
    signTests: [], ...splitLines(summarise({ ...run, cityRank: undefined, fixedRank: undefined, grounding: undefined })), perUnit: null,
  };
}

// Test C -----------------------------------------------------------------------------------------------------------------------

const CAT_LABEL = { venue: "Venues", brand: "Brands", local_act: "Local acts" } as const;
const ARM_NAME = { qloo: "Qloo playbook", llm: "LLM-only" } as const;

function groundRunLines(stopped: StoppedGroundRun[]): string[] {
  return stopped.map((r, i) => {
    const total = r.cities.length, done = total - r.notRun.length, errors = r.callCounts.qlooErrors + r.callCounts.geminiErrors;
    const ceiling = /ceiling of (\d+)/.exec(r.stop.reason ?? "")?.[1];
    return ceiling
      ? `Run ${i + 1} stopped at the runner's ${ceiling}-call ceiling after ${done} of ${total} cities (${plural(errors, "error")}); per Amendment 6 the ceiling was raised and Test C re-run from the start before any rating.`
      : `Run ${i + 1} stopped (${stopCode(r.stop.reason)}) after ${done} of ${total} cities (${plural(errors, "error")}) and Test C was re-run from the start before any rating.`;
  });
}

function testC(run: ProofV3Results, stopped: StoppedGroundRun[]): ProofV3Test {
  const g: GroundingSection = run.grounding!;
  const cell = (r: { inCity: number; rated: number; share: number | null }) => `${r.inCity} of ${r.rated} (${f2(r.share)})`;
  return {
    id: "C", title: "Test C: do the names exist in the city?",
    question: `Do the venues, sponsor brands and local acts a playbook names really exist in the city? Qloo's playbook as shipped against an LLM-only playbook, for ${g.artist}.`,
    status: `${run.stop.status === "stopped" ? "Stopped early" : "Complete"}: ${plural(g.cities.length, "city", "cities")} rated`, n: g.cities.length,
    tables: [{ columns: ["Playbook", ...GROUND_CATEGORIES.map((c) => CAT_LABEL[c]), "Overall", "Can't tell"],
      rows: GROUND_ARMS.map((a) => [ARM_NAME[a], ...GROUND_CATEGORIES.map((c) => cell(g.byArm[a].byCategory[c])), cell(g.byArm[a].overall), String(g.byArm[a].overall.cantTell)]) }],
    signTests: [sign("Qloo vs LLM-only (per city)", g.signTest), sign("Qloo vs LLM-only, equal counts (secondary)", g.secondary.signTest)],
    ...(() => { const sp = splitLines(summarise({ ...run, cityRank: undefined, fixedRank: undefined, catchRate: undefined })); return { claims: sp.claims, limits: [...groundRunLines(stopped), ...sp.limits, "The author, who rated 34 of the 182 rows, had seen the shipped showcase playbooks (Amendments 5 and 8)."] }; })(),
    // Aggregates only: shares per city, no venue, brand or act names.
    perUnit: { columns: ["City", "Qloo", "LLM-only"], rows: g.perCity.map((c) => [c.city, f2(c.qloo), f2(c.llm)]) },
  };
}

// Test F (Amendment 7) -------------------------------------------------------------------------------------------------------

const FUSED = N("Gemini + Qloo", "Gemini + Qloo");

function testF(fu: FusionFile): ProofV3Test {
  const b = fu.testB, a = fu.testA;
  const gem = N("Gemini alone", "Gemini alone"), llm = N("The generic LLM", "the generic LLM");
  const fusedClaim = (full: FusionSummary, ref: Name, metric: string, unit: string, win: string): string => {
    const text = compare(FUSED, ref, full.means.fusion ?? null, full.means[ref === gem ? "gemini" : "llm"] ?? null, full.signTest, metric, unit);
    return claimMet(full.means.fusion ?? null, full.means[ref === gem ? "gemini" : "llm"] ?? null, full.signTest) ? text.replace(/^Gemini \+ Qloo beat [^(]*/, win) : text;
  };
  const exploratory = (label: string, s: Subset, ref: Name, metric: string, unit: string, win: string): string =>
    s.n === 0 ? `Exploratory (${label}): the subset is empty (n = 0), so there is nothing to score.` : `Exploratory, small n (${label}): ${fusedClaim(s, ref, metric, unit, win)}`;
  const dropped = (s: FusionSummary, noun: string) => (s.exclusions.length ? [`${plural(s.exclusions.length, noun)} excluded from the fusion analysis: ${s.exclusions.map((e) => `${e.id} (${e.reason})`).join("; ")}.`] : []);
  const sub = (s: Subset) => `${s.n}`;
  const bRow = (label: string, v: number | null) => [label, f2(v)];
  const subRows = (test: string, s: Subset, arms: Array<[string, string]>): string[][] =>
    s.n === 0 ? [[test, "none (n = 0)", "-"]] : [...arms.map(([k, name]) => [test, name, f2(s.means[k] ?? null)]), [test, FUSED.start, f2(s.means.fusion ?? null)]];
  const unitB = b.full.rows.map((r) => ["B", r.id, `#${Math.round(1 / (r.scores.gemini ?? NaN))}`, `#${Math.round(1 / (r.scores.qloo_rank ?? NaN))}`, `#${Math.round(1 / r.fusion)}`]);
  const unitA = a.full.rows.map((r) => ["A", r.id, f2(r.scores.llm ?? null), f2(r.scores.winnability ?? null), f2(r.fusion)]);
  return {
    id: "F", title: "Gemini + Qloo combined (Amendment 7)", question: "Does Gemini's ranking get better when Qloo's ranking is fused in?",
    status: `Computed offline from stored rankings: Test B ${b.full.n} of ${b.scored} cases, Test A ${a.full.n} of ${a.artists} artists`,
    n: b.full.n,
    tables: [
      { columns: ["Test B arm", "Mean reciprocal rank"], rows: [bRow(FIXED_LABEL.gemini, b.full.means.gemini ?? null), bRow(FIXED_LABEL.qloo_rank, b.full.means.qloo_rank ?? null), bRow(FIXED_LABEL.popularity, b.full.means.popularity ?? null), bRow(FUSED.start, b.full.means.fusion ?? null)] },
      { columns: ["Test A arm", "Mean R-precision"], rows: [...ARMS.map((arm) => bRow(ARM_LABEL[arm], a.full.means[arm] ?? null)), bRow("Generic LLM + winnability", a.full.means.fusion ?? null)] },
      { columns: ["Exploratory subset (tours after the model's cutoff)", "Arm", "Mean"], rows: [...subRows("Test B", b.postCutoff, [["gemini", FIXED_LABEL.gemini], ["qloo_rank", FIXED_LABEL.qloo_rank], ["popularity", FIXED_LABEL.popularity]]), ...subRows("Test A", a.postCutoff, ARMS.map((arm) => [arm, ARM_LABEL[arm]] as [string, string]))] },
    ],
    signTests: [
      sign("Gemini + Qloo vs Gemini (Test B)", b.full.signTest), sign("Gemini + Qloo vs the generic LLM (Test A)", a.full.signTest),
      sign("Gemini + Qloo vs Gemini (Test B, exploratory)", b.postCutoff.signTest), sign("Gemini + Qloo vs the generic LLM (Test A, exploratory)", a.postCutoff.signTest),
    ],
    claims: [
      fusedClaim(b.full, gem, "reciprocal rank", "case", "Gemini + Qloo ranked the real tour's pick better than Gemini alone "),
      fusedClaim(a.full, llm, "R-precision", "artist", "Gemini + Qloo picked the played cities better than the generic LLM alone "),
      exploratory("Test B, tours after the model's cutoff", b.postCutoff, gem, "reciprocal rank", "case", "Gemini + Qloo ranked the real tour's pick better than Gemini alone "),
      exploratory("Test A, first shows after the model's cutoff", a.postCutoff, llm, "R-precision", "artist", "Gemini + Qloo picked the played cities better than the generic LLM alone "),
    ],
    limits: [
      "Disclosure (Amendment 7): this was written on 29 October 2026, after Tests A and B were published (Test A: LLM beat winnability, p=0.031; Test B: Qloo beat popularity, p<0.001, and trailed Gemini, not significant). Each arm's per-case rankings existed on disk, but no fused ranking or fused score had been computed before the amendment was committed. Tests A and B stay exactly as published.",
      `Method: reciprocal rank fusion with k = ${fu.rule.k} (Cormack, Clarke & Buettcher, SIGIR 2009), fixed in advance, no alternative rule tried. A candidate scores 1/(60 + Gemini or LLM rank) + 1/(60 + Qloo rank); ties go to the Gemini or LLM rank. No new Qloo or Gemini call was made.`,
      "Data timing: Qloo's taste data is current, not as of the tour date; Gemini's training data may include the tour.",
      `Sample size: Test B ${b.full.n} of ${b.planned} planned cases and Test A ${a.full.n} of ${a.artists} artists, small samples, so the sign tests have low power.`,
      `Exploratory, small n (7.2): tours after the answering model's stated training cutoff only. Test B subset ${sub(b.postCutoff)} of ${b.full.n} cases; Test A subset ${sub(a.postCutoff)} of ${a.full.n} artists${a.postCutoff.n === 0 ? " (no Test A artist's first show falls after the cutoff, so that subset is empty)" : ""}. Test A uses only the first-show year, which errs towards excluding.`,
      ...dropped(b.full, "case"), ...dropped(a.full, "artist"),
    ],
    perUnit: { columns: ["Test", "Case or artist", "Gemini or LLM", "Qloo or winnability", "Combined"], rows: [...unitB, ...unitA] },
  };
}

/** The checkers file as the CLI wrote it; only the counts are read. */
export type CheckersFile = Pick<CheckersResult, "checkers" | "sponsorNameRuleOnly">;
const CHECKER_ANCHOR: Record<string, string> = { answer: "10a-strategist-answer-check", document: "10b-document-citation-check", advance: "10c-advance-source-and-number-filter", sponsor: "10d-sponsor-check" };
const CHECKER_NOTE: Record<string, string> = {
  answer: "Planted errors are fixed, synthetic answers; the controls include numbers with a dropped minus sign.",
  document: "Planted errors are fixed, synthetic citations to one 10-page document.",
  advance: "Planted errors are 10 results about another country (5 of them naming the destination only in the body) and 10 numbers absent from their own source.",
  sponsor: "Measures the rule given a fixed fake classifier output, not the live model.",
};
const claimOf = (c: { caught: number; planted: number; falseAlarms: number; controls: number }): string => `caught ${c.caught} of ${c.planted}, false alarms ${c.falseAlarms} of ${c.controls}`;
function publishCheckers(f: CheckersFile): ProofV3Checkers {
  const n = f.sponsorNameRuleOnly;
  return {
    amendment: 10,
    rows: f.checkers.map((c) => ({
      id: c.id, checker: c.checker, guards: c.guards, caught: c.caught, planted: c.planted, falseAlarms: c.falseAlarms, controls: c.controls,
      claim: claimOf(c), anchor: CHECKER_ANCHOR[c.id] ?? "", note: CHECKER_NOTE[c.id] ?? "",
    })),
    nameRuleOnly: { caught: n.caught, planted: n.planted, falseAlarms: n.falseAlarms, controls: n.controls },
  };
}

export function buildProofV3(i: PublishInputs): ProofV3Published {
  const tests: ProofV3Test[] = [];
  if (i.batches.length) tests.push(testA(i.batches));
  if (i.fixed?.fixedRank) tests.push(testB(i.fixed, i.fixedStopped ?? []));
  if (i.fixedPostCutoff?.fixedRank) tests.push(testBPostCutoff(i.fixedPostCutoff));
  if (i.catchRate?.catchRate) tests.push(testCatch(i.catchRate));
  if (i.grounding?.grounding) tests.push(testC(i.grounding, i.groundingStopped ?? []));
  if (i.fusion) tests.push(testF(i.fusion));
  return { protocolCommit: i.protocolCommit, generatedAt: i.now.toISOString(), amendments: i.amendments, tests, ...(i.checkers ? { checkers: publishCheckers(i.checkers) } : {}) };
}

/** "## Amendment N ..." sections of the protocol, each reduced to the first sentence of its Why / What happened / Question line. */
export function parseAmendments(md: string, commitOf: (n: number) => string): Amendment[] {
  const out: Amendment[] = [];
  const parts = md.split(/^## Amendment (\d+)/m);
  for (let k = 1; k < parts.length; k += 2) {
    const n = Number(parts[k]);
    const m = /^\*\*(?:Why|What happened|Question):\*\*\s*(.+)$/m.exec(parts[k + 1] ?? "");
    const first = m ? (/^(.*?[.?!])(\s|$)/.exec(m[1]!)?.[1] ?? m[1]!) : "";
    out.push({ n, commit: commitOf(n), summary: first.length > 240 ? `${first.slice(0, 237)}...` : first });
  }
  return out;
}
