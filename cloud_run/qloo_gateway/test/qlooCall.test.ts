import { describe, expect, it, vi } from "vitest";
import { BudgetGuard, type DailyCountStore } from "../src/budget.js";
import { MemoryCache, cacheKey } from "../src/cache.js";
import { createQlooCaller } from "../src/qlooCall.js";
import type { QlooEnvelope } from "../src/types.js";

const ok: QlooEnvelope = { operation: "describe", status: "ok", results: [{ name: "x" }], result_count: 1 };
const retryable: QlooEnvelope = { operation: "describe", status: "error", error: { code: "RATE", retryable: true, recovery: "wait" } };
const fatal: QlooEnvelope = { operation: "describe", status: "error", error: { code: "QLOO_AUTH", retryable: false, recovery: "key" } };

function setup(responses: QlooEnvelope[], perSession = 60) {
  const calls: string[] = [];
  const mcp = { async callTool(name: string) { calls.push(name); return responses.shift() ?? ok; } };
  const cache = new MemoryCache(() => 0);
  const caller = createQlooCaller({ mcp, cache, budget: new BudgetGuard({ perSession, perDay: 1000, now: () => 0 }), sleep: async () => {} });
  return { caller, calls, cache };
}

describe("resilientCall", () => {
  it("rejects invalid calls without touching Qloo", async () => {
    const { caller, calls } = setup([]);
    await expect(caller.call("qloo_api", {}, "s")).rejects.toThrow("tool not allowlisted");
    expect(calls).toHaveLength(0);
  });
  it("caches ok results; second call is a free cache hit", async () => {
    const { caller, calls } = setup([ok]);
    const a = await caller.call("qloo_describe", { entity: "x" }, "s");
    const b = await caller.call("qloo_describe", { entity: "X " }, "s");
    expect([a.cached, b.cached]).toEqual([false, true]);
    expect(calls).toHaveLength(1);
  });
  it("retries retryable errors at most twice", async () => {
    const { caller, calls } = setup([retryable, retryable, retryable]);
    const r = await caller.call("qloo_describe", { entity: "x" }, "s");
    expect(calls).toHaveLength(3);
    expect(r.envelope.status).toBe("error");
  });
  it("succeeds after one retry", async () => {
    const { caller, calls } = setup([retryable, ok]);
    const r = await caller.call("qloo_describe", { entity: "x" }, "s");
    expect(calls).toHaveLength(2);
    expect(r.envelope.status).toBe("ok");
  });
  it("does not retry non-retryable errors and returns the error when nothing is cached", async () => {
    const { caller, calls } = setup([fatal]);
    const r = await caller.call("qloo_describe", { entity: "y" }, "s");
    expect(calls).toHaveLength(1);
    expect(r.envelope).toMatchObject({ status: "error", error: { code: "QLOO_AUTH" } });
  });
  it("never caches needs_input or error envelopes", async () => {
    const needs: QlooEnvelope = { operation: "describe", status: "needs_input", issues: [] };
    const { caller, calls } = setup([needs, needs]);
    await caller.call("qloo_describe", { entity: "x" }, "s");
    await caller.call("qloo_describe", { entity: "x" }, "s");
    expect(calls).toHaveLength(2);
  });
  it("de-duplicates identical in-flight calls and charges budget once (Review Focus 4)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const calls: string[] = [];
    const mcp = { async callTool(name: string) { calls.push(name); await gate; return ok; } };
    const budget = new BudgetGuard({ perSession: 60, perDay: 1000, now: () => 0 });
    const caller = createQlooCaller({ mcp, cache: new MemoryCache(() => 0), budget, sleep: async () => {} });
    const p1 = caller.call("qloo_describe", { entity: "x" }, "s");
    const p2 = caller.call("qloo_describe", { entity: "x" }, "s2");
    release();
    const [a, b] = await Promise.all([p1, p2]);
    expect(calls).toHaveLength(1);
    expect(a.envelope).toEqual(b.envelope);
    expect(budget.remaining("s2").session).toBe(60);
  });
  it("surfaces budget exhaustion as a BUDGET error envelope (not a throw)", async () => {
    const { caller } = setup([ok, ok], 1);
    await caller.call("qloo_describe", { entity: "a" }, "s");
    const r = await caller.call("qloo_describe", { entity: "b" }, "s");
    expect(r.envelope).toMatchObject({ status: "error", error: { code: "BUDGET", retryable: false } });
  });
  it("returns stale cache on non-retryable error", async () => {
    let t = 0;
    const cache = new MemoryCache(() => t);
    await cache.put(cacheKey("qloo_describe", { entity: "x" }), "qloo_describe", ok);
    t = 46 * 86_400_000;
    const mcp = { async callTool() { return fatal; } };
    const caller = createQlooCaller({ mcp, cache, budget: new BudgetGuard({ perSession: 9, perDay: 9, now: () => t }), sleep: async () => {} });
    const r = await caller.call("qloo_describe", { entity: "x" }, "s");
    expect(r).toMatchObject({ cached: true, stale: true });
    expect(r.envelope.status).toBe("ok");
  });
});

