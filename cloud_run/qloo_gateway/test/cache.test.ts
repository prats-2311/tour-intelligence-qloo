import { describe, expect, it } from "vitest";
import { BigQueryCache, MemoryCache, cacheKey, ttlMs } from "../src/cache.js";

const env = { operation: "describe", status: "ok" as const, results: [] };
const DAY = 86_400_000;

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

describe("BigQueryCache", () => {
  it("inserts rows and reads the latest row back", async () => {
    const rows: Array<Record<string, unknown>> = [];
    const bq = {
      async query({ params }: { query: string; params: Record<string, unknown> }) {
        const match = rows.filter((r) => r.cache_key === params.key).sort((a, b) => Number(b.created_at_ms) - Number(a.created_at_ms));
        return [match.slice(0, 1)] as [Array<Record<string, unknown>>];
      },
      dataset() { return { table() { return { async insert(r: object[]) { rows.push(...(r as Array<Record<string, unknown>>)); } }; } }; },
    };
    const c = new BigQueryCache({ bq, dataset: "tour_intelligence_qloo", now: () => 1000 });
    await c.put("k", "qloo_describe", env);
    const hit = await c.get("k");
    expect(hit?.envelope).toEqual(env);
    expect(rows[0]).toMatchObject({ cache_key: "k", tool: "qloo_describe", created_at_ms: 1000 });
  });
});
