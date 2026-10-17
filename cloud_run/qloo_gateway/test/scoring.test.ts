import { describe, expect, it } from "vitest";
import { fanHeat } from "../src/scoring/fanHeat.js";
import { DEFAULT_WEIGHTS, activation, fanConcentration, meanTopK } from "../src/scoring/activation.js";
import { CLOSE_CALL_BAND, closeCall, coBillLift, verdict, winnability } from "../src/scoring/winnability.js";
import { DEFAULT_SCORING } from "../src/scoring/config.js";
import type { Score } from "../src/types.js";

const r = [{ tool: "qloo_where_popular", cacheKey: "k" }];
const s = (value: number): Score => ({ value, refs: r });
const none: Score = { value: null, reason: "insufficient_data", refs: [] };

describe("fanHeat", () => {
  it("min-max normalises within the set with 0.7/0.3 weights", () => {
    const m = fanHeat([
      { id: "a", affinity: 0.9, popularity: 0.2, refs: r },
      { id: "b", affinity: 0.5, popularity: 0.8, refs: r },
    ]);
    expect(m.get("a")?.value).toBeCloseTo(70, 5);
    expect(m.get("b")?.value).toBeCloseTo(30, 5);
  });
  it("uses raw 0-1 values (clamped) when there is one market or zero range", () => {
    const m = fanHeat([{ id: "a", affinity: 0.8, popularity: 0.5, refs: r }]);
    expect(m.get("a")?.value).toBeCloseTo(71, 5);
  });
  it("keeps evidence refs", () => {
    expect(fanHeat([{ id: "a", affinity: 1, popularity: 1, refs: r }]).get("a")?.refs).toEqual(r);
  });
});

describe("activation components", () => {
  it("meanTopK", () => {
    expect(meanTopK([0.9, 0.1, 0.5], 2)).toBeCloseTo(0.7);
    expect(meanTopK([], 5)).toBeNull();
  });
  it("fanConcentration sums top-3 shares", () => {
    expect(fanConcentration([0.5, 0.2, 0.1, 0.2])).toBeCloseTo(0.9);
    expect(fanConcentration([])).toBeNull();
  });
});

