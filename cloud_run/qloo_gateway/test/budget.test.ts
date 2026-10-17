import { describe, expect, it, vi } from "vitest";
import { BudgetExceededError, BudgetGuard, FirestoreDailyCountStore, type DailyCountStore } from "../src/budget.js";
import type { TxDb } from "../src/web/usage.js";

const reserveShared = async (g: BudgetGuard, id: string) => { g.reserve(id); await g.persistDaily(id); };

function fakeDb(): TxDb & { docs: Map<string, Record<string, unknown>> } {
  const docs = new Map<string, Record<string, unknown>>();
  return {
    docs,
    doc: (path: string) => ({ path }),
    async runTransaction(fn) {
      return fn({
        async get(ref) { const d = docs.get((ref as { path: string }).path); return { exists: !!d, data: () => d }; },
        set(ref, data) { docs.set((ref as { path: string }).path, data); },
      });
    },
  };
}

describe("BudgetGuard", () => {
  it("allows up to perSession calls per session", () => {
    const b = new BudgetGuard({ perSession: 2, perDay: 100, now: () => 0 });
    b.reserve("s1"); b.reserve("s1");
    expect(() => b.reserve("s1")).toThrow(BudgetExceededError);
    expect(() => b.reserve("s2")).not.toThrow();
  });
  it("enforces the daily ceiling across sessions and resets the next UTC day", () => {
    let t = Date.UTC(2026, 9, 20, 23, 59);
    const b = new BudgetGuard({ perSession: 10, perDay: 2, now: () => t });
    b.reserve("a"); b.reserve("b");
    expect(() => b.reserve("c")).toThrow(BudgetExceededError);
    let caught: unknown;
    try { b.reserve("c"); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(BudgetExceededError);
    expect((caught as BudgetExceededError).scope).toBe("daily");
    t = Date.UTC(2026, 9, 21, 0, 1);
    expect(() => b.reserve("c")).not.toThrow();
  });
  it("reports remaining", () => {
    const b = new BudgetGuard({ perSession: 5, perDay: 9, now: () => 0 });
    b.reserve("s");
    expect(b.remaining("s")).toEqual({ session: 4, daily: 8 });
  });
  it("resets per-session counts when the UTC day rolls", () => {
    let t = Date.UTC(2026, 9, 20, 12);
    const b = new BudgetGuard({ perSession: 2, perDay: 100, now: () => t });
    b.reserve("s"); b.reserve("s");
    expect(() => b.reserve("s")).toThrow(BudgetExceededError);
    t = Date.UTC(2026, 9, 21, 0, 1);
    expect(() => b.reserve("s")).not.toThrow();
    expect(b.remaining("s").session).toBe(1);
  });
  describe("public MCP sessions", () => {
    const make = (now = () => 0) => new BudgetGuard({ perSession: 100, perDay: 10, publicPerDay: 3, now });
    it("stop at the public ceiling while dashboard sessions continue", () => {
      const b = make();
      b.reserve("mcp-public-a"); b.reserve("mcp-public-b"); b.reserve("mcp-public-a");
      let caught: unknown;
      try { b.reserve("mcp-public-c"); } catch (e) { caught = e; }
      expect(caught).toBeInstanceOf(BudgetExceededError);
      expect((caught as BudgetExceededError).scope).toBe("public");
      expect(() => b.reserve("dash-1")).not.toThrow();
    });
    it("count toward the global daily ceiling", () => {
      const b = new BudgetGuard({ perSession: 100, perDay: 4, publicPerDay: 3, now: () => 0 });
      b.reserve("mcp-public-a"); b.reserve("mcp-public-a"); b.reserve("mcp-public-a");
      b.reserve("dash-1");
      expect(() => b.reserve("dash-2")).toThrow(BudgetExceededError);
    });
    it("are checked before the global ceiling and do not consume it when refused", () => {
      const b = new BudgetGuard({ perSession: 100, perDay: 3, publicPerDay: 1, now: () => 0 });
      b.reserve("mcp-public-a");
      let scope = "";
      try { b.reserve("mcp-public-a"); } catch (e) { scope = (e as BudgetExceededError).scope; }
      expect(scope).toBe("public");
      expect(b.remaining("dash-1").daily).toBe(2);
    });
    it("reset the next UTC day and default the public ceiling to 400", () => {
      let t = Date.UTC(2026, 9, 20, 12);
      const b = make(() => t);
      b.reserve("mcp-public-a"); b.reserve("mcp-public-a"); b.reserve("mcp-public-a");
      expect(() => b.reserve("mcp-public-a")).toThrow(BudgetExceededError);
      t = Date.UTC(2026, 9, 21, 0, 1);
      expect(() => b.reserve("mcp-public-a")).not.toThrow();
      const d = new BudgetGuard({ perSession: 1000, perDay: 1000, now: () => 0 });
      for (let i = 0; i < 400; i++) d.reserve(`mcp-public-${i}`);
      expect(() => d.reserve("mcp-public-x")).toThrow(BudgetExceededError);
    });
  });
  describe("persisted daily count", () => {
    const t = Date.UTC(2026, 9, 20, 12);
    it("two guards sharing one Firestore stop at the ceiling together", async () => {
      const db = fakeDb();
      const mk = () => new BudgetGuard({ perSession: 100, perDay: 3, now: () => t, dailyStore: new FirestoreDailyCountStore({ db }) });
      const a = mk(), b = mk();
      await reserveShared(a, "s1"); await reserveShared(b, "s2"); await reserveShared(a, "s1");
      await expect(reserveShared(b, "s3")).rejects.toMatchObject({ scope: "daily" });
      expect(db.docs.get("qloo_usage/2026-10-20")).toEqual({ count: 3 });
    });
    it("public sessions still count toward the global ceiling", async () => {
      const db = fakeDb();
      const g = new BudgetGuard({ perSession: 100, perDay: 2, publicPerDay: 5, now: () => t, dailyStore: new FirestoreDailyCountStore({ db }) });
      await reserveShared(g, "mcp-public-a"); await reserveShared(g, "mcp-public-b");
      await expect(reserveShared(g, "dash-1")).rejects.toMatchObject({ scope: "daily" });
    });
    it("a refused reservation is released from the in-memory counts", async () => {
      const db = fakeDb();
      db.docs.set("qloo_usage/2026-10-20", { count: 1 });
      const g = new BudgetGuard({ perSession: 100, perDay: 1, now: () => t, dailyStore: new FirestoreDailyCountStore({ db }) });
      await expect(reserveShared(g, "s")).rejects.toBeInstanceOf(BudgetExceededError);
      expect(g.remaining("s").session).toBe(100);
    });
    it("on a Firestore error it logs and falls back to the in-memory count", async () => {
      const failing: DailyCountStore = { tryIncrement: async () => { throw new Error("firestore down"); } };
      const g = new BudgetGuard({ perSession: 100, perDay: 2, now: () => t, dailyStore: failing });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      await reserveShared(g, "s"); await reserveShared(g, "s");
      await expect(reserveShared(g, "s")).rejects.toMatchObject({ scope: "daily" });
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
    it("a stalled store times out after 1500 ms, falls back to memory and warns once a minute", async () => {
      vi.useFakeTimers();
      try {
        let now = t;
        const hung: DailyCountStore = { tryIncrement: () => new Promise<boolean>(() => undefined) };
        const g = new BudgetGuard({ perSession: 100, perDay: 100, now: () => now, dailyStore: hung });
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const run = async () => { const p = reserveShared(g, "s"); await vi.advanceTimersByTimeAsync(1500); await p; };
        let settled = false;
        const first = reserveShared(g, "s").then(() => { settled = true; });
        await vi.advanceTimersByTimeAsync(1499);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await first;
        expect(settled).toBe(true);
        await run(); await run();
        expect(warn).toHaveBeenCalledTimes(1);
        now += 61_000;
        await run();
        expect(warn).toHaveBeenCalledTimes(2);
        expect(g.remaining("s").daily).toBe(100 - 4);
        warn.mockRestore();
      } finally { vi.useRealTimers(); }
    });
    it("a new UTC day uses a new doc", async () => {
      const db = fakeDb();
      let now = t;
      const g = new BudgetGuard({ perSession: 100, perDay: 1, now: () => now, dailyStore: new FirestoreDailyCountStore({ db }) });
      await reserveShared(g, "s");
      now = Date.UTC(2026, 9, 21, 1);
      await reserveShared(g, "s");
      expect([...db.docs.keys()].sort()).toEqual(["qloo_usage/2026-10-20", "qloo_usage/2026-10-21"]);
    });
  });
});
