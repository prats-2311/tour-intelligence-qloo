import { describe, expect, it } from "vitest";
import { RRF_K, claimMet, cutoffOf, fuseCity, fuseFixed, postCutoffCity, postCutoffFixed, rrf, verifyCity, verifyFixed } from "../src/backtest/fusion.js";
import { computeCityRankStats, computeFixedStats, type CityRankArtist, type FixedCaseResult } from "../src/backtest/proofResults.js";

const ids = ["a", "b", "c", "d"];
const arm = (ranking: string[], real = "a") => { const rank = ranking.indexOf(real) + 1; return { status: "ok" as const, ranking, rank, rr: 1 / rank }; };
const no = { status: "no_answer" as const, reason: "x" };
function fcase(id: string, gem: string[] | null, qloo: string[] | null, model = "gemini-3.8-flash"): FixedCaseResult {
  return {
    id, artist: "Synth", city: "Testville", country: "T", activationType: "sponsor", status: "scored", realPick: { name: "r", entityId: "a" },
    candidates: ids.map((x) => ({ name: x, entityId: x, real: x === "a" })), geminiModel: model,
    arms: { gemini: gem ? arm(gem) : no, qloo_rank: qloo ? arm(qloo) : no, popularity: arm(["d", "c", "b", "a"]) },
  };
}

describe("rrf", () => {
  it("orders by summed score", () => {
    // b: 1/62+1/62 = .03226; a: 1/61+1/63 = .03227; so a beats b by a hair; c: 1/63+1/61 tie with a.
    expect(rrf(["a", "b", "c"], ["c", "b", "a"])).toEqual(["a", "c", "b"]);
  });
  it("breaks ties by the first list's rank", () => {
    expect(rrf(["x", "y"], ["y", "x"])).toEqual(["x", "y"]);
    expect(rrf(["y", "x"], ["x", "y"])).toEqual(["y", "x"]);
  });
  it("an item missing from a list contributes 0 for it", () => {
    expect(rrf(["a", "b"], ["b"])).toEqual(["b", "a"]);
  });
  it("k is 60", () => {
    expect(RRF_K).toBe(60);
  });
});

describe("fuseFixed", () => {
  const cases = [
    fcase("c1", ["b", "a", "c", "d"], ["a", "b", "c", "d"]), // gemini rr .5, qloo 1, fused: a (2nd,1st) vs b (1st,2nd) tie -> gemini order b first -> rr .5
    fcase("c2", ["c", "d", "b", "a"], ["a", "b", "c", "d"]),
    fcase("c3", null, ["a", "b", "c", "d"]),
    fcase("c4", ["a", "b", "c", "d"], null),
  ];
  const r = fuseFixed(cases);
  it("excludes cases where an input arm has no answer, with a reason", () => {
    expect(r.rows.map((x) => x.id)).toEqual(["c1", "c2"]);
    expect(r.exclusions.map((e) => e.id)).toEqual(["c3", "c4"]);
    expect(r.exclusions[0]!.reason).toMatch(/gemini/);
    expect(r.exclusions[1]!.reason).toMatch(/qloo_rank/);
  });
  it("scores the fused list's real pick", () => {
    expect(r.rows[0]!.fusion).toBeCloseTo(0.5);
    expect(r.n).toBe(2);
  });
  it("means are over the same included cases", () => {
    expect(r.means.gemini).toBeCloseTo((0.5 + 0.25) / 2);
    expect(r.means.qloo_rank).toBeCloseTo(1);
    expect(r.means.popularity).toBeCloseTo(0.25);
    expect(r.signTest.pairs).toBe(2);
  });
});

describe("claimMet", () => {
  it("needs a higher mean, more wins than losses, and p < 0.05", () => {
    expect(claimMet(0.6, 0.5, { wins: 6, losses: 0, ties: 0, n: 6, p: 0.03125, pairs: 6 })).toBe(true);
    expect(claimMet(0.6, 0.5, { wins: 5, losses: 1, ties: 0, n: 6, p: 0.2, pairs: 6 })).toBe(false);
    expect(claimMet(0.4, 0.5, { wins: 6, losses: 0, ties: 0, n: 6, p: 0.03125, pairs: 6 })).toBe(false);
    expect(claimMet(null, 0.5, { wins: 0, losses: 0, ties: 0, n: 0, p: 1, pairs: 0 })).toBe(false);
  });
});

describe("cutoffs", () => {
  it("maps the stated models; others are unknown", () => {
    expect(cutoffOf("gemini-2.5-flash")).toEqual({ year: 2025, month: "2025-01" });
    expect(cutoffOf("gemini-3.8-flash")).toEqual({ year: 2026, month: "2026-03" });
    expect(cutoffOf("gemini-9")).toBeNull();
    expect(cutoffOf(undefined)).toBeNull();
  });
});

