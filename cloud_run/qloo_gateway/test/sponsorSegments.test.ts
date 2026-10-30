import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/http/app.js";
import type { City } from "../src/geo/cities.js";
import { ageIndexes, pickBands, runSponsorSegments, type SponsorSegments } from "../src/pipeline/sponsorSegments.js";
import type { SponsorVerdicts } from "../src/pipeline/sponsorCheck.js";
import type { CallResult, QlooCaller } from "../src/qlooCall.js";
import type { QlooEnvelope } from "../src/types.js";
import { cityHeat } from "./fixtures/envelopes.js";

const CITIES: City[] = [{ id: "1", name: "Mexico City", country: "MX", lat: 19.4326, lon: -99.1332, population: 9_000_000 }];
const IN = { artistId: "ART", city: { name: "Mexico City", country: "MX" }, sessionId: "s" };
const demo = (age: Record<string, number>): QlooEnvelope => ({ operation: "audience_demographics", status: "ok", results: [{ entity_id: "ART", query: { age } }] });
const brands = (ids: string[]): QlooEnvelope => ({ operation: "recommend", status: "ok", results: ids.map((id, i) => ({ entity_id: id, name: `Brand ${id}`, affinity: 1 - i / 100, popularity: 0.5 })) });
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
const BASE = ids("C", 20);
const wrap = (envelope: QlooEnvelope): CallResult => ({ envelope, cacheKey: "k", cached: false, stale: false });

interface Script { demo?: QlooEnvelope; seg?: Record<string, QlooEnvelope>; base?: Record<string, QlooEnvelope>; all?: QlooEnvelope; allBase?: QlooEnvelope }
function fake(script: Script) {
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
  const qloo: QlooCaller = {
    async call(tool, args) {
      calls.push({ tool, args });
      if (tool === "qloo_where_popular") return wrap(cityHeat);
      if (tool === "qloo_audience_demographics") return wrap(script.demo ?? demo({ "25_to_29": 0.9, "55_and_older": 0.5, "24_and_younger": -0.4 }));
      const phrase = args.demographic as string | undefined;
      const signalled = Array.isArray(args.signals);
      if (!phrase) return wrap(signalled ? (script.all ?? brands(["A1", "A2", "A3", "A4", "A5", "A6"])) : (script.allBase ?? brands(BASE)));
      return wrap((signalled ? script.seg?.[phrase] : script.base?.[phrase]) ?? (signalled ? brands(["S1", "S2", "A1", "S3", "S4", "S5"]) : brands(BASE)));
    },
  };
  return { qloo, calls };
}
const run = (script: Script, extra: Partial<Parameters<typeof runSponsorSegments>[1]> = {}) => {
  const f = fake(script);
  return { f, p: runSponsorSegments(IN, { qloo: f.qloo, cities: CITIES, ...extra }) };
};

describe("band selection", () => {
  it("reads results[0].query.age", () => {
    expect(ageIndexes(demo({ "25_to_29": 0.91, junk: 1 }))).toEqual({ "25_to_29": 0.91 });
    expect(ageIndexes({ operation: "x", status: "ok", results: [] })).toBeNull();
  });
  it("keeps at most two bands at or above 0.3, highest first", () => {
    expect(pickBands({ "24_and_younger": -0.37, "25_to_29": 0.91, "30_to_34": -0.96, "55_and_older": 0.78, "35_to_44": 0.5 })).toEqual([{ band: "25_to_29", index: 0.91 }, { band: "55_and_older", index: 0.78 }]);
    expect(pickBands({ "25_to_29": 0.3 })).toEqual([{ band: "25_to_29", index: 0.3 }]);
    expect(pickBands({ "25_to_29": 0.29 })).toEqual([]);
  });
  it("no band qualifying is no_skew with the raw indexes and no recommend calls", async () => {
    const { f, p } = run({ demo: demo({ "25_to_29": 0.1, "55_and_older": -0.2 }) });
    expect(await p).toEqual({ status: "no_skew", indexes: { "25_to_29": 0.1, "55_and_older": -0.2 }, bands: [] });
    expect(f.calls.map((c) => c.tool)).toEqual(["qloo_audience_demographics"]);
  });
  it("no age breakdown is unavailable", async () => {
    const r = await run({ demo: { operation: "audience_demographics", status: "empty", results: [] } }).p;
    expect(r).toMatchObject({ status: "unavailable", reason: "demographics", bands: [] });
  });
});

