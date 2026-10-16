import { describe, expect, it } from "vitest";
import { FirestoreUsageStore, MemoryUsageStore, TAVILY_CAPS, type TxDb } from "../src/web/usage.js";

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

describe("usage caps", () => {
  it("caps are 25 a day and 600 a month", () => expect(TAVILY_CAPS).toEqual({ perDay: 25, perMonth: 600 }));
  it("memory store refuses the 26th call of a day and resets the next day", async () => {
    const s = new MemoryUsageStore();
    for (let i = 0; i < 25; i += 1) expect((await s.tryIncrement("2026-10-17", "2026-10")).ok).toBe(true);
    expect(await s.tryIncrement("2026-10-17", "2026-10")).toEqual({ ok: false, scope: "day" });
    expect((await s.tryIncrement("2026-10-18", "2026-10")).ok).toBe(true);
  });
  it("memory store refuses the 601st call of a month", async () => {
    const s = new MemoryUsageStore({ perDay: 1000, perMonth: 600 });
    for (let i = 0; i < 600; i += 1) await s.tryIncrement("2026-10-17", "2026-10");
    expect(await s.tryIncrement("2026-10-17", "2026-10")).toEqual({ ok: false, scope: "month" });
  });
  it("firestore store persists counts so a new instance (restart) still enforces the cap", async () => {
    const db = fakeDb();
    const a = new FirestoreUsageStore({ db, caps: { perDay: 2, perMonth: 600 } });
    await a.tryIncrement("2026-10-17", "2026-10");
    await a.tryIncrement("2026-10-17", "2026-10");
    const b = new FirestoreUsageStore({ db, caps: { perDay: 2, perMonth: 600 } });
    expect(await b.tryIncrement("2026-10-17", "2026-10")).toEqual({ ok: false, scope: "day" });
    expect(db.docs.get("tavily_usage/2026-10")).toMatchObject({ month: 2, days: { "2026-10-17": 2 } });
  });
  it("firestore store takes a doc prefix and caps, so Gemini counts live in gemini_usage/<YYYY-MM>", async () => {
    const db = fakeDb();
    const a = new FirestoreUsageStore({ db, prefix: "gemini_usage", caps: { perDay: 1, perMonth: 10000 } });
    expect((await a.tryIncrement("2026-10-17", "2026-10")).ok).toBe(true);
    expect(db.docs.get("gemini_usage/2026-10")).toMatchObject({ month: 1 });
    expect(db.docs.has("tavily_usage/2026-10")).toBe(false);
    const b = new FirestoreUsageStore({ db, prefix: "gemini_usage", caps: { perDay: 1, perMonth: 10000 } });
    expect(await b.tryIncrement("2026-10-17", "2026-10")).toEqual({ ok: false, scope: "day" });
  });
});
