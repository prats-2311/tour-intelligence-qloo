import { describe, expect, it } from "vitest";
import { buildScoreboard, splitClaims } from "./proofScoreboard";
import { parseBacktest, type ProofV3, type ProofV3Test } from "./backtest";
import real from "@/test/fixtures/backtest.v3.synthetic.json";

const sign = (label: string, wins: number, losses: number, ties: number, p: number) => ({ label, wins, losses, ties, pairs: wins + losses + ties, p });
const test = (id: string, title: string, signTests: ProofV3Test["signTests"], n = 10): ProofV3Test => ({ id, title, question: "q", status: "s", n, tables: [], signTests, claims: [], limits: [], runs: [], perUnit: null });
const v3 = (tests: ProofV3Test[], checkers?: ProofV3["checkers"]): ProofV3 => ({ protocolCommit: "", generatedAt: "", amendments: [], tests, ...(checkers ? { checkers } : {}) });
const checker = (caught: number, planted: number, falseAlarms = 0) => ({ amendment: 10, rows: [{ id: "a", checker: "Answer", guards: "g", caught, planted, falseAlarms, controls: 20, claim: "", anchor: "", note: "" }] });

const B = test("B", "Test B: x", [sign("Qloo rank vs Gemini", 4, 11, 7, 0.118), sign("Qloo rank vs popularity", 17, 1, 4, 0.000145)], 22);
const B9 = test("B_post_cutoff", "Test B after", [sign("Qloo rank vs Gemini", 1, 3, 4, 0.625), sign("Qloo rank vs popularity", 7, 0, 1, 0.015625)], 8);
const A = test("A", "Test A: x", [sign("Winnability vs fan heat", 1, 1, 8, 1), sign("Winnability vs the generic LLM", 0, 6, 4, 0.03125)]);
const C = test("C", "Test C: x", [sign("Qloo vs LLM-only (per city)", 0, 7, 2, 0.015625), sign("Qloo vs LLM-only, equal counts (secondary)", 0, 7, 2, 0.015625)], 9);

describe("buildScoreboard", () => {
  it("derives Qloo's wins and the LLM's wins from the sign tests, never hardcoded", () => {
    const s = buildScoreboard(v3([B, B9, A, C], checker(20, 20)));
    expect(s.qloo.map((e) => e.text)).toEqual([
      "Qloo beat the popularity list on real tour picks: 17 wins, 1 loss, p<0.001.",
      "Again on cases after the model's cutoff: 7 wins, 0 losses, p=0.016.",
      "The product's checkers caught 20 of 20 planted errors, with 0 false alarms.",
    ]);
    expect(s.qloo.map((e) => e.anchor)).toEqual(["proof-test-B", "proof-test-B_post_cutoff", "proof-checkers"]);
    expect(s.llm.map((e) => e.anchor)).toEqual(["proof-test-A", "proof-test-B", "proof-test-C", "proof-test-B_post_cutoff"]);
    expect(s.llm[0]!.text).toBe("Test A, choosing tour cities: the plain LLM was ahead on 6 of 10 artists, winnability on 0 (4 ties), p=0.031.");
    expect(s.llm[1]!.text).toBe("Test B, the real activation pick, against Gemini: Gemini was ahead on 11 of 22 cases, Qloo on 4 (7 ties), not significant (p=0.118).");
  });
  it("changes with the data: other numbers give other sentences", () => {
    const s = buildScoreboard(v3([test("B", "Test B", [sign("Qloo rank vs popularity", 9, 2, 1, 0.07)], 12)]));
    expect(s.qloo[0]!.text).toBe("Qloo beat the popularity list on real tour picks: 9 wins, 2 losses, p=0.070 (not significant).");
  });
  it("a popularity result Qloo did not win is reported as not a win, not hidden", () => {
    const s = buildScoreboard(v3([test("B", "Test B", [sign("Qloo rank vs popularity", 2, 5, 1, 0.45)])]));
    expect(s.qloo).toEqual([]);
    expect(s.notWins[0]!.text).toContain("did not beat the popularity list");
    expect(s.notWins[0]!.text).toContain("2 wins, 5 losses");
  });
  it("when the LLM line favors Qloo it moves to Qloo's column", () => {
    const s = buildScoreboard(v3([test("C", "Test C", [sign("Qloo vs LLM-only (per city)", 6, 1, 2, 0.06)], 9)]));
    expect(s.llm).toEqual([]);
    expect(s.qloo).toHaveLength(1);
  });
  it("an exact tie against the LLM is listed on neither side", () => {
    const s = buildScoreboard(v3([test("A", "Test A", [sign("Winnability vs the generic LLM", 3, 3, 4, 1)])]));
    expect(s.llm).toEqual([]);
    expect(s.qloo).toEqual([]);
    expect(s.even).toHaveLength(1);
  });
  it("skips tests without a matching sign line, zero pairs, and absent checkers", () => {
    const s = buildScoreboard(v3([test("A", "Test A", []), test("B", "Test B", [sign("Qloo rank vs Gemini", 0, 0, 0, 1)]), test("catch", "Claim checker", [])]));
    expect(s).toEqual({ qloo: [], llm: [], even: [], notWins: [] });
  });
  it("checkers with a miss or a false alarm say so", () => {
    const s = buildScoreboard(v3([], { amendment: 10, rows: [{ ...checker(18, 20, 1).rows[0]!, id: "x" }, { ...checker(20, 20).rows[0]!, id: "y" }] }));
    expect(s.qloo[0]!.text).toBe("The product's checkers caught 38 of 40 planted errors, with 1 false alarm.");
  });
  it("ignores the combined Gemini + Qloo lines for the LLM column", () => {
    const F = test("F", "Gemini + Qloo", [sign("Gemini + Qloo vs Gemini (Test B)", 4, 10, 8, 0.18)], 22);
    expect(buildScoreboard(v3([F])).llm).toEqual([]);
  });
  it("works on the committed synthetic v3 recording", () => {
    const b = parseBacktest(real);
    if (b.status !== "complete" || !b.proofV3) throw new Error("fixture");
    const s = buildScoreboard(b.proofV3);
    expect(s.qloo.length + s.llm.length + s.even.length + s.notWins.length).toBeGreaterThan(0);
  });
});

describe("splitClaims", () => {
  it("moves per-case slug lines to the detail list and keeps headline claims", () => {
    const { headline, detail } = splitClaims([
      "Qloo rank beat popularity (p<0.001): mean reciprocal rank 0.47 vs 0.13, 17 wins, 1 loss, 4 ties over 22 cases.",
      "Gemini beat Qloo rank for metallica-mexico-city-la-sonora-santanera.",
      "fatboy-slim-mexico-city-vavava-shop was excluded (real pick unresolved).",
      "Board mostly played for Sting: no cities were added.",
      "Tea Tairović was dropped (artist needs input: Choose the intended Qloo entity.).",
      "The LLM-only playbook beat Qloo in Mexico City.",
      "Sting: played city Queens was re-anchored to New York City, the way the board anchors it.",
      "Test B (fixed candidates) covers 22 of 27 cases.",
    ]);
    expect(headline).toEqual([
      "Qloo rank beat popularity (p<0.001): mean reciprocal rank 0.47 vs 0.13, 17 wins, 1 loss, 4 ties over 22 cases.",
      "Test B (fixed candidates) covers 22 of 27 cases.",
    ]);
    expect(detail).toHaveLength(6);
  });
});