describe("segment requests", () => {
  it("per band asks the segment list (limit 15, signal) and the segment city baseline (limit 20, no signal), with the playbook's location string", async () => {
    const { f, p } = run({});
    const r = await p;
    const recs = f.calls.filter((c) => c.tool === "qloo_recommend");
    const where = "Mexico City, MX";
    expect(recs).toContainEqual({ tool: "qloo_recommend", args: { target_type: "brand", signals: ["ART"], signal_location: where, demographic: "25-29", limit: 15 } });
    expect(recs).toContainEqual({ tool: "qloo_recommend", args: { target_type: "brand", signal_location: where, demographic: "25-29", limit: 20 } });
    expect(recs).toContainEqual({ tool: "qloo_recommend", args: { target_type: "brand", signals: ["ART"], signal_location: where, demographic: "55-64", limit: 15 } });
    // 2 bands x 2 + the all-fans pair (same requests as the playbook, so cached after a visit)
    expect(recs).toHaveLength(6);
    expect(r.bands.map((b) => [b.band, b.phrase])).toEqual([["25_to_29", "25-29"], ["55_and_older", "55-64"]]);
  });
  it("a band whose recommend is needs_input is unavailable, the rest still answer", async () => {
    const needs: QlooEnvelope = { operation: "recommend", status: "needs_input", summary: "Could not map demographic", results: [] };
    const r = await run({ seg: { "55-64": needs } }).p;
    expect(r.status).toBe("ok");
    expect(r.bands[0]!.status).toBe("ok");
    expect(r.bands[1]).toMatchObject({ band: "55_and_older", status: "unavailable", items: [], newInTop5: null });
  });
  it("an empty segment answer is empty, not unavailable", async () => {
    const r = await run({ seg: { "25-29": { operation: "recommend", status: "empty", results: [] } } }).p;
    expect(r.bands[0]!.status).toBe("unavailable"); // empty status is not a usable answer
    const ok = await run({ seg: { "25-29": { operation: "recommend", status: "ok", results: [] } } }).p;
    expect(ok.bands[0]!.status).toBe("empty");
  });
});

describe("lift and the all-fans comparison", () => {
  it("reuses rankLifted: sorted by rank lift, city rank or null when outside the top 20", async () => {
    const r = await run({ seg: { "25-29": brands(["C3", "X1", "C1", "X2"]) } }).p;
    const items = r.bands[0]!.items;
    // rank lift = (cityRank or 21) - artistRank: X1 20, X2 17, C3 -0... C3: 3-1=2, C1: 1-3=-2
    expect(items.map((i) => i.entityId)).toEqual(["X1", "X2", "C3", "C1"]);
    expect(items.find((i) => i.entityId === "X1")).toEqual({ name: "Brand X1", entityId: "X1", artistRank: 2, cityRank: null });
    expect(items.find((i) => i.entityId === "C3")).toMatchObject({ artistRank: 1, cityRank: 3 });
    expect(r.bands[0]!.lifted).toBe(true);
  });
  it("a baseline shorter than 20 makes no city claim: Qloo's order, cityRank null, lifted false", async () => {
    const r = await run({ base: { "25-29": brands(["C1", "C2"]) }, seg: { "25-29": brands(["C2", "X1"]) } }).p;
    expect(r.bands[0]).toMatchObject({ lifted: false, items: [{ entityId: "C2", artistRank: 1, cityRank: null }, { entityId: "X1", artistRank: 2, cityRank: null }] });
  });
  it("counts how many of the segment's top 5 are not in the all-fans top 5", async () => {
    // all fans (no lift candidates beyond the baseline): A1..A6 all off-chart, so ranked A1..A5 -> top5 A1-A5. Segment top 5 sorted by lift: S1,S2,A1,S3,S4 -> 4 differ.
    const r = await run({}).p;
    expect(r.bands[0]!.items.slice(0, 5).map((i) => i.entityId)).toEqual(["S1", "S2", "A1", "S3", "S4"]);
    expect(r.bands[0]!.newInTop5).toBe(4);
    const same = await run({ seg: { "25-29": brands(["A1", "A2", "A3", "A4", "A5"]) } }).p;
    expect(same.bands[0]!.newInTop5).toBe(0);
  });
  it("newInTop5 is null when the all-fans list is unusable", async () => {
    const r = await run({ all: { operation: "recommend", status: "error", results: [] } }).p;
    expect(r.bands[0]!.newInTop5).toBeNull();
  });
});

