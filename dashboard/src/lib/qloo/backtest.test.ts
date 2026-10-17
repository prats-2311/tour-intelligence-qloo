import { describe, expect, it } from "vitest";
import { BACKTEST, hitLine, parseBacktest, rankText } from "./backtest";
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
  it("the committed dashboard fixture is pending until the real runs are swapped in", () => {
    expect(BACKTEST).toEqual({ status: "pending" });
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
