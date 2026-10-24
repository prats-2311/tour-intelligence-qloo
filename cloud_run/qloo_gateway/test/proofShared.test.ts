import { describe, expect, it } from "vitest";
import { GatewayAuthError } from "../src/backtest/run.js";
import { countryLabel, createPermutationRanker, isPermutation, memoQloo, monitoredCallTool } from "../src/backtest/proofShared.js";
import { StopMonitor, StopRun } from "../src/backtest/proofStats.js";
import type { QlooEnvelope } from "../src/types.js";

const ok = (n = 1): QlooEnvelope => ({ operation: "x", status: "ok", results: Array.from({ length: n }, (_, i) => ({ entity_id: `E${i}`, name: `N${i}` })) });

describe("monitoredCallTool", () => {
  it("counts a call, returns the envelope, and records errors from error envelopes", async () => {
    const m = new StopMonitor();
    const call = monitoredCallTool(async (name) => (name === "bad" ? { operation: "x", status: "error", summary: "boom", error: { code: "INTERNAL", retryable: false, recovery: "retry" } } : ok()), m);
    await call("good", {}, "s");
    await call("bad", {}, "s");
    expect(m.counts).toMatchObject({ qloo: 2, qlooErrors: 1 });
  });
  it("a thrown 429 stops the run and rethrows StopRun; later calls send nothing", async () => {
    const m = new StopMonitor();
    let sent = 0;
    const call = monitoredCallTool(async () => { sent += 1; throw new Error("qloo_recommend: HTTP 429"); }, m);
    await expect(call("a", {}, "s")).rejects.toBeInstanceOf(StopRun);
    await expect(call("b", {}, "s")).rejects.toBeInstanceOf(StopRun);
    expect(sent).toBe(1);
  });
  it("an auth failure stops the run", async () => {
    const m = new StopMonitor();
    const call = monitoredCallTool(async () => { throw new GatewayAuthError(401); }, m);
    await expect(call("a", {}, "s")).rejects.toBeInstanceOf(StopRun);
  });
  it("ok and partial answers are never scanned for limit words (summary or result names)", async () => {
    const m = new StopMonitor();
    const call = monitoredCallTool(async (name) => (name === "p" ? { operation: "x", status: "partial", summary: "limited to 20 results (limit 20)" } : { operation: "x", status: "ok", results: [{ name: "Limitless" }] }), m);
    await call("ok", {}, "s");
    await call("p", {}, "s");
    expect(m.stopped).toBeUndefined();
  });
  it.each([
    ["the gateway's RATE code", { code: "RATE", retryable: true, recovery: "wait" }, undefined],
    ["a quota message in the recovery text", { code: "UPSTREAM", retryable: false, recovery: "Daily quota used up" }, undefined],
    ["a limit word in the summary", { code: "UPSTREAM", retryable: false, recovery: "x" }, "usage limit reached"],
  ])("an error envelope with %s stops the run", async (_n, error, summary) => {
    const m = new StopMonitor();
    const call = monitoredCallTool(async () => ({ operation: "x", status: "error", ...(summary ? { summary } : {}), error }) as QlooEnvelope, m);
    await expect(call("t", {}, "s")).rejects.toBeInstanceOf(StopRun);
    expect(m.stopped).toBeDefined();
  });
  it("a stale answer (a cached fallback after a failed live call) stops the run even though its status is ok", async () => {
    const m = new StopMonitor();
    let sent = 0;
    const call = monitoredCallTool(async () => { sent += 1; return { ...ok(), stale: true } as QlooEnvelope; }, m);
    await expect(call("t", {}, "s")).rejects.toBeInstanceOf(StopRun);
    expect(m.stopped).toMatch(/stale/);
    await expect(call("t", {}, "s")).rejects.toBeInstanceOf(StopRun);
    expect(sent).toBe(1);
  });
  it("a plain transport error is an error but not a stop", async () => {
    const m = new StopMonitor();
    const call = monitoredCallTool(async () => { throw new Error("fetch failed"); }, m);
    await expect(call("a", {}, "s")).rejects.toThrow("fetch failed");
    expect(m.stopped).toBeUndefined();
    expect(m.counts.qlooErrors).toBe(1);
  });
});

