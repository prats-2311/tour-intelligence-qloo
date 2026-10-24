import { describe, expect, it } from "vitest";
import type { City } from "../src/geo/cities.js";
import { runCityPlaybook } from "../src/pipeline/cityPlaybook.js";
import { runTourBoard, type TourBrief } from "../src/pipeline/tourBoard.js";
import type { QlooCaller } from "../src/qlooCall.js";
import type { GatewayEvent, QlooEnvelope } from "../src/types.js";
import { describeOk, recs } from "./fixtures/envelopes.js";

// Invented coordinates only. The "wrong" points sit in a different metro, as in the Ciudad Juarez finding.
const JUAREZ: City = { id: "7", name: "Ciudad Juarez", country: "MX", lat: 31.72, lon: -106.46, population: 1_300_000 };
const CITIES: City[] = [JUAREZ];
const heat = (pts: Array<[number, number]>): QlooEnvelope => ({ operation: "where_popular", status: "ok", results: pts.map(([latitude, longitude], i) => ({ location: { latitude, longitude }, query: { affinity: 0.8 - i * 0.1, popularity: 0.3 } })) });
const WRONG = heat([[19.36, -99.16], [19.361, -99.161], [19.362, -99.162], [19.363, -99.163]]);
const RIGHT = heat([[31.72, -106.46], [31.74, -106.44], [31.70, -106.5], [31.76, -106.4]]);
const REGION = heat([[31.72, -106.46], [31.73, -106.47]]);
const brief: TourBrief = { artist: "Test Artist", regions: ["Mexico"], maxStops: 8, sessionId: "s", today: "2026-10-20" };

type Call = { tool: string; args: Record<string, unknown> };
function fake(inCity: (within: string) => QlooEnvelope, calls: Call[] = []): QlooCaller {
  return {
    async call(tool, args) {
      calls.push({ tool, args });
      const env = ((): QlooEnvelope => {
        if (tool === "qloo_describe") return describeOk;
        if (tool === "qloo_where_popular") return args.within === "Mexico" ? REGION : inCity(String(args.within));
        if (tool === "qloo_recommend") return recs(["One", "Two", "Three"], [0.9, 0.8, 0.7]);
        if (tool === "qloo_rank") return recs(["Venue A", "Venue B"], [0.9, 0.8]);
        return { operation: tool, status: "ok", results: [] };
      })();
      return { envelope: env, cacheKey: `${tool}:${calls.length}`, cached: false, stale: false };
    },
  };
}
async function collect(g: AsyncGenerator<GatewayEvent>) { const o: GatewayEvent[] = []; for await (const e of g) o.push(e); return o; }
type Scored = { city: { verdict: string; closeCall: boolean; zones: Array<{ label: string }>; warnings: Array<{ code?: string }>; activation: { value: number | null }; fanHeat: { value: number | null }; winnability: { value: number | null }; insufficientReason?: string; locationAttempts?: number; locationQuery?: string } };
const scoredOf = (events: GatewayEvent[]) => events.find((e) => e.type === "city_scored") as Scored;
const inCityCalls = (calls: Call[]) => calls.filter((c) => c.tool === "qloo_where_popular" && c.args.within !== "Mexico");
const whereOf = (calls: Call[]) => [...new Set(calls.filter((c) => c.tool === "qloo_recommend" || c.tool === "qloo_rank").map((c) => String(c.args.signal_location ?? c.args.filter_location)))];