describe("postCutoffFixed", () => {
  const cases = [
    fcase("old", ["a", "b", "c", "d"], ["a", "b", "c", "d"], "gemini-2.5-flash"),
    fcase("new25", ["b", "a", "c", "d"], ["a", "b", "c", "d"], "gemini-2.5-flash"),
    fcase("same-month", ["a", "b", "c", "d"], ["a", "b", "c", "d"], "gemini-3.8-flash"),
    fcase("odd", ["a", "b", "c", "d"], ["a", "b", "c", "d"], "mystery"),
    fcase("undated", ["a", "b", "c", "d"], ["a", "b", "c", "d"], "gemini-3.8-flash"),
  ];
  const dates = new Map([["old", "2025-01"], ["new25", "2025-02-14"], ["same-month", "2026-03"], ["odd", "2026-09"]]);
  const fused = fuseFixed(cases);
  it("keeps strictly-after-cutoff months only and lists the rest", () => {
    const s = postCutoffFixed(fused, dates);
    expect(s.n).toBe(1);
    expect(s.rows.map((x) => x.id)).toEqual(["new25"]);
    expect(Object.fromEntries(s.exclusions.map((e) => [e.id, e.reason]))).toMatchObject({ old: "not after cutoff", "same-month": "not after cutoff", odd: "unknown cutoff", undated: "no tour date" });
    expect(s.means.gemini).toBeCloseTo(0.5);
  });
  it("an empty subset is n = 0, not an error", () => {
    const s = postCutoffFixed(fused, new Map());
    expect(s.n).toBe(0);
    expect(s.means.fusion).toBeNull();
    expect(s.signTest.pairs).toBe(0);
    expect(s.claim).toBe(false);
  });
});

function artist(name: string, year: number, llm: string[] | null, win: string[] | null, model = "gemini-3.8-flash"): CityRankArtist {
  const played = new Set(["a", "b"]);
  const r = (ranking: string[]) => ({ status: "ok" as const, ranking, rPrecision: ranking.slice(0, 2).filter((x) => played.has(x)).length / 2, hits: [] });
  return {
    position: 1, artist: name, tourTitle: "T", url: "u", sessionId: "s", regions: [], firstShowYear: year, playedTotal: 2, boardCount: 2, playedExtras: 0, decoyExtras: 0, boardMostlyPlayed: false,
    anchoring: [], boardOnly: null, candidateCount: 4, n: 2, chance: 0.5, llmModel: model,
    candidates: ids.map((id) => ({ id, name: id, country: "T", population: 1, origin: "board" as const, candidateSource: "x", played: played.has(id), winnability: null, fanHeat: null, verdict: "", })),
    arms: { winnability: win ? r(win) : no, fan_heat: r(["c", "d", "a", "b"]), population: r(["c", "d", "a", "b"]), llm: llm ? r(llm) : no },
  };
}

describe("fuseCity", () => {
  const arts = [artist("X", 2023, ["a", "c", "b", "d"], ["b", "a", "c", "d"]), artist("Y", 2026, ["c", "d", "a", "b"], ["a", "b", "c", "d"]), artist("Z", 2026, null, ["a", "b", "c", "d"])];
  const r = fuseCity(arts);
  it("scores R-precision of the fused list over the played set", () => {
    expect(r.rows.map((x) => x.id)).toEqual(["X", "Y"]);
    expect(r.exclusions.map((e) => e.id)).toEqual(["Z"]);
    expect(r.rows[0]!.fusion).toBe(1); // a: 1st+2nd, b: 3rd+1st -> a,b lead
    expect(r.means.llm).toBeCloseTo((0.5 + 0) / 2);
    expect(r.means.winnability).toBeCloseTo(1);
  });
  it("post-cutoff keeps firstShowYear strictly greater than the cutoff year", () => {
    const s = postCutoffCity(r, new Map(arts.map((a) => [a.artist, { year: a.firstShowYear, model: a.llmModel }])));
    expect(s.rows.map((x) => x.id)).toEqual([]);
    expect(s.n).toBe(0); // 2026 is not > 2026
    const s2 = postCutoffCity(r, new Map([["X", { year: 2023, model: "gemini-2.5-flash" }], ["Y", { year: 2026, model: "gemini-2.5-flash" }]]));
    expect(s2.rows.map((x) => x.id)).toEqual(["Y"]);
  });
});

describe("sanity verification against stored stats", () => {
  it("passes when stored stats match and throws when they do not", () => {
    const cases = [fcase("c1", ["b", "a", "c", "d"], ["a", "b", "c", "d"])];
    expect(() => verifyFixed(cases, computeFixedStats(cases))).not.toThrow();
    const bad = computeFixedStats(cases);
    bad.arms.gemini.mrr = 0.9;
    expect(() => verifyFixed(cases, bad)).toThrow(/gemini/);
    const arts = [artist("X", 2023, ["a", "c", "b", "d"], ["b", "a", "c", "d"])];
    expect(() => verifyCity(arts, computeCityRankStats(arts))).not.toThrow();
    const badC = computeCityRankStats(arts);
    badC.arms.llm.mean = 0.99;
    expect(() => verifyCity(arts, badC)).toThrow(/llm/);
  });
});
