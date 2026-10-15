import { describe, expect, it } from "vitest";
import { FirestoreCache, MemoryCache, TieredCache, cacheKey, ttlMs, type FirestoreLike } from "../src/cache.js";

const env = { operation: "describe", status: "ok" as const, results: [] };
const DAY = 86_400_000;

function fakeFirestore() {
  const docs = new Map<string, Record<string, unknown>>();
  const db: FirestoreLike = {
    collection: () => ({
      doc: (id: string) => ({
        async get() { const d = docs.get(id); return { exists: d !== undefined, data: () => d }; },
        async set(data: Record<string, unknown>) { docs.set(id, data); },
      }),
    }),
  };
  return { db, docs };
}

describe("cacheKey", () => {
  it("is stable across key order, case and whitespace in strings", () => {
    expect(cacheKey("qloo_describe", { entity: "Bad Bunny ", type: "artist" }))
      .toBe(cacheKey("qloo_describe", { type: "artist", entity: "bad bunny" }));
  });
  it("differs by tool and by array order", () => {
    expect(cacheKey("qloo_describe", { entity: "x" })).not.toBe(cacheKey("qloo_entity_tags", { entity: "x" }));
    expect(cacheKey("qloo_rank", { options: ["a", "b"] })).not.toBe(cacheKey("qloo_rank", { options: ["b", "a"] }));
  });
});

describe("ttlMs", () => {
  it("is 1 day for trends, 7 days otherwise", () => {
    expect(ttlMs("qloo_trends")).toBe(DAY);
    expect(ttlMs("qloo_recommend")).toBe(7 * DAY);
  });
});

describe("MemoryCache", () => {
  it("returns fresh entries and hides expired ones unless allowStale", async () => {
    let t = 0;
    const c = new MemoryCache(() => t);
    await c.put("k", "qloo_trends", env);
    expect((await c.get("k"))?.stale).toBe(false);
    t = DAY + 1;
    expect(await c.get("k")).toBeNull();
    expect((await c.get("k", { allowStale: true }))?.stale).toBe(true);
  });
  it("latest put wins", async () => {
    const c = new MemoryCache(() => 0);
    await c.put("k", "qloo_describe", env);
    await c.put("k", "qloo_describe", { ...env, summary: "new" });
    expect((await c.get("k"))?.envelope.summary).toBe("new");
  });
});

describe("MemoryCache LRU", () => {
  it("evicts the least recently used entry beyond maxEntries", async () => {
    const c = new MemoryCache(() => 0, 2);
    await c.put("a", "qloo_describe", env);
    await c.put("b", "qloo_describe", env);
    await c.get("a");                       // a is now most recent
    await c.put("c", "qloo_describe", env); // evicts b
    expect(await c.get("b")).toBeNull();
    expect(await c.get("a")).not.toBeNull();
    expect(await c.get("c")).not.toBeNull();
  });
  it("put honours an explicit createdAt", async () => {
    let t = 10 * DAY;
    const c = new MemoryCache(() => t);
    await c.put("k", "qloo_trends", env, 0);
    expect(await c.get("k")).toBeNull();    // created at 0, now 10 days → stale
  });
});

describe("FirestoreCache", () => {
  it("round-trips an envelope and writes TTL fields", async () => {
    const { db, docs } = fakeFirestore();
    const c = new FirestoreCache({ db, now: () => 1000 });
    await c.put("k", "qloo_describe", env);
    expect((await c.get("k"))?.envelope).toEqual(env);
    const row = docs.get("k")!;
    expect(row).toMatchObject({ tool: "qloo_describe", createdAtMs: 1000 });
    expect((row.expireAt as Date).getTime()).toBe(1000 + 7 * DAY + 7 * DAY);
  });
  it("returns null for missing docs and hides stale rows unless allowStale", async () => {
    let t = 0;
    const { db } = fakeFirestore();
    const c = new FirestoreCache({ db, now: () => t });
    expect(await c.get("nope")).toBeNull();
    await c.put("k", "qloo_trends", env);
    t = DAY + 1;
    expect(await c.get("k")).toBeNull();
    expect((await c.get("k", { allowStale: true }))?.stale).toBe(true);
  });
  it("treats a malformed createdAtMs as a miss", async () => {
    const { db, docs } = fakeFirestore();
    docs.set("k", { tool: "qloo_describe", envelope: JSON.stringify(env), createdAtMs: "garbage" });
    expect(await new FirestoreCache({ db, now: () => 0 }).get("k", { allowStale: true })).toBeNull();
  });
});

describe("TieredCache", () => {
  it("serves L1 first, falls back to L2 and back-fills L1 with the original createdAt", async () => {
    let t = 0;
    const l1 = new MemoryCache(() => t);
    const l2 = new MemoryCache(() => t);
    await l2.put("k", "qloo_trends", env);
    const tiered = new TieredCache({ l1, l2 });
    t = 1000;
    expect((await tiered.get("k"))?.envelope).toEqual(env);
    expect((await l1.get("k"))?.createdAt).toBe(0);
  });
  it("writes through to both tiers", async () => {
    const l1 = new MemoryCache(() => 0);
    const l2 = new MemoryCache(() => 0);
    await new TieredCache({ l1, l2 }).put("k", "qloo_describe", env);
    expect(await l1.get("k")).not.toBeNull();
    expect(await l2.get("k")).not.toBeNull();
  });
  it("survives L2 failures (treated as miss / no-op) and reports them", async () => {
    const errors: unknown[] = [];
    const broken = { async get() { throw new Error("firestore down"); }, async put() { throw new Error("firestore down"); } };
    const tiered = new TieredCache({ l1: new MemoryCache(() => 0), l2: broken, onError: (e) => errors.push(e) });
    await tiered.put("k", "qloo_describe", env);
    expect((await tiered.get("k"))?.envelope).toEqual(env);      // from L1
    expect(await tiered.get("missing")).toBeNull();              // L2 throws → miss
    expect(errors).toHaveLength(2);
  });
});
