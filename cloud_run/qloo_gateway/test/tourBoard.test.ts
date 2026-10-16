import { describe, expect, it } from "vitest";
import type { City } from "../src/geo/cities.js";
import { runTourBoard, type TourBrief } from "../src/pipeline/tourBoard.js";
import type { QlooCaller } from "../src/qlooCall.js";
import type { GatewayEvent, QlooEnvelope } from "../src/types.js";
import { cityHeat, describeAmbiguous, describeOk, heatEmpty, heatMexico, recs } from "./fixtures/envelopes.js";

const CITIES: City[] = [
  { id: "1", name: "Mexico City", country: "MX", lat: 19.4326, lon: -99.1332, population: 9_000_000 },
  { id: "2", name: "Monterrey", country: "MX", lat: 25.6866, lon: -100.3161, population: 1_100_000 },
  { id: "3", name: "Coyoacan", country: "MX", lat: 19.35, lon: -99.162, population: 600_000 },
];

function fakeQloo(route: (tool: string, args: Record<string, unknown>) => QlooEnvelope, log: string[] = []): QlooCaller {
  return { async call(tool, args) { log.push(`${tool}:${String(args.within ?? args.filter_location ?? args.signal_location ?? "")}`); return { envelope: route(tool, args), cacheKey: `${tool}-${log.length}`, cached: false, stale: false }; } };
}

const brief: TourBrief = { artist: "Test Artist", regions: ["Mexico"], maxStops: 8, sessionId: "s", today: "2026-10-20" };

async function collect(gen: AsyncGenerator<GatewayEvent>) { const out: GatewayEvent[] = []; for await (const e of gen) out.push(e); return out; }

const happy = (tool: string, args: Record<string, unknown>): QlooEnvelope => {
  if (tool === "qloo_describe") return describeOk;
  if (tool === "qloo_where_popular") return args.within === "Mexico" ? heatMexico : cityHeat;
  if (tool === "qloo_recommend") return recs(["One", "Two", "Three"], [0.9, 0.7, 0.5]);
  if (tool === "qloo_rank") return recs(["Venue A"], [0.8]);
  return { operation: tool, status: "ok", results: [] };
};

