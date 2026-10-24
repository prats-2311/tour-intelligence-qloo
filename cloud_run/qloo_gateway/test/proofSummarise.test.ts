import { describe, expect, it } from "vitest";
import { ARMS, computeCityRankStats, computeFixedStats, summarise, type ArmName, type CityRankArtist, type FixedCaseResult, type ProofV3Results } from "../src/backtest/proofResults.js";

type R = Partial<Record<ArmName, number | null>>;
/** One scored artist with the given R-precision per arm (null = no answer). N = 4 of 10 candidates unless said otherwise. */
function artist(position: number, name: string, r: R, N = 4, count = 10, bo: CityRankArtist["boardOnly"] = null): CityRankArtist {
  const arms = Object.fromEntries(ARMS.map((a) => {
    const v = r[a];
    return [a, v === null || v === undefined ? { status: "no_answer", reason: "not_a_permutation" } : { status: "ok", ranking: [], rPrecision: v, hits: [] }];
  })) as CityRankArtist["arms"];
  return { position, artist: name, tourTitle: "T", url: "u", sessionId: `proof-v3-city-${position}`, regions: ["Mexico"], firstShowYear: 2024, playedTotal: 8, boardCount: 8, playedExtras: (count - 8) / 2, decoyExtras: (count - 8) / 2, boardMostlyPlayed: false, anchoring: [], boardOnly: bo, candidateCount: count, n: N, chance: N / count, candidates: [], arms };
}
const base = (): ProofV3Results => ({
  schemaVersion: 3, generatedAt: "2026-10-24T00:00:00Z", protocol: { path: "docs/qloo/proof-v3-protocol.md", commit: "abc" }, calibrationVersion: "cal",
  models: { gemini: ["g1"], geminiUsed: ["g1"] }, callCounts: { qloo: 0, gemini: 0, qlooErrors: 0, geminiErrors: 0 }, stop: { status: "complete" }, summary: [],
});
const withA = (artists: CityRankArtist[], extra: Partial<NonNullable<ProofV3Results["cityRank"]>> = {}): ProofV3Results =>
  ({ ...base(), cityRank: { batch: 1, plannedArtists: 6, plannedTotal: 12, artists, dropped: [], notRun: [], stats: computeCityRankStats(artists), ...extra } });

describe("computeCityRankStats", () => {
  it("means over answered artists, chance level, and sign tests with no-answer artists excluded from that arm", () => {
    const as = [
      artist(1, "A", { winnability: 1, fan_heat: 0.5, llm: 0.25, population: 0.5 }),
      artist(2, "B", { winnability: 0.75, fan_heat: 0.75, llm: null, population: 0.25 }),
      artist(3, "C", { winnability: 0.5, fan_heat: 0.25, llm: 0.5, population: 0.25 }),
    ];
    const s = computeCityRankStats(as);
    expect(s.arms.winnability).toEqual({ answered: 3, mean: 0.75 });
    expect(s.arms.llm).toEqual({ answered: 2, mean: 0.375 });
    expect(s.meanChance).toBeCloseTo(0.4, 10);
    expect(s.signTests.vs_fan_heat).toMatchObject({ wins: 2, losses: 0, ties: 1, n: 2 });
    expect(s.signTests.vs_llm).toMatchObject({ wins: 1, losses: 0, ties: 1, n: 1, p: 1 });
    expect(s.signTests.vs_population).toMatchObject({ wins: 3, losses: 0 });
    expect(s.signTests.vs_population.p).toBeCloseTo(0.25, 10);
  });
  it("board-only R-precision: mean and sign test over artists that have a played board city", () => {
    const as = [artist(1, "A", { winnability: 1 }, 4, 10, { n: 2, count: 8, winnability: 1, fan_heat: 0.5 }), artist(2, "B", { winnability: 1 }), artist(3, "C", { winnability: 1 }, 4, 10, { n: 3, count: 8, winnability: 0.5, fan_heat: 1 })];
    const s = computeCityRankStats(as);
    expect(s.boardOnly).toMatchObject({ answered: 2, winnability: 0.75, fan_heat: 0.75 });
    expect(s.boardOnly.signTest).toMatchObject({ wins: 1, losses: 1, p: 1 });
  });
  it("empty input has null means and p=1", () => {
    const s = computeCityRankStats([]);
    expect(s.arms.winnability).toEqual({ answered: 0, mean: null });
    expect(s.meanChance).toBeNull();
    expect(s.signTests.vs_fan_heat.p).toBe(1);
  });
});