describe("Tour Board location resolution", () => {
  it("a correct first string costs one in-city call and keeps the original args byte-identical", async () => {
    const calls: Call[] = [];
    const events = await collect(runTourBoard(brief, { qloo: fake(() => RIGHT, calls), cities: CITIES }));
    expect(inCityCalls(calls)).toEqual([{ tool: "qloo_where_popular", args: { entity: "A1", entity_type: "artist", within: "Ciudad Juarez, MX", limit: 20 } }]);
    expect(whereOf(calls)).toEqual(["Ciudad Juarez, MX"]);
    expect(scoredOf(events).city).toMatchObject({ locationQuery: "Ciudad Juarez, MX", locationAttempts: 1 });
  });

  it("runs the in-city lookup before the city's other calls", async () => {
    const calls: Call[] = [];
    await collect(runTourBoard(brief, { qloo: fake(() => RIGHT, calls), cities: CITIES }));
    const firstInCity = calls.findIndex((c) => c.tool === "qloo_where_popular" && c.args.within === "Ciudad Juarez, MX");
    const firstOther = calls.findIndex((c) => c.tool === "qloo_recommend");
    expect(firstInCity).toBeGreaterThan(-1);
    expect(firstInCity).toBeLessThan(firstOther);
  });

  it("falls through to the spelled-out country when the first string resolves elsewhere, and uses it for every call", async () => {
    const calls: Call[] = [];
    const events = await collect(runTourBoard(brief, { qloo: fake((w) => (w === "Ciudad Juarez, MX" ? WRONG : RIGHT), calls), cities: CITIES }));
    expect(inCityCalls(calls).map((c) => c.args.within)).toEqual(["Ciudad Juarez, MX", "Ciudad Juarez, Mexico"]);
    expect(whereOf(calls)).toEqual(["Ciudad Juarez, Mexico"]);
    const { city } = scoredOf(events);
    expect(city).toMatchObject({ locationQuery: "Ciudad Juarez, Mexico", locationAttempts: 2 });
    expect(city.zones.length).toBeGreaterThan(0);
    expect(city.verdict).not.toBe("insufficient_data");
  });

  it("an unresolved city is insufficient_data with a machine-readable reason, no activation calls and no zones", async () => {
    const calls: Call[] = [];
    const events = await collect(runTourBoard(brief, { qloo: fake(() => WRONG, calls), cities: CITIES }));
    const { city } = scoredOf(events);
    expect(city).toMatchObject({ verdict: "insufficient_data", insufficientReason: "location_unresolved", locationAttempts: 2, closeCall: false, zones: [] });
    expect(city.activation.value).toBeNull();
    expect(city.winnability.value).toBeNull();
    expect(city.fanHeat.value).not.toBeNull(); // the region-level heat is real; only the city-level read is withheld
    expect(city.warnings.some((w) => w.code === "LOCATION_UNRESOLVED")).toBe(true);
    expect(calls.filter((c) => c.tool === "qloo_recommend" || c.tool === "qloo_rank")).toEqual([]);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("a Qloo error on the lookup does not mark the city unresolved: one attempt, legacy string, as before", async () => {
    const calls: Call[] = [];
    const down: QlooEnvelope = { operation: "where_popular", status: "error", results: [], error: { code: "UPSTREAM", retryable: true, recovery: "later" } };
    const events = await collect(runTourBoard(brief, { qloo: fake(() => down, calls), cities: CITIES }));
    expect(inCityCalls(calls)).toHaveLength(1);
    expect(scoredOf(events).city).not.toHaveProperty("insufficientReason");
    expect(whereOf(calls)).toEqual(["Ciudad Juarez, MX"]);
  });
});

describe("City Playbook location resolution", () => {
  const input = { artist: "Test Artist", artistEntityId: "A1", city: { name: "Ciudad Juarez", country: "MX" }, sessionId: "s" };

  it("uses the first string that passes for every call and the zones", async () => {
    const calls: Call[] = [];
    const events = await collect(runCityPlaybook(input, { qloo: fake((w) => (w === "Ciudad Juarez, MX" ? WRONG : RIGHT), calls), cities: CITIES }));
    expect(inCityCalls(calls).map((c) => c.args.within)).toEqual(["Ciudad Juarez, MX", "Ciudad Juarez, Mexico"]);
    expect(whereOf(calls)).toEqual(["Ciudad Juarez, Mexico"]);
    expect(events.find((e) => e.type === "playbook")).toBeDefined();
    expect(events.at(-1)?.type).toBe("done");
  });

  it("answers LOCATION_UNRESOLVED instead of building cards from another city's data", async () => {
    const calls: Call[] = [];
    const events = await collect(runCityPlaybook(input, { qloo: fake(() => WRONG, calls), cities: CITIES }));
    expect(events.find((e) => e.type === "playbook")).toBeUndefined();
    expect(events.at(-1)).toMatchObject({ type: "error", code: "LOCATION_UNRESOLVED" });
    expect(calls.filter((c) => c.tool !== "qloo_where_popular")).toEqual([]);
  });

  it("a city missing from the city list cannot be checked and keeps the original single-string behaviour", async () => {
    const calls: Call[] = [];
    const events = await collect(runCityPlaybook({ ...input, city: { name: "Elsewhere", country: "MX" } }, { qloo: fake(() => WRONG, calls), cities: CITIES }));
    expect(inCityCalls(calls)).toHaveLength(1);
    expect(events.find((e) => e.type === "playbook")).toBeDefined();
  });
});
