import { describe, expect, it } from "vitest";
import { concentrationValue, DEFAULT_SCORING, isThin, rescaleAffinity } from "../src/scoring/config.js";
import { SCORING } from "../src/scoring/calibration.js";
import { activation } from "../src/scoring/activation.js";
import { verdict } from "../src/scoring/winnability.js";

const s = (value: number) => ({ value, refs: [] });

describe("scoring config", () => {
  it("default config reproduces the original rule table", () => {
    expect(DEFAULT_SCORING.thresholds).toEqual({ playFan: 70, playAct: 60, goldmineFanMin: 45, goldmineFanMax: 70, goldmineAct: 75, deRiskFan: 70, deRiskAct: 45, considerWin: 55 });
    expect(DEFAULT_SCORING.weights).toEqual({ sponsor_fit: 0.3, local_hooks: 0.25, fan_concentration: 0.25, venue_fit: 0.2 });
    expect(DEFAULT_SCORING.affinityFloors).toEqual({ sponsor_fit: 0, local_hooks: 0, venue_fit: 0 });
    expect(DEFAULT_SCORING.concentration).toBe("raw");
  });

  it("the committed SCORING is a valid config", () => {
    expect(Object.keys(SCORING.weights).sort()).toEqual(["fan_concentration", "local_hooks", "sponsor_fit", "venue_fit"]);
    for (const f of Object.values(SCORING.affinityFloors)) expect(f >= 0 && f < 1).toBe(true);
  });

  it("rescales affinity from the floor", () => {
    expect(rescaleAffinity(0.95, 0)).toBe(0.95);
    expect(rescaleAffinity(0.95, 0.9)).toBeCloseTo(0.5);
    expect(rescaleAffinity(0.85, 0.9)).toBe(0);
    expect(rescaleAffinity(1, 0.9)).toBe(1);
    expect(rescaleAffinity(Number.NaN, 0.9)).toBeNaN();
  });

  it("re-bases concentration against a uniform spread", () => {
    const uniform = Array(20).fill(0.05);
    expect(concentrationValue(uniform, "raw")).toBeCloseTo(0.15);
    expect(concentrationValue(uniform, "vs_uniform")).toBeCloseTo(0);
    expect(concentrationValue([0.5, 0.3, 0.2, 0, 0, 0, 0, 0, 0, 0], "vs_uniform")).toBeCloseTo(1);
    expect(concentrationValue([0.5, 0.5, 0], "vs_uniform")).toBeNull();
    expect(concentrationValue([], "raw")).toBeNull();
  });

  it("ignores weight-0 components, including for the two-component minimum", () => {
    const w = { ...DEFAULT_SCORING.weights, fan_concentration: 0 };
    expect(activation({ sponsor_fit: s(0.8), fan_concentration: s(0.1) }, w).value).toBeNull();
    expect(activation({ sponsor_fit: s(0.8), local_hooks: s(0.6), fan_concentration: s(0.1) }, w).value).toBeCloseTo(100 * (0.3 * 0.8 + 0.25 * 0.6) / 0.55);
  });

  it("verdict applies injected thresholds", () => {
    const t = { ...DEFAULT_SCORING.thresholds, goldmineAct: 40 };
    expect(verdict(s(60), s(41), s(50.5), t)).toBe("hidden_goldmine");
    expect(verdict(s(60), s(41), s(50.5))).toBe("skip");
  });

  it("under a calibrated config, components may be a strict subset of the raw components", () => {
    const cfg = { ...DEFAULT_SCORING, weights: { ...DEFAULT_SCORING.weights, local_hooks: 0 }, affinityFloors: { sponsor_fit: 0.9, local_hooks: 0, venue_fit: 0 }, concentration: "vs_uniform" as const };
    const raw = { sponsor_fit: 0.95, local_hooks: 0.7, fan_concentration: 0.8 };
    const conc = concentrationValue([0.5, 0.3, 0.2], cfg.concentration); // <=3 zones: not scorable
    expect(conc).toBeNull();
    const comps = {
      sponsor_fit: s(rescaleAffinity(raw.sponsor_fit, cfg.affinityFloors.sponsor_fit)),
      local_hooks: s(rescaleAffinity(raw.local_hooks, cfg.affinityFloors.local_hooks)),
    };
    const a = activation(comps, cfg.weights);
    expect(a.value).toBeNull(); // weight-0 hooks dropped, only sponsor_fit left
    expect(Object.keys(a.components)).toEqual(["sponsor_fit"]);
    for (const k of Object.keys(a.components)) expect(Object.keys(raw)).toContain(k);
    expect(a.components.sponsor_fit).toBeCloseTo(0.5);
  });
});

describe("isThin (rule 8)", () => {
  const w = DEFAULT_SCORING.weights;
  it.each([
    ["two weighted components, both 0", { sponsor_fit: 0, local_hooks: 0 }, w, true],
    ["one weighted component, 0", { sponsor_fit: 0 }, w, true],
    ["two components, one non-zero", { sponsor_fit: 0, local_hooks: 0.2 }, w, false],
    ["three components, all 0", { sponsor_fit: 0, local_hooks: 0, venue_fit: 0 }, w, false],
    ["weight-0 components are ignored", { sponsor_fit: 0, local_hooks: 0, venue_fit: 0 }, { ...w, venue_fit: 0 }, true],
    ["a non-zero weight-0 component is ignored", { sponsor_fit: 0, local_hooks: 0, venue_fit: 0.9 }, { ...w, venue_fit: 0 }, true],
    ["non-finite values are ignored", { sponsor_fit: 0, local_hooks: Number.NaN, venue_fit: 0 }, w, true],
    ["no components at all", {}, w, true],
  ] as const)("%s", (_n, adj, weights, expected) => {
    expect(isThin(adj, weights)).toBe(expected);
  });
});