describe("resilientCall fix round 1", () => {
  it("does not leak a leader's budget refusal to a follower with budget", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const calls: string[] = [];
    const mcp = { async callTool(name: string) { calls.push(name); await gate; return ok; } };
    const budget = new BudgetGuard({ perSession: 1, perDay: 1000, now: () => 0 });
    budget.reserve("A");
    const caller = createQlooCaller({ mcp, cache: new MemoryCache(() => 0), budget, sleep: async () => {} });
    const p1 = caller.call("qloo_describe", { entity: "x" }, "A");
    const p2 = caller.call("qloo_describe", { entity: "x" }, "B");
    release();
    const [a, b] = await Promise.all([p1, p2]);
    expect(a.envelope).toMatchObject({ status: "error", error: { code: "BUDGET" } });
    expect(b.envelope.status).toBe("ok");
    expect(calls).toHaveLength(1);
  });
  it("charges the leader exactly once and not the follower", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const mcp = { async callTool() { await gate; return ok; } };
    const budget = new BudgetGuard({ perSession: 60, perDay: 1000, now: () => 0 });
    const caller = createQlooCaller({ mcp, cache: new MemoryCache(() => 0), budget, sleep: async () => {} });
    const p1 = caller.call("qloo_describe", { entity: "x" }, "L");
    const p2 = caller.call("qloo_describe", { entity: "x" }, "F");
    release();
    await Promise.all([p1, p2]);
    expect(budget.remaining("L").session).toBe(59);
    expect(budget.remaining("F").session).toBe(60);
  });
  const badCache = { async get() { throw new Error("boom"); }, async put() { throw new Error("boom"); } };
  it("returns ok envelope when cache get and put reject", async () => {
    const mcp = { async callTool() { return ok; } };
    const caller = createQlooCaller({ mcp, cache: badCache as never, budget: new BudgetGuard({ perSession: 9, perDay: 9, now: () => 0 }), sleep: async () => {} });
    const r = await caller.call("qloo_describe", { entity: "x" }, "s");
    expect(r).toMatchObject({ cached: false, stale: false });
    expect(r.envelope.status).toBe("ok");
  });
  it("returns the error envelope when stale get rejects", async () => {
    const mcp = { async callTool() { return fatal; } };
    const caller = createQlooCaller({ mcp, cache: badCache as never, budget: new BudgetGuard({ perSession: 9, perDay: 9, now: () => 0 }), sleep: async () => {} });
    const r = await caller.call("qloo_describe", { entity: "x" }, "s");
    expect(r.envelope).toMatchObject({ status: "error", error: { code: "QLOO_AUTH" } });
  });
});

describe("shared daily count in the caller", () => {
  const mk = (store: DailyCountStore, cache = new MemoryCache(() => 0)) => {
    const calls: string[] = [];
    const mcp = { async callTool(name: string) { calls.push(name); return ok; } };
    const budget = new BudgetGuard({ perSession: 60, perDay: 5, now: () => 0, dailyStore: store });
    return { caller: createQlooCaller({ mcp, cache, budget, sleep: async () => {} }), calls, cache, budget };
  };
  it("a store at the ceiling gives a BUDGET envelope, a joined follower gets the same one, and Qloo is not called", async () => {
    let n = 0;
    const store: DailyCountStore = { tryIncrement: async () => { n += 1; return false; } };
    const { caller, calls, budget } = mk(store);
    const [a, b] = await Promise.all([caller.call("qloo_describe", { entity: "x" }, "s"), caller.call("qloo_describe", { entity: "x" }, "s")]);
    expect(a.envelope).toMatchObject({ status: "error", error: { code: "BUDGET" } });
    expect(b.envelope).toEqual(a.envelope);
    expect(n).toBe(1);
    expect(calls).toHaveLength(0);
    expect(budget.remaining("s").session).toBe(60);
  });
  it("a cache hit never touches the store", async () => {
    let n = 0;
    const store: DailyCountStore = { tryIncrement: async () => { n += 1; return true; } };
    const { caller } = mk(store);
    await caller.call("qloo_describe", { entity: "x" }, "s");
    expect(n).toBe(1);
    const r = await caller.call("qloo_describe", { entity: "x" }, "s");
    expect(r.cached).toBe(true);
    expect(n).toBe(1);
  });
  it("a store that throws still lets the call through", async () => {
    const { caller, calls } = mk({ tryIncrement: async () => { throw new Error("down"); } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const r = await caller.call("qloo_describe", { entity: "x" }, "s");
    warn.mockRestore();
    expect(r.envelope.status).toBe("ok");
    expect(calls).toHaveLength(1);
  });
});
