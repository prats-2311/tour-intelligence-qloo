import { describe, expect, it } from "vitest";
import syntheticBacktest from "@/test/fixtures/backtest.synthetic.json";
import v3Backtest from "@/test/fixtures/backtest.v3.synthetic.json";
import { getBacktest, hitLine, parseBacktest, rankText, setBacktest } from "./backtest";
import { oneRunFixture, run1Fixture, twoRunsFixture } from "./fixtures/backtestTestFixture";

describe("parseBacktest", () => {
  it("accepts two runs, run 1 first", () => {
    const b = parseBacktest(twoRunsFixture);
    expect(b.status).toBe("complete");
    if (b.status === "complete") expect(b.runs.map((r) => r.method)).toEqual(["v1", "v2"]);
  });
  it("accepts one run", () => {
    const b = parseBacktest(oneRunFixture);
    expect(b.status === "complete" && b.runs.length).toBe(1);
  });
  it("reads a run without a method as v1", () => {
    const { method: _m, ...legacy } = run1Fixture;
    const b = parseBacktest({ runs: [legacy] });
    expect(b.status === "complete" && b.runs[0]!.method).toBe("v1");
  });
  it("never shows a partial run, and a partial-only file is pending", () => {
    const b = parseBacktest({ runs: [run1Fixture, { ...run1Fixture, status: "partial" }] });
    expect(b.status === "complete" && b.runs.length).toBe(1);
    expect(parseBacktest({ runs: [{ ...run1Fixture, status: "partial" }] })).toEqual({ status: "pending" });
  });
  it.each([
    ["empty runs", { runs: [] }],
    ["old pending object", { schemaVersion: 1, status: "pending" }],
    ["unknown schema", { runs: [{ ...run1Fixture, schemaVersion: 2 }] }],
    ["missing cases", { runs: [{ ...run1Fixture, cases: undefined }] }],
    ["garbage", "nope"],
    ["null", null],
  ])("treats %s as pending", (_l, raw) => {
    expect(parseBacktest(raw)).toEqual({ status: "pending" });
  });
  it("the synthetic fixture (same shape as the private recording) loads as the two runs", () => {
    setBacktest(syntheticBacktest);
    expect(getBacktest()?.runs.map((r) => r.method)).toEqual(["v1", "v2"]);
    setBacktest(null);
    expect(getBacktest()).toBeNull();
  });
  it("setBacktest ignores anything that is not complete runs", () => {
    setBacktest({ runs: [] });
    expect(getBacktest()).toBeNull();
  });
  it.each([
    ["missing hit10", (r: any) => { r.summary.llm_only.hit10 = undefined; }],
    ["case missing a method result", (r: any) => { delete r.cases[0].results.llm_only; }],
    ["non-http source", (r: any) => { r.cases[0].sources = ["javascript:alert(1)"]; }],
  ])("rejects a run with %s", (_l, mutate) => {
    const r = structuredClone(run1Fixture);
    mutate(r);
    expect(parseBacktest({ runs: [r] })).toEqual({ status: "pending" });
  });
  it("formats hit lines", () => {
    expect(hitLine({ scored: 15, hit10: 7, hit20: 9 }, 10)).toBe("7 of 15 in the top 10 · 47%");
    expect(hitLine({ scored: 15, hit10: 7, hit20: 9 }, 20)).toBe("9 of 15 in the top 20 · 60%");
    expect(hitLine({ scored: 0, hit10: 0, hit20: 0 }, 10)).toBe("no scored cases");
  });
  it("renders rank text", () => {
    expect(rankText({ status: "ok", rank: 3, top: [] })).toBe("#3");
    expect(rankText({ status: "ok", rank: null, top: [] })).toBe("not in top 20");
    expect(rankText({ status: "unavailable", reason: "x" })).toBe("no answer");
  });
});

describe("parseBacktest: proofV3", () => {
  it("is back-compatible: runs without proofV3 parse as before and carry no proofV3", () => {
    const b = parseBacktest(twoRunsFixture);
    expect(b.status === "complete" && b.proofV3).toBeUndefined();
  });
  it("accepts the optional proofV3 key next to runs", () => {
    const b = parseBacktest(v3Backtest);
    expect(b.status).toBe("complete");
    if (b.status !== "complete") return;
    expect(b.runs.length).toBe(2);
    expect(b.proofV3!.tests.map((t) => t.id)).toEqual(["A", "B", "catch", "C"]);
    expect(b.proofV3!.amendments).toHaveLength(2);
  });
  it("is complete with proofV3 alone (no earlier runs)", () => {
    const b = parseBacktest({ proofV3: (v3Backtest as { proofV3: unknown }).proofV3 });
    expect(b.status === "complete" && b.runs).toEqual([]);
  });
  it("drops a malformed test but keeps the others; no valid test and no runs is pending", () => {
    const v3 = (v3Backtest as { proofV3: { tests: unknown[] } }).proofV3;
    const b = parseBacktest({ proofV3: { ...v3, tests: [{ id: "A", title: 5 }, v3.tests[1]] } });
    expect(b.status === "complete" && b.proofV3!.tests.map((t) => t.id)).toEqual(["B"]);
    expect(parseBacktest({ proofV3: { ...v3, tests: [{ id: "A" }] } })).toEqual({ status: "pending" });
  });
  it("rejects a table whose row is not all strings", () => {
    const v3 = (v3Backtest as { proofV3: { tests: Array<{ tables: Array<{ rows: unknown[] }> }> } }).proofV3;
    const bad = { ...v3.tests[0]!, tables: [{ columns: ["a"], rows: [[1]] }] };
    expect(parseBacktest({ proofV3: { ...v3, tests: [bad] } })).toEqual({ status: "pending" });
  });
});
