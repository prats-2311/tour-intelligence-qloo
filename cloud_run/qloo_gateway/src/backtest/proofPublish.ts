import {
  ARMS, ARM_LABEL, DISCLOSURES, FIXED_ARMS, FIXED_LABEL, GROUND_ARMS, GROUND_CATEGORIES, PLANT_KINDS, computeCityRankStats, stopCode, summarise,
  type CatchRateSection, type CityRankArtist, type CityRankSection, type FixedCaseResult, type GroundingSection, type PlantKind, type ProofV3Results, type SignRow,
} from "./proofResults.js";

/**
 * The public face of Proof v3 (docs/qloo/proof-v3-protocol.md): one `proofV3` object under the private backtest file, rendered generically by the dashboard's /proof page.
 * Strings in `tables` and `perUnit` are pre-formatted, so a new test (Test C) is added as data only. Nothing here carries a Qloo-returned entity name.
 */
export interface Table { columns: string[]; rows: string[][] }
export interface SignLine { label: string; wins: number; losses: number; ties: number; pairs: number; p: number }
export interface RunLine { label: string; commit: string; status: "complete" | "stopped"; note: string }
export interface ProofV3Test {
  id: "A" | "B" | "C" | "catch"; title: string; question: string; status: string; n: number;
  /** Arm table first (R-precision, MRR, catch counts, in-city shares). */
  tables: Table[]; signTests: SignLine[]; claims: string[]; limits: string[]; runs?: RunLine[];
  /** The "Per artist/case" disclosure; null when a test has no per-unit rows. */
  perUnit: Table | null;
}
export interface Amendment { n: number; commit: string; summary: string }
export interface ProofV3Published { protocolCommit: string; generatedAt: string; amendments: Amendment[]; tests: ProofV3Test[] }

export interface PublishInputs {
  protocolCommit: string; amendments: Amendment[];
  /** Test A batches, in order. */
  batches: ProofV3Results[];
  fixed?: ProofV3Results; /** Earlier stopped runs of Test B, oldest first. */ fixedStopped?: ProofV3Results[];
  catchRate?: ProofV3Results; grounding?: ProofV3Results; now: Date;
}

const f2 = (v: number | null): string => (v === null ? "n/a" : v.toFixed(2));
const sign = (label: string, s: SignRow): SignLine => ({ label, wins: s.wins, losses: s.losses, ties: s.ties, pairs: s.pairs, p: s.p });
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const isLimitLine = (l: string): boolean => /^(Method|Disclosure):|^False alarms|^The checker missed/.test(l);
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
    claims: lines.filter((l) => !DISCLOSURES.includes(l)), limits: [...DISCLOSURES],
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
      `Sample size: ${plural(f.cases.length, "case")} is a small sample.`,
      ...(f.excluded.length ? [`${plural(f.excluded.length, "case")} excluded: ${f.excluded.map((e) => `${e.id} (${e.reason})`).join("; ")}.`] : []),
    ],
    runs,
    perUnit: { columns: ["Case", ...FIXED_ARMS.map((a) => FIXED_LABEL[a])], rows: f.cases.map((c) => [c.id, ...FIXED_ARMS.map((a) => rankText(c, a))]) },
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

function testC(run: ProofV3Results): ProofV3Test {
  const g: GroundingSection = run.grounding!;
  const cell = (r: { inCity: number; rated: number; share: number | null }) => `${r.inCity} of ${r.rated} (${f2(r.share)})`;
  return {
    id: "C", title: "Test C: do the names exist in the city?",
    question: `Do the venues, sponsor brands and local acts a playbook names really exist in the city? Qloo's playbook as shipped against an LLM-only playbook, for ${g.artist}.`,
    status: `${run.stop.status === "stopped" ? "Stopped early" : "Complete"}: ${plural(g.cities.length, "city", "cities")} rated`, n: g.cities.length,
    tables: [{ columns: ["Playbook", ...GROUND_CATEGORIES.map((c) => CAT_LABEL[c]), "Overall", "Can't tell"],
      rows: GROUND_ARMS.map((a) => [ARM_NAME[a], ...GROUND_CATEGORIES.map((c) => cell(g.byArm[a].byCategory[c])), cell(g.byArm[a].overall), String(g.byArm[a].overall.cantTell)]) }],
    signTests: [sign("Qloo vs LLM-only (per city)", g.signTest), sign("Qloo vs LLM-only, equal counts (secondary)", g.secondary.signTest)],
    ...splitLines(summarise({ ...run, cityRank: undefined, fixedRank: undefined, catchRate: undefined })),
    // Aggregates only: shares per city, no venue, brand or act names.
    perUnit: { columns: ["City", "Qloo", "LLM-only"], rows: g.perCity.map((c) => [c.city, f2(c.qloo), f2(c.llm)]) },
  };
}

export function buildProofV3(i: PublishInputs): ProofV3Published {
  const tests: ProofV3Test[] = [];
  if (i.batches.length) tests.push(testA(i.batches));
  if (i.fixed?.fixedRank) tests.push(testB(i.fixed, i.fixedStopped ?? []));
  if (i.catchRate?.catchRate) tests.push(testCatch(i.catchRate));
  if (i.grounding?.grounding) tests.push(testC(i.grounding));
  return { protocolCommit: i.protocolCommit, generatedAt: i.now.toISOString(), amendments: i.amendments, tests };
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
