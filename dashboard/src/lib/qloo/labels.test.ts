import { describe, expect, it } from "vitest";
import { ACTIVATION_WEIGHTS, DEFAULT_SCORING_DISPLAY, ruleLines, weightRows, INTEGRITY_LINE, SAMPLE_TEXT, VERDICT_LABEL, VERDICT_SHAPE } from "./labels";

describe("shared labels", () => {
  it("verdict labels", () => {
    expect(VERDICT_LABEL).toEqual({ play: "Play", hidden_goldmine: "Hidden goldmine", de_risk: "De-risk", consider: "Consider", skip: "Skip", insufficient_data: "Not enough data" });
  });
  it("integrity and sample copy are verbatim", () => {
    expect(INTEGRITY_LINE).toBe("Affinity signal from aggregate taste data — not a ticket forecast or a claim about individuals.");
    expect(SAMPLE_TEXT).toBe("Sample data — illustrative, not Qloo output");
  });
  it("activation weights cover the four components and sum to 1", () => {
    expect(ACTIVATION_WEIGHTS.map((w) => [w.key, w.weight])).toEqual([["sponsor_fit", "0.30"], ["local_hooks", "0.25"], ["fan_concentration", "0.25"], ["venue_fit", "0.20"]]);
    expect(ACTIVATION_WEIGHTS.reduce((s, w) => s + Number(w.weight), 0)).toBeCloseTo(1);
  });
  it("verdict shapes are distinct; skip is an x and insufficient data a square", () => {
    expect(new Set(Object.values(VERDICT_SHAPE)).size).toBe(6);
    expect(VERDICT_SHAPE.skip).toBe("x");
    expect(VERDICT_SHAPE.insufficient_data).toBe("square");
  });
});

describe("scoring display", () => {
  it("default rules read exactly as before", () => {
    expect(ruleLines(DEFAULT_SCORING_DISPLAY.thresholds).slice(0, 4).map((r) => r.rule)).toEqual([
      "fan ≥70 & activation ≥60", "45≤fan<70 & activation ≥75", "fan ≥70 & activation <45", "winnability ≥55",
    ]);
  });
  it("rules follow injected thresholds", () => {
    const t = { ...DEFAULT_SCORING_DISPLAY.thresholds, goldmineAct: 41, considerWin: 48 };
    const rules = ruleLines(t);
    expect(rules.find((r) => r.verdict === "hidden_goldmine")!.rule).toBe("45≤fan<70 & activation ≥41");
    expect(rules.find((r) => r.verdict === "consider")!.rule).toBe("winnability ≥48");
  });
  it("weights show two decimals and mark dropped components", () => {
    const rows = weightRows({ ...DEFAULT_SCORING_DISPLAY, weights: { ...DEFAULT_SCORING_DISPLAY.weights, fan_concentration: 0 } });
    expect(rows.find((r) => r.key === "sponsor_fit")).toMatchObject({ weight: "0.30", dropped: false });
    expect(rows.find((r) => r.key === "fan_concentration")).toMatchObject({ weight: "0.00", dropped: true });
  });
});
