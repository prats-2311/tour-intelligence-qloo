import { describe, expect, it } from "vitest";
import { fanHeat } from "../src/scoring/fanHeat.js";
import { DEFAULT_WEIGHTS, activation, fanConcentration, meanTopK } from "../src/scoring/activation.js";
import { coBillLift, verdict, winnability } from "../src/scoring/winnability.js";
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

describe("coBillLift", () => {
  it("multiplies and clamps to 0-1", () => {
    expect(coBillLift(0.5, 0.8)).toBeCloseTo(0.4);
    expect(coBillLift(2, 2)).toBe(1);
  });
});
