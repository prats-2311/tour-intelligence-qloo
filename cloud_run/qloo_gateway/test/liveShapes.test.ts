import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractCandidates, extractEntities, extractHeatPoints, extractMusicTags, extractSharedTaste, extractTrendPoints } from "../src/extract.js";
import type { QlooEnvelope } from "../src/types.js";

/** Synthetic fixtures with the shape of real hackathon-API responses (scripts/synthesize-fixture.mjs; Qloo data is never committed). */
const live = (name: string): QlooEnvelope =>
  ({ operation: name, ...JSON.parse(readFileSync(new URL(`./fixtures/live/${name}.json`, import.meta.url), "utf8")) }) as QlooEnvelope;

describe("live Qloo shapes", () => {
  it("shared taste is the mean of the top-5 shared-tag scores", () => {
    const env = live("compare");
    const tagRows = (env.results as { tags: Array<{ name: string; query: { score: number } }> }).tags;
    const scores = tagRows.map((t) => t.query.score).sort((a, b) => b - a).slice(0, 5);
    const top = [...tagRows].sort((a, b) => b.query.score - a.query.score)[0]!;
    const st = extractSharedTaste(env);
    expect(st.value).toBeGreaterThan(0);
    expect(st.value).toBeLessThanOrEqual(1);
    expect(st.value).toBeCloseTo(scores.reduce((a, b) => a + b, 0) / 5, 10);
    expect(st.tags).toHaveLength(5);
    expect(st.tags[0]).toEqual({ name: top.name, score: scores[0] });
    expect(st.tags.every((t) => t.name !== "")).toBe(true);
  });
  it("shared taste with no (or unscored) tags is null, never NaN", () => {
    expect(extractSharedTaste({ operation: "c", status: "ok", results: { a: [], b: [], matchEntities: [], tags: [] } })).toEqual({ value: null, tags: [] });
    expect(extractSharedTaste({ operation: "c", status: "ok", results: { tags: [{ name: "x", query: { count: "1" } }] } })).toEqual({ value: null, tags: [] });
    expect(extractSharedTaste({ operation: "c", status: "ok", results: null })).toEqual({ value: null, tags: [] });
  });
  it("an empty trends series is normal and yields no points", () => {
    expect(extractTrendPoints(live("trends-empty"))).toEqual([]);
  });
  it("reads trend points from series[0].points", () => {
    const env: QlooEnvelope = { operation: "t", status: "ok", series: [{ entity: {}, points: [{ date: "2026-10-01", value: 0.4 }, { day: "2026-10-02", velocity_fold_change: 1.5 }, { foo: 1 }] }] };
    expect(extractTrendPoints(env)).toEqual([{ date: "2026-10-01", value: 0.4 }, { date: "2026-10-02", value: 1.5 }]);
  });
  it("music tags drop credit-card and other non-taste tags", () => {
    const env = live("entity-tags");
    const all = (env.results as Array<{ id: string }>).map((t) => t.id);
    expect(all.some((id) => id.startsWith("urn:tag:credit_card:"))).toBe(true);
    const music = extractMusicTags(env);
    expect(music.length).toBeGreaterThan(0);
    expect(music.every((t) => /^urn:tag:(genre:music|subgenre:|artist:qloo)/.test(t.id))).toBe(true);
    expect(music.some((t) => t.id.startsWith("urn:tag:credit_card:"))).toBe(false);
  });
  it("entity category comes from subtype minus urn:entity:", () => {
    expect(extractEntities(live("brand-gdl"))[0]!.category).toBe("brand");
    expect(extractEntities(live("artist-signal-location"))[0]!.category).toBe("artist");
    expect(extractEntities(live("place-gdl"))[0]!.category).toBe("place");
  });
  it("describe results have no type/subtype and so no category", () => {
    const e = extractEntities(live("describe"))[0]!;
    expect(e.name).toBe((live("describe").results as Array<{ name: string }>)[0]!.name);
    expect(e.category).toBeUndefined();
  });
  it("category falls back to a non-generic type", () => {
    expect(extractEntities({ operation: "x", status: "ok", results: [{ entity_id: "1", name: "n", type: "urn:entity:artist" }, { entity_id: "2", name: "m", type: "urn:entity" }] }).map((e) => e.category)).toEqual(["artist", undefined]);
  });
  it("rank with names yields entity-id candidates", () => {
    const c = extractCandidates(live("rank-needs-input"));
    expect(c[0]!.id).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i);
    expect(c[0]!.name).toBe((live("rank-needs-input").resolution as { issues: Array<{ candidates: Array<{ name: string }> }> }).issues[0]!.candidates[0]!.name);
  });
  it("heat points still parse from live where_popular", () => {
    const pts = extractHeatPoints(live("heat-gdl"));
    expect(pts.length).toBeGreaterThan(0);
    expect(pts[0]!.lat).toBe((live("heat-gdl").results as Array<{ location: { latitude: number } }>)[0]!.location.latitude);
  });
});