describe("activation", () => {
  it("weights sum to 1", () => {
    expect(Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
  it("renormalises weights over present components", () => {
    const a = activation({ sponsor_fit: { value: 1, refs: r }, venue_fit: { value: 0, refs: r } });
    expect(a.value).toBeCloseTo(60, 5); // 0.30/(0.30+0.20) * 100
  });
  it("needs at least two components", () => {
    expect(activation({ sponsor_fit: { value: 1, refs: r } })).toMatchObject({ value: null, reason: "insufficient_data" });
  });
});

describe("winnability & verdict", () => {
  it("averages fan heat and activation", () => {
    expect(winnability(s(80), s(60)).value).toBe(70);
    expect(winnability(none, s(60))).toMatchObject({ value: null });
  });
  it.each([
    [80, 70, "play"],
    [60, 80, "hidden_goldmine"],
    [75, 30, "de_risk"],
    [50, 70, "consider"],
    [30, 40, "skip"],
  ])("fan %d activation %d -> %s", (fan, act, expected) => {
    expect(verdict(s(fan), s(act), winnability(s(fan), s(act)))).toBe(expected);
  });
  it("insufficient data wins over everything", () => {
    expect(verdict(none, s(90), none)).toBe("insufficient_data");
  });
});

describe("fix round 1", () => {
  it("isolates a non-finite market", () => {
    const m = fanHeat([
      { id: "a", affinity: 0.9, popularity: 0.2, refs: r },
      { id: "b", affinity: 0.5, popularity: 0.8, refs: r },
      { id: "c", affinity: NaN, popularity: 0.5, refs: r },
    ]);
    expect(m.get("a")?.value).toBeCloseTo(70, 5);
    expect(m.get("b")?.value).toBeCloseTo(30, 5);
    expect(m.get("c")).toMatchObject({ value: null, reason: "insufficient_data" });
  });
  it("verdict and winnability treat NaN as insufficient", () => {
    const nan: Score = { value: NaN, refs: r };
    expect(winnability(nan, s(60))).toMatchObject({ value: null });
    expect(winnability(s(60), nan)).toMatchObject({ value: null });
    expect(verdict(nan, s(60), s(60))).toBe("insufficient_data");
    expect(verdict(s(60), nan, s(60))).toBe("insufficient_data");
    expect(verdict(s(60), s(60), nan)).toBe("insufficient_data");
  });
  it.each([
    [70, 60, "play"],
    [70, 59.99, "consider"],
    [69.99, 75, "hidden_goldmine"],
    [45, 75, "hidden_goldmine"],
    [44.99, 75, "consider"],
    [70, 44.99, "de_risk"],
    [70, 45, "consider"],
    [50, 60, "consider"],
    [50, 59.98, "skip"],
  ])("boundary fan %d activation %d -> %s", (fan, act, expected) => {
    expect(verdict(s(fan), s(act), winnability(s(fan), s(act)))).toBe(expected);
  });
  it("activation refs only from finite components", () => {
    const ra = [{ tool: "a", cacheKey: "a" }];
    const rb = [{ tool: "b", cacheKey: "b" }];
    const rn = [{ tool: "n", cacheKey: "n" }];
    const a = activation({ sponsor_fit: { value: 1, refs: ra }, venue_fit: { value: 0, refs: rb }, local_hooks: { value: NaN, refs: rn } });
    expect(a.refs).toEqual([...ra, ...rb]);
  });
  it("winnability refs concatenate on scored and insufficient paths", () => {
    const rf = [{ tool: "f", cacheKey: "f" }];
    const rc = [{ tool: "c", cacheKey: "c" }];
    expect(winnability({ value: 80, refs: rf }, { value: 60, refs: rc }).refs).toEqual([...rf, ...rc]);
    expect(winnability({ value: null, reason: "insufficient_data", refs: rf }, { value: 60, refs: rc }).refs).toEqual([...rf, ...rc]);
  });
  it("activation components are clamped", () => {
    const a = activation({ sponsor_fit: { value: 1.5, refs: r }, venue_fit: { value: 0, refs: r } });
    expect(a.components.sponsor_fit).toBe(1);
    expect(a.value).toBeCloseTo(60, 5);
  });
});

describe("coBillLift", () => {
  it("multiplies and clamps to 0-1", () => {
    expect(coBillLift(0.5, 0.8)).toBeCloseTo(0.4);
    expect(coBillLift(2, 2)).toBe(1);
  });
});

describe("closeCall (rule 9)", () => {
  const t = DEFAULT_SCORING.thresholds;
  it("uses a band of 2", () => { expect(CLOSE_CALL_BAND).toBe(2); });
  it.each([
    ["just above playFan", 71, 80, true],
    ["just above playAct", 90, 61, true],
    ["just inside the goldmine act threshold", 60, 76, true],
    ["just above the goldmine fan minimum", 46, 80, true],
    ["just below the de-risk act threshold", 80, 44, true],
    ["just above the consider winnability line", 50, 61, true],
    ["well inside play", 90, 90, false],
    ["well inside skip", 20, 20, false],
    ["well inside de_risk", 90, 20, false],
    ["exactly 3 points above a threshold is clear", 73, 90, false],
  ] as const)("%s", (_n, fan, act, expected) => {
    expect(closeCall(s(fan), s(act), t)).toBe(expected);
  });
  it("is false when fan or activation is not a number", () => {
    expect(closeCall(none, s(60), t)).toBe(false);
    expect(closeCall(s(60), none, t)).toBe(false);
  });
  it("honours an explicit band", () => {
    expect(closeCall(s(73), s(90), t, 4)).toBe(true);
    expect(closeCall(s(71), s(80), t, 0)).toBe(false);
  });
});