describe("summarise: claim rule", () => {
  const six = (w: number[], f: number[], l: number[], p: number[]) => w.map((x, i) => artist(i + 1, `Artist${i + 1}`, { winnability: x, fan_heat: f[i]!, llm: l[i]!, population: p[i]! }));

  it("claims a win only when the mean is higher AND p < 0.05 (6-0 against fan heat)", () => {
    const text = summarise(withA(six([1, 1, 1, 1, 1, 1], [0.5, 0.5, 0.5, 0.5, 0.5, 0.5], [1, 1, 1, 1, 1, 1], [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]))).join("\n");
    expect(text).toMatch(/Winnability beat fan heat \(p=0\.031\)/);
    expect(text).toMatch(/Not significant at this sample size: .*LLM/i); // tied with the LLM
  });
  it("the winner needs more per-artist wins than losses: 2 big wins and 10 narrow losses (p=0.039, higher mean) is no claim", () => {
    const as = [...Array.from({ length: 2 }, (_, i) => artist(i + 1, `Big${i}`, { winnability: 1, fan_heat: 0, llm: 0, population: 0 })), ...Array.from({ length: 10 }, (_, i) => artist(i + 3, `Narrow${i}`, { winnability: 0.25, fan_heat: 0.3, llm: 0.3, population: 0.3 }))];
    const stats = computeCityRankStats(as);
    expect(stats.signTests.vs_fan_heat).toMatchObject({ wins: 2, losses: 10 });
    expect(stats.signTests.vs_fan_heat.p).toBeLessThan(0.05);
    expect(stats.arms.winnability.mean!).toBeGreaterThan(stats.arms.fan_heat.mean!);
    const text = summarise(withA(as)).join("\n");
    expect(text).not.toMatch(/Winnability beat/);
    expect(text).toMatch(/Not significant at this sample size: winnability leads fan heat/);
    // and the mirror: the other arm cannot claim a win it lost on the sign test either
    const mirror = summarise(withA(as.map((a) => ({ ...a, arms: { ...a.arms, winnability: a.arms.fan_heat, fan_heat: a.arms.winnability } })) as CityRankArtist[])).join("\n");
    expect(mirror).not.toMatch(/Fan heat beat winnability \(p/);
  });
  it("reports the secondary board-only comparison, the re-anchoring changes and the protocol's disclosures", () => {
    const a = { ...artist(1, "A", { winnability: 1, fan_heat: 0.5, llm: 0.5, population: 0.5 }, 4, 10, { n: 2, count: 8, winnability: 1, fan_heat: 0.5 }), anchoring: [{ from: "Queens", to: "New York City" }] };
    const text = summarise(withA([a])).join("\n");
    expect(text).toMatch(/Secondary, board cities only/);
    expect(text).toContain("Queens was re-anchored to New York City");
    for (const needle of [/floor/, /Data timing/, /routing an agent chose/, /Sample size/, /venue name/, /Amendments 1 and 2/]) expect(text).toMatch(needle);
  });
  it("5-1 is not significant even though the mean is higher, and the loss is named", () => {
    const as = six([1, 1, 1, 1, 1, 0.25], [0.5, 0.5, 0.5, 0.5, 0.5, 0.75], [0.5, 0.5, 0.5, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    const lines = summarise(withA(as));
    const fan = lines.find((l) => /fan heat/i.test(l) && /significant|beat/i.test(l))!;
    expect(fan).toMatch(/^Not significant at this sample size: winnability .* fan heat/);
    expect(fan).toContain("p=0.219");
    expect(fan).not.toMatch(/beat fan heat/);
    expect(lines.join("\n")).toContain("Fan heat beat winnability for Artist6");
  });
  it("a higher mean but a lower-than-0.05 p in the other direction is the other arm's win; the LLM leading is stated plainly", () => {
    const as = six([0.25, 0.25, 0.25, 0.25, 0.25, 0.25], [0.25, 0.25, 0.25, 0.25, 0.25, 0.25], [0.5, 0.5, 0.5, 0.5, 0.5, 0.5], [0.25, 0.25, 0.25, 0.25, 0.25, 0.25]);
    const text = summarise(withA(as)).join("\n");
    expect(text).toMatch(/The generic LLM beat winnability \(p=0\.031\)/);
    expect(text).toContain("The generic LLM beat winnability for Artist1");
  });
  it("a mean that is higher with 5-1 in a different direction than the mean never reads as a win", () => {
    // winnability wins 3 artists narrowly and loses 2 big: mean lower, p high.
    const as = six([0.5, 0.5, 0.5, 0, 0, 0.25], [0.25, 0.25, 0.25, 1, 1, 0.25], [0.25, 0.25, 0.25, 1, 1, 0.25], [0.25, 0.25, 0.25, 1, 1, 0.25]);
    const text = summarise(withA(as)).join("\n");
    expect(text).not.toMatch(/Winnability beat/);
    expect(text).toMatch(/Not significant at this sample size: winnability trails fan heat/);
  });
  it("states the chance level, the sample size against the plan, and a stop reason", () => {
    const text = summarise({ ...withA(six([1, 1, 1], [0, 0, 0], [0, 0, 0], [0, 0, 0]).slice(0, 3)), stop: { status: "stopped", reason: "qloo HTTP 429" } }).join("\n");
    expect(text).toMatch(/3 of a planned 12 artists/);
    expect(text).toContain("qloo HTTP 429");
    expect(text).toMatch(/chance/i);
  });
  it("names dropped artists", () => {
    const text = summarise(withA([artist(1, "A", { winnability: 1, fan_heat: 0, llm: 0, population: 0 })], { dropped: [{ position: 2, artist: "Zed", reason: "board error NOT_FOUND" }] })).join("\n");
    expect(text).toContain("Zed");
    expect(text).toContain("NOT_FOUND");
  });
});

function fixedCase(id: string, rr: Record<"qloo_rank" | "gemini" | "popularity", number | null>): FixedCaseResult {
  const arm = (v: number | null) => (v === null ? { status: "no_answer" as const, reason: "x" } : { status: "ok" as const, ranking: [], rank: Math.round(1 / v), rr: v });
  return { id, artist: "Art", city: "C", country: "MX", activationType: "sponsor", status: "scored", realPick: { name: "R", entityId: "00000000-r" }, candidates: [], arms: { qloo_rank: arm(rr.qloo_rank), gemini: arm(rr.gemini), popularity: arm(rr.popularity) } };
}
describe("Test B stats and summary", () => {
  it("MRR per arm over answered cases, sign tests, chance MRR for 10 candidates", () => {
    const cs = [fixedCase("a", { qloo_rank: 1, gemini: 0.5, popularity: 0.25 }), fixedCase("b", { qloo_rank: 0.5, gemini: 0.5, popularity: null }), fixedCase("c", { qloo_rank: 1, gemini: 0.25, popularity: 0.5 })];
    const s = computeFixedStats(cs);
    expect(s.arms.qloo_rank).toEqual({ answered: 3, mrr: (1 + 0.5 + 1) / 3 });
    expect(s.arms.popularity.answered).toBe(2);
    expect(s.signTests.qloo_vs_gemini).toMatchObject({ wins: 2, losses: 0, ties: 1 });
    expect(s.chanceMrr).toBeCloseTo(0.2929, 3);
  });
  it("summarise applies the same claim rule and names losses", () => {
    const wins = Array.from({ length: 8 }, (_, i) => fixedCase(`w${i}`, { qloo_rank: 1, gemini: 0.5, popularity: 0.5 }));
    const lost = fixedCase("lost-case", { qloo_rank: 0.25, gemini: 1, popularity: 0.5 });
    const cases = [...wins, lost];
    const text = summarise({ ...base(), fixedRank: { plannedCases: 27, cases, excluded: [{ id: "tiny", reason: "too few candidates" }], notRun: [], stats: computeFixedStats(cases) } }).join("\n");
    expect(text).toMatch(/Qloo rank beat Gemini \(p=0\.0\d\d\)/);
    expect(text).toContain("Gemini beat Qloo rank for lost-case");
    expect(text).toContain("tiny");
  });
  it("Test B with no significant difference says so", () => {
    const cases = [fixedCase("a", { qloo_rank: 1, gemini: 0.5, popularity: 0.5 }), fixedCase("b", { qloo_rank: 0.5, gemini: 1, popularity: 0.5 })];
    const text = summarise({ ...base(), fixedRank: { plannedCases: 27, cases, excluded: [], notRun: [], stats: computeFixedStats(cases) } }).join("\n");
    expect(text).toMatch(/Not significant at this sample size: Qloo rank/);
  });
});

describe("catch rate summary", () => {
  it("states the catch rate per plant type, names a miss on plausible numbers as a limit, and does not present the false-alarm rate as a finding", () => {
    const byType = { number_plausible: { planted: 4, caught: 2, catchRate: 0.5 }, number_absent: { planted: 3, caught: 3, catchRate: 1 }, entity: { planted: 3, caught: 3, catchRate: 1 } };
    const text = summarise({ ...base(), catchRate: { source: "s", claims: 30, planted: 10, caught: 8, catchRate: 0.8, trueClaims: 20, falseAlarms: 1, falseAlarmRate: 0.05, byType, falseAlarmNote: "drawn from claims the verifier had already accepted.", rows: [] } }).join("\n");
    expect(text).toContain("8 of 10 planted false claims");
    expect(text).toContain("plausible wrong number (real elsewhere in the playbook): caught 2 of 4");
    expect(text).toContain("a limit of the checker");
    expect(text).toMatch(/False alarms \(1 of 20\) are not a finding: drawn from claims/);
  });
});