describe("sponsor check", () => {
  const verdictsOf = (yes: string[], no: string[] = []): SponsorVerdicts => ({ available: true, verdicts: new Map([...yes.map((i): [string, boolean] => [i, true]), ...no.map((i): [string, boolean] => [i, false])]) });
  it("batches every segment's candidates in one call, then the all-fans list separately", async () => {
    const check = vi.fn(async (c: Array<{ entityId: string }>) => verdictsOf(c.map((x) => x.entityId)));
    await run({}, { sponsorCheck: check }).p;
    expect(check).toHaveBeenCalledTimes(2);
    const first = check.mock.calls[0]![0].map((c) => c.entityId);
    expect(first).toEqual(expect.arrayContaining(["S1", "S5", "A1"]));
    expect(new Set(first).size).toBe(first.length); // de-duplicated across bands
    expect(check.mock.calls[1]![0].map((c) => c.entityId)).toEqual(["A1", "A2", "A3", "A4", "A5", "A6"]);
  });
  it("hides non-sponsors (model no, missing id, listed name) and counts them", async () => {
    const check = vi.fn(async () => verdictsOf(["S1", "A1", "A2", "A3", "A4", "A5", "A6"], ["S2"])); // S3.. missing -> hidden when the check is available
    const r = await run({}, { sponsorCheck: check }).p;
    expect(r.bands[0]!.items.map((i) => i.entityId)).toEqual(["S1", "A1"]);
    expect(r.bands[0]!.hiddenCount).toBe(4);
    const named: QlooEnvelope = { operation: "recommend", status: "ok", results: [{ entity_id: "N1", name: "Greenpeace", affinity: 1, popularity: 0.5 }, { entity_id: "N2", name: "Vans", affinity: 0.9, popularity: 0.5 }] };
    const r2 = await run({ seg: { "25-29": named } }).p; // no model check: the name list still applies
    expect(r2.bands[0]!.items.map((i) => i.name)).toEqual(["Vans"]);
    expect(r2.bands[0]!.hiddenCount).toBe(1);
  });
  it("a failed model check falls back to the name list and says so", async () => {
    const r = await run({}, { sponsorCheck: async () => ({ available: false, verdicts: new Map([["S2", false]]) }) }).p;
    expect(r.bands[0]!.items.map((i) => i.entityId)).not.toContain("S2");
    expect(r.bands[0]!.items).toHaveLength(5);
    expect(r.bands[0]!.sponsorCheck).toBe("unavailable");
  });
});

describe("budget and routing", () => {
  const budgetCaller: QlooCaller = { async call() { return wrap({ operation: "audience_demographics", status: "error", summary: "Session limit reached", error: { code: "BUDGET", retryable: false, recovery: "x" } }); } };
  it("a budget stop is an unavailable answer, not a throw", async () => {
    const r = await runSponsorSegments(IN, { qloo: budgetCaller, cities: CITIES });
    expect(r).toMatchObject({ status: "unavailable", reason: "budget", message: "Session limit reached", bands: [] });
  });
  it("an unknown city is unavailable (location), not guessed", async () => {
    const f = fake({});
    expect(await runSponsorSegments({ ...IN, city: { name: "Nowhere", country: "MX" } }, { qloo: f.qloo, cities: CITIES })).toMatchObject({ status: "unavailable", reason: "location" });
  });
  const mk = (qloo: QlooCaller) => createApp({ qloo, cities: CITIES, health: async () => ({ connected: true, ready: true }) });
  const q = "artistId=ART&city=Mexico%20City&country=MX";
  it("GET /v1/sponsor-segments validates and answers JSON", async () => {
    const app = mk(fake({}).qloo);
    expect((await request(app).get(`/v1/sponsor-segments?${q}`)).status).toBe(400); // no session
    expect((await request(app).get("/v1/sponsor-segments?city=x&country=MX").set("x-session-id", "s")).status).toBe(400);
    expect((await request(app).get(`/v1/sponsor-segments?${q}&lat=abc&lon=1`).set("x-session-id", "s")).status).toBe(400);
    const ok = await request(app).get(`/v1/sponsor-segments?${q}&cityId=1&lat=19.4&lon=-99.1`).set("x-session-id", "s");
    expect(ok.status).toBe(200);
    const body = ok.body as SponsorSegments;
    expect(body.status).toBe("ok");
    expect(Object.keys(body.bands[0]!).sort()).toEqual(["band", "hiddenCount", "index", "items", "lifted", "newInTop5", "phrase", "status"]);
  });
  it("budget errors map to 200 unavailable; other failures to 500 internal error", async () => {
    const b = await request(mk(budgetCaller)).get(`/v1/sponsor-segments?${q}`).set("x-session-id", "s");
    expect(b.status).toBe(200);
    expect(b.body).toMatchObject({ status: "unavailable", reason: "budget" });
    const boom = await request(mk({ async call() { throw new Error("db exploded"); } })).get(`/v1/sponsor-segments?${q}`).set("x-session-id", "s");
    expect(boom.status).toBe(500);
    expect(boom.body).toEqual({ error: "internal error" });
  });
});