describe("runTourBoard", () => {
  it("emits resolve, scored cities sorted by winnability, and done", async () => {
    const events = await collect(runTourBoard(brief, { qloo: fakeQloo(happy), cities: CITIES }));
    expect(events.find((e) => e.type === "resolve")).toMatchObject({ type: "resolve", entity: { entityId: "A1", name: "Test Artist" } });
    expect(events.some((e) => e.type === "tool_call" && e.tool === "qloo_describe")).toBe(true);
    expect(events.some((e) => e.type === "artist_profile")).toBe(true);
    const scored = events.filter((e) => e.type === "city_scored");
    expect(scored.map((e) => (e as { city: { name: string } }).city.name)).toEqual(["Mexico City", "Monterrey"]);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("stops with needs_input for ambiguous artists (Review Focus 1)", async () => {
    const events = await collect(runTourBoard({ ...brief, artist: "Pedro" }, { qloo: fakeQloo((t) => (t === "qloo_describe" ? describeAmbiguous : happy(t, {}))), cities: CITIES }));
    expect(events.map((e) => e.type)).toEqual(["tool_call", "tool_result", "needs_input"]);
    expect(events.at(-1)).toMatchObject({ type: "needs_input", candidates: [{ id: "P1" }, { id: "P2" }] });
  });

  it("uses artistEntityId when the user picked a candidate", async () => {
    const log: string[] = [];
    await collect(runTourBoard({ ...brief, artist: "Pedro", artistEntityId: "P2" }, { qloo: fakeQloo(happy, log), cities: CITIES }));
    expect(log.some((l) => l.startsWith("qloo_describe"))).toBe(false);
  });

  it("marks an empty region and still finishes (Review Focus 2)", async () => {
    const events = await collect(runTourBoard({ ...brief, regions: ["Atlantis", "Mexico"] }, {
      qloo: fakeQloo((t, a) => (t === "qloo_where_popular" && a.within === "Atlantis" ? heatEmpty : happy(t, a))), cities: CITIES,
    }));
    expect(events).toContainEqual({ type: "region_empty", region: "Atlantis" });
    expect(events.at(-1)?.type).toBe("done");
  });

  it("gives insufficient_data activation when city calls are empty", async () => {
    const events = await collect(runTourBoard(brief, {
      qloo: fakeQloo((t, a) => (t === "qloo_describe" ? describeOk : t === "qloo_where_popular" && a.within === "Mexico" ? heatMexico : { operation: t, status: "empty", results: [] })),
      cities: CITIES,
    }));
    const city = (events.find((e) => e.type === "city_scored") as { city: { verdict: string } }).city;
    expect(city.verdict).toBe("insufficient_data");
  });

  it("stops issuing calls once aborted", async () => {
    const controller = new AbortController();
    const log: string[] = [];
    const gen = runTourBoard(brief, { qloo: fakeQloo(happy, log), cities: CITIES, signal: controller.signal });
    await gen.next(); // resolve (only qloo_describe has run)
    controller.abort();
    const atAbort = log.length;
    const rest = await collect(gen);
    expect(rest.at(-1)).toMatchObject({ type: "error", code: "ABORTED" });
    expect(log.length).toBe(atAbort);
  });

  it("computes the trends window as the 90 days ending today", async () => {
    const seen: Array<Record<string, unknown>> = [];
    await collect(runTourBoard(brief, { qloo: fakeQloo((t, a) => { if (t === "qloo_trends") seen.push(a); return happy(t, a); }), cities: CITIES }));
    expect(seen[0]).toMatchObject({ start_date: "2026-07-22", end_date: "2026-10-20", entity_type: "artist" });
  });

  it("is not capped by maxStops: shortlists the top 8 by fan heat", async () => {
    const many: City[] = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, name: `City${i}`, country: "MX", lat: 10 + i * 2, lon: -100, population: 1_000_000 }));
    const heat: QlooEnvelope = { operation: "where_popular", status: "ok", results: many.map((c, i) => ({ location: { latitude: c.lat, longitude: c.lon }, query: { affinity: 0.95 - i * 0.05, popularity: 0.3 } })) };
    const events = await collect(runTourBoard({ ...brief, maxStops: 2 }, { qloo: fakeQloo((t, a) => (t === "qloo_where_popular" && a.within === "Mexico" ? heat : happy(t, a))), cities: many }));
    expect(events.filter((e) => e.type === "city_scored")).toHaveLength(8);
  });

  it("dedupes a city appearing in two regions", async () => {
    const events = await collect(runTourBoard({ ...brief, regions: ["Mexico", "Mexico2"] }, { qloo: fakeQloo((t, a) => (t === "qloo_where_popular" && String(a.within).startsWith("Mexico") ? heatMexico : happy(t, a))), cities: CITIES }));
    const names = events.filter((e) => e.type === "city_scored").map((e) => (e as { city: { name: string } }).city.name);
    expect(names).toEqual(["Mexico City", "Monterrey"]);
  });

  it("adds a tv_show recommend to local hooks", async () => {
    const targets: unknown[] = [];
    await collect(runTourBoard(brief, { qloo: fakeQloo((t, a) => { if (t === "qloo_recommend") targets.push(a.target_type); return happy(t, a); }), cities: CITIES }));
    expect(targets).toContain("tv_show");
  });

  it("reports a describe error honestly instead of NOT_FOUND", async () => {
    const err: QlooEnvelope = { operation: "describe", status: "error", summary: "bad key", error: { code: "QLOO_AUTH", retryable: false, recovery: "check key" } };
    const events = await collect(runTourBoard(brief, { qloo: fakeQloo(() => err), cities: CITIES }));
    expect(events.filter((e) => e.type === "error")).toEqual([{ type: "error", code: "QLOO_AUTH", message: "bad key" }]);
    expect(events.some((e) => e.type === "resolve")).toBe(false);
  });

  it("marks an errored region unavailable (not empty) and still finishes", async () => {
    const err: QlooEnvelope = { operation: "where_popular", status: "error", summary: "boom", error: { code: "QLOO_HTTP", retryable: false, recovery: "retry" } };
    const events = await collect(runTourBoard({ ...brief, regions: ["Broken", "Mexico"] }, { qloo: fakeQloo((t, a) => (t === "qloo_where_popular" && a.within === "Broken" ? err : happy(t, a))), cities: CITIES }));
    expect(events).toContainEqual({ type: "region_unavailable", region: "Broken", code: "QLOO_HTTP", message: "boom" });
    expect(events.some((e) => e.type === "region_empty")).toBe(false);
    expect(events.at(-1)?.type).toBe("done");
  });

  const cityOf = (events: GatewayEvent[], name: string) => (events.filter((e) => e.type === "city_scored") as Array<{ city: { name: string; warnings: Array<Record<string, unknown>>; verdict: string } }>).map((e) => e.city).find((c) => c.name === name)!;

  it("attaches an error warning when a city brand recommend errors", async () => {
    const err: QlooEnvelope = { operation: "recommend", status: "error", summary: "x", error: { code: "QLOO_HTTP", retryable: false, recovery: "r" } };
    const events = await collect(runTourBoard(brief, { qloo: fakeQloo((t, a) => (t === "qloo_recommend" && a.target_type === "brand" ? err : happy(t, a))), cities: CITIES }));
    expect(cityOf(events, "Mexico City").warnings).toContainEqual(expect.objectContaining({ tool: "qloo_recommend", kind: "error", code: "QLOO_HTTP" }));
  });

  it("attaches partial warnings to cities", async () => {
    const partial: QlooEnvelope = { ...recs(["One", "Two"], [0.9, 0.7]), status: "partial", summary: "some failed" };
    const events = await collect(runTourBoard(brief, { qloo: fakeQloo((t, a) => (t === "qloo_recommend" && a.target_type === "brand" ? partial : happy(t, a))), cities: CITIES }));
    expect(cityOf(events, "Monterrey").warnings).toContainEqual(expect.objectContaining({ tool: "qloo_recommend", kind: "partial", message: "some failed" }));
  });

  it("attaches stale warnings from a stale regional heatmap to each derived city", async () => {
    const qloo: QlooCaller = { async call(tool, args) { const stale = tool === "qloo_where_popular" && args.within === "Mexico"; return { envelope: happy(tool, args), cacheKey: `${tool}-k`, cached: stale, stale }; } };
    const events = await collect(runTourBoard(brief, { qloo, cities: CITIES }));
    for (const n of ["Mexico City", "Monterrey"]) expect(cityOf(events, n).warnings).toContainEqual(expect.objectContaining({ tool: "qloo_where_popular", kind: "stale" }));
  });

  it("stops on BUDGET: emits cities scored so far, then error BUDGET, no done", async () => {
    const four: City[] = [
      { id: "a", name: "Alpha", country: "MX", lat: 19, lon: -99, population: 1_000_000 },
      { id: "b", name: "Bravo", country: "MX", lat: 22, lon: -102, population: 1_000_000 },
      { id: "c", name: "Charlie", country: "MX", lat: 25, lon: -105, population: 1_000_000 },
      { id: "d", name: "Delta", country: "MX", lat: 28, lon: -108, population: 1_000_000 },
    ];
    const heat: QlooEnvelope = { operation: "where_popular", status: "ok", results: four.map((c, i) => ({ location: { latitude: c.lat, longitude: c.lon }, query: { affinity: 0.9 - i * 0.1, popularity: 0.3 } })) };
    const budget: QlooEnvelope = { operation: "x", status: "error", summary: "session budget exhausted", error: { code: "BUDGET", retryable: false, recovery: "new session" } };
    const log: string[] = [];
    const qloo = fakeQloo((t, a) => {
      const where = String(a.within ?? a.filter_location ?? a.signal_location ?? "");
      if (t === "qloo_where_popular" && a.within === "Mexico") return heat;
      if (where.startsWith("Bravo") || where.startsWith("Charlie") || where.startsWith("Delta")) return budget;
      return happy(t, a);
    }, log);
    const events = await collect(runTourBoard(brief, { qloo, cities: four, concurrency: 1 }));
    const scored = events.filter((e) => e.type === "city_scored").map((e) => (e as { city: { name: string } }).city.name);
    expect(scored).toEqual(["Alpha"]);
    expect(events.at(-1)).toMatchObject({ type: "error", code: "BUDGET", message: "session budget exhausted" });
    expect(events.some((e) => e.type === "done")).toBe(false);
    expect(log.some((l) => l.includes("Charlie") || l.includes("Delta"))).toBe(false);
  });

  describe("batch streaming (concurrency 3, 4-city shortlist = two batches)", () => {
    const four: City[] = [
      { id: "a", name: "Alpha", country: "MX", lat: 19, lon: -99, population: 1_000_000 },
      { id: "b", name: "Bravo", country: "MX", lat: 22, lon: -102, population: 1_000_000 },
      { id: "c", name: "Charlie", country: "MX", lat: 25, lon: -105, population: 1_000_000 },
      { id: "d", name: "Delta", country: "MX", lat: 28, lon: -108, population: 1_000_000 },
    ];
    const heat: QlooEnvelope = { operation: "where_popular", status: "ok", results: four.map((c, i) => ({ location: { latitude: c.lat, longitude: c.lon }, query: { affinity: 0.9 - i * 0.1, popularity: 0.3 } })) };
    const budget: QlooEnvelope = { operation: "x", status: "error", summary: "Session limit reached", error: { code: "BUDGET", retryable: false, recovery: "new session" } };
    const fourRouter = (budgetOnSecondBatch: boolean) => (t: string, a: Record<string, unknown>): QlooEnvelope => {
      if (t === "qloo_where_popular" && a.within === "Mexico") return heat;
      if (budgetOnSecondBatch && String(a.within ?? a.filter_location ?? a.signal_location ?? "").startsWith("Delta")) return budget;
      return happy(t, a);
    };

    it("yields city_scored for the first batch before the second batch's tool calls", async () => {
      const events = await collect(runTourBoard(brief, { qloo: fakeQloo(fourRouter(false)), cities: four, concurrency: 3 }));
      const firstScored = events.findIndex((e) => e.type === "city_scored");
      const lastToolCall = events.map((e) => e.type).lastIndexOf("tool_call");
      expect(firstScored).toBeGreaterThan(-1);
      expect(firstScored).toBeLessThan(lastToolCall);
      expect(events.filter((e) => e.type === "city_scored")).toHaveLength(4);
      expect(events.at(-1)).toMatchObject({ type: "done", summary: { cities: 4 } });
    });

    it("never yields the same city twice when the budget stops the run", async () => {
      const events = await collect(runTourBoard(brief, { qloo: fakeQloo(fourRouter(true)), cities: four, concurrency: 3 }));
      const ids = events.filter((e) => e.type === "city_scored").map((e) => (e as { city: { id: string } }).city.id);
      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
      expect(events.at(-1)).toMatchObject({ type: "error", code: "BUDGET" });
      expect(events.some((e) => e.type === "done")).toBe(false);
    });
  });

  it("isolates a throwing city: INTERNAL warning, others scored, done", async () => {
    const qloo: QlooCaller = { async call(tool, args) {
      if (String(args.signal_location ?? args.filter_location ?? args.within ?? "").startsWith("Monterrey")) throw new Error("kaboom");
      return { envelope: happy(tool, args), cacheKey: `${tool}-k`, cached: false, stale: false };
    } };
    const events = await collect(runTourBoard(brief, { qloo, cities: CITIES }));
    const mty = cityOf(events, "Monterrey");
    expect(mty.verdict).toBe("insufficient_data");
    expect(mty.warnings).toContainEqual(expect.objectContaining({ tool: "pipeline", kind: "error", code: "INTERNAL", message: "kaboom" }));
    expect(cityOf(events, "Mexico City").verdict).not.toBe("insufficient_data");
    expect(events.at(-1)?.type).toBe("done");
  });

  it("attaches profile warnings for errored profile calls", async () => {
    const err: QlooEnvelope = { operation: "tags", status: "error", summary: "t", error: { code: "QLOO_HTTP", retryable: false, recovery: "r" } };
    const events = await collect(runTourBoard(brief, { qloo: fakeQloo((t, a) => (t === "qloo_entity_tags" ? err : happy(t, a))), cities: CITIES }));
    const prof = events.find((e) => e.type === "artist_profile") as { warnings: Array<Record<string, unknown>> };
    expect(prof.warnings).toContainEqual(expect.objectContaining({ tool: "qloo_entity_tags", kind: "error", code: "QLOO_HTTP" }));
  });
});
