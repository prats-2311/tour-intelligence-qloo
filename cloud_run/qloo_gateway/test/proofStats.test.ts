import { describe, expect, it } from "vitest";
import { mean, sha256Hex, signTest, StopMonitor, StopRun } from "../src/backtest/proofStats.js";

describe("signTest (two-sided exact binomial, ties dropped)", () => {
  it("6 wins 0 losses is p=0.03125", () => {
    const r = signTest([[1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0]]);
    expect(r).toMatchObject({ wins: 6, losses: 0, ties: 0, n: 6 });
    expect(r.p).toBeCloseTo(0.03125, 10);
  });
  it("5 wins 1 loss is p=0.21875", () => {
    expect(signTest([[1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [0, 1]]).p).toBeCloseTo(0.21875, 10);
  });
  it("drops ties, and a 3-3 split is p=1", () => {
    const r = signTest([[1, 0], [1, 0], [1, 0], [0, 1], [0, 1], [0, 1], [0.5, 0.5], [0.25, 0.25]]);
    expect(r).toMatchObject({ wins: 3, losses: 3, ties: 2, n: 6, p: 1 });
  });
  it("no non-tied pairs is p=1; losses count symmetrically; float noise is a tie", () => {
    expect(signTest([]).p).toBe(1);
    expect(signTest([[0, 1], [0, 1], [0, 1], [0, 1], [0, 1], [0, 1]]).p).toBeCloseTo(0.03125, 10);
    expect(signTest([[0.1 + 0.2, 0.3]]).ties).toBe(1);
  });
  it("27 cases: 20-7 gives the exact two-sided tail", () => {
    const pairs: Array<[number, number]> = [...Array(20).fill([1, 0]), ...Array(7).fill([0, 1])];
    const r = signTest(pairs);
    expect(r.p).toBeGreaterThan(0.018);
    expect(r.p).toBeLessThan(0.020);
  });
});

describe("helpers", () => {
  it("mean of an empty list is null", () => { expect(mean([])).toBeNull(); expect(mean([1, 2, 3])).toBe(2); });
  it("sha256Hex is the plain hex digest", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("StopMonitor", () => {
  it("stops at once on a 429", () => {
    const m = new StopMonitor();
    m.record("qloo", { ok: false, text: "qloo_where_popular: HTTP 429" });
    expect(m.stopped).toMatch(/429/);
    expect(() => m.assertOk()).toThrow(StopRun);
  });
  it.each(["Quota exceeded for project", "rate limit hit", "Rate-Limit", "rate_limit", "daily limit reached", "RATE wait", "RATE_LIMITED", "Too many requests", "resource exhausted"])("stops on error text %s", (text) => {
    const m = new StopMonitor();
    m.record("gemini", { ok: false, text });
    expect(m.stopped).toBeDefined();
  });
  it("a plain error message does not stop; words that merely contain 'rate' do not either", () => {
    const m = new StopMonitor();
    m.record("qloo", { ok: false, text: "Vertex 500" });
    m.record("qloo", { ok: false, text: "could not generate or integrate the answer" });
    expect(m.stopped).toBeUndefined();
  });
  it("an ok call with no text never stops", () => {
    const m = new StopMonitor();
    for (let i = 0; i < 50; i += 1) m.record("qloo", { ok: true });
    expect(m.stopped).toBeUndefined();
    expect(m.counts).toMatchObject({ qloo: 50, qlooErrors: 0 });
  });
  it("error rate above 10% over the last 20 calls stops: 3 of 20 stops, 2 of 20 does not", () => {
    const two = new StopMonitor();
    for (let i = 0; i < 20; i += 1) two.record("qloo", { ok: !(i === 14 || i === 19), text: i === 14 || i === 19 ? "boom" : undefined });
    expect(two.stopped).toBeUndefined();
    const three = new StopMonitor();
    for (let i = 0; i < 20; i += 1) three.record("qloo", { ok: !(i === 10 || i === 14 || i === 19), text: "boom" });
    expect(three.stopped).toMatch(/error rate/);
    expect(three.counts.qlooErrors).toBe(3);
  });
  it("only the last 20 calls count: old errors age out", () => {
    const m = new StopMonitor();
    m.record("qloo", { ok: false, text: "boom" });
    for (let i = 0; i < 40; i += 1) m.record("qloo", { ok: true });
    expect(m.stopped).toBeUndefined();
  });
  it("Qloo and Gemini calls share one window and count separately", () => {
    const m = new StopMonitor();
    for (let i = 0; i < 9; i += 1) m.record("qloo", { ok: true });
    m.record("gemini", { ok: false, text: "boom" });
    m.record("gemini", { ok: false, text: "boom" });
    expect(m.stopped).toMatch(/error rate/);
    expect(m.counts).toMatchObject({ qloo: 9, gemini: 2, geminiErrors: 2 });
  });
  it("stops at once when the gateway's session budget is exhausted", () => {
    const m = new StopMonitor();
    m.record("qloo", { ok: false, text: "BUDGET Session Qloo budget exhausted" });
    expect(m.stopped).toMatch(/budget/);
  });
  it("the first stop reason is kept", () => {
    const m = new StopMonitor();
    m.record("qloo", { ok: false, text: "HTTP 429" });
    m.record("qloo", { ok: false, text: "quota" });
    expect(m.stopped).toMatch(/429/);
  });
});