describe("memoQloo", () => {
  it("serves a repeated call from memory (arg key order does not matter) and counts hits", async () => {
    let sent = 0;
    const q = memoQloo(async () => { sent += 1; return ok(); });
    const a = await q.call("t", { a: 1, b: 2 }, "s");
    const b = await q.call("t", { b: 2, a: 1 }, "s");
    expect(sent).toBe(1);
    expect([a.cached, b.cached]).toEqual([false, true]);
    expect(a.cacheKey).toBe(b.cacheKey);
    expect(q.stats).toEqual({ hits: 1, misses: 1 });
  });
  it("does not memoise an error answer", async () => {
    let sent = 0;
    const q = memoQloo(async () => { sent += 1; return { operation: "x", status: "error" } as QlooEnvelope; });
    await q.call("t", {}, "s"); await q.call("t", {}, "s");
    expect(sent).toBe(2);
  });
  it("shares one in-flight request between identical concurrent calls", async () => {
    let sent = 0;
    const q = memoQloo(async () => { sent += 1; await new Promise((r) => setTimeout(r, 5)); return ok(); });
    await Promise.all([q.call("t", { a: 1 }, "s"), q.call("t", { a: 1 }, "s")]);
    expect(sent).toBe(1);
  });
});

const body = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });
describe("createPermutationRanker", () => {
  const labels = ["Alpha, X", "Beta, X", "Gamma, X"];
  it("accepts a permutation, sends temperature 0.2 and an enum-constrained schema", async () => {
    const m = new StopMonitor();
    const seen: Array<{ model: string; body: Record<string, unknown> }> = [];
    const r = createPermutationRanker({ generate: async (model, b) => { seen.push({ model, body: b }); return body(JSON.stringify({ ranking: ["Gamma, X", "Alpha, X", "Beta, X"] })); }, models: ["m1", "m2"], monitor: m, sleep: async () => {} });
    const out = await r.rank("PROMPT", labels);
    expect(out).toMatchObject({ order: ["Gamma, X", "Alpha, X", "Beta, X"], attempts: 1, model: "m1" });
    const cfg = seen[0]!.body.generationConfig as { temperature: number; responseSchema: { properties: { ranking: { items: { enum: string[] } } } } };
    expect(cfg.temperature).toBe(0.2);
    expect(cfg.responseSchema.properties.ranking.items.enum).toEqual(labels);
    expect(JSON.stringify(seen[0]!.body)).toContain("PROMPT");
    expect(m.counts.gemini).toBe(1);
  });
  it("retries a non-permutation once, then reports no answer", async () => {
    const m = new StopMonitor();
    let n = 0;
    const r = createPermutationRanker({ generate: async () => { n += 1; return body(JSON.stringify({ ranking: ["Alpha, X", "Alpha, X", "Beta, X"] })); }, models: ["m1"], monitor: m });
    const out = await r.rank("P", labels);
    expect(out.order).toBeNull();
    expect(out.reason).toBe("not_a_permutation");
    expect(n).toBe(2);
    expect(m.counts.gemini).toBe(2);
  });
  it("a second try that is a permutation is accepted (attempts: 2); unparseable JSON counts as a non-permutation", async () => {
    const m = new StopMonitor();
    let n = 0;
    const r = createPermutationRanker({ generate: async () => { n += 1; return body(n === 1 ? "not json" : JSON.stringify({ ranking: labels })); }, models: ["m1"], monitor: m });
    expect(await r.rank("P", labels)).toMatchObject({ order: labels, attempts: 2 });
  });
  const noSleep = { sleep: async () => {} };
  it("every Gemini model failing after its retries is an infrastructure stop, not 'no answer'", async () => {
    const m = new StopMonitor();
    let n = 0;
    const r = createPermutationRanker({ generate: async () => { n += 1; throw new Error("Vertex 500"); }, models: ["m1", "m2"], monitor: m, ...noSleep });
    await expect(r.rank("P", labels)).rejects.toBeInstanceOf(StopRun);
    expect(m.stopped).toMatch(/all Gemini models failed.*Vertex 500/);
    expect(n).toBe(6); // 3 attempts per model
    expect(m.counts).toMatchObject({ gemini: 6, geminiErrors: 6 });
  });
  it("a transient 404 then 200 uses the answer and counts no error toward the rate (Amendment 3)", async () => {
    const m = new StopMonitor();
    const sleeps: number[] = [];
    let n = 0;
    const r = createPermutationRanker({ generate: async () => { n += 1; if (n === 1) throw new Error("Vertex 404"); return body(JSON.stringify({ ranking: labels })); }, models: ["m1", "m2"], monitor: m, sleep: async (ms) => { sleeps.push(ms); } });
    expect(await r.rank("P", labels)).toMatchObject({ order: labels, model: "m1", attempts: 1 });
    expect(sleeps).toEqual([2000]);
    expect(m.stopped).toBeUndefined();
    expect(m.counts).toMatchObject({ gemini: 2, geminiErrors: 1 });
    expect(m.geminiErrorTexts).toEqual(["Vertex 404"]);
  });
  it("three failures on the primary then the fallback answering: the answer is the fallback's and nothing stops, even past 10 errors in the window", async () => {
    const m = new StopMonitor();
    const sleeps: number[] = [];
    const r = createPermutationRanker({ generate: async (model) => { if (model === "m1") throw new Error("Vertex 404 <html>" + "x".repeat(400)); return body(JSON.stringify({ ranking: labels })); }, models: ["m1", "m2"], monitor: m, sleep: async (ms) => { sleeps.push(ms); } });
    for (let i = 0; i < 6; i += 1) expect(await r.rank("P", labels)).toMatchObject({ order: labels, model: "m2" });
    expect(sleeps.slice(0, 2)).toEqual([2000, 6000]);
    expect(m.stopped).toBeUndefined();
    expect(m.counts.geminiErrors).toBe(18);
    expect(m.geminiErrorTexts.every((t) => t.length <= 200)).toBe(true);
  });
  it("retries 429, 5xx and a non-JSON body; a 400 is not retried", async () => {
    for (const [err, calls] of [[new Error("Vertex 429"), 3], [new Error("Vertex 503"), 3], [new SyntaxError("Unexpected token <"), 3], [new Error("Vertex 400"), 1]] as const) {
      const m = new StopMonitor();
      let n = 0;
      const r = createPermutationRanker({ generate: async () => { n += 1; throw err; }, models: ["m1"], monitor: m, ...noSleep });
      await expect(r.rank("P", labels)).rejects.toBeInstanceOf(StopRun);
      expect(n).toBe(calls);
    }
  });
  it("falls back to the second model and reports the model used", async () => {
    const m = new StopMonitor();
    const r = createPermutationRanker({ generate: async (model) => { if (model === "m1") throw new Error("Vertex 503"); return body(JSON.stringify({ ranking: labels })); }, models: ["m1", "m2"], monitor: m, ...noSleep });
    expect(await r.rank("P", labels)).toMatchObject({ order: labels, model: "m2" });
  });
});

describe("isPermutation / countryLabel", () => {
  it("checks every label exactly once", () => {
    expect(isPermutation(["a", "b"], ["b", "a"])).toBe(true);
    expect(isPermutation(["a", "b"], ["a"])).toBe(false);
    expect(isPermutation(["a", "b"], ["a", "a"])).toBe(false);
    expect(isPermutation(["a", "b"], ["a", "c"])).toBe(false);
    expect(isPermutation(["a"], "a")).toBe(false);
  });
  it("spells an ISO-2 country out, falling back to the code", () => {
    expect(countryLabel("MX")).toBe("Mexico");
    expect(countryLabel("ZZ")).toBe("ZZ");
  });
});
