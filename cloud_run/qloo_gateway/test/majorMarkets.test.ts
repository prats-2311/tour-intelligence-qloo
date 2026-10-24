import { describe, expect, it } from "vitest";
import type { City } from "../src/geo/cities.js";
import { majorMarkets } from "../src/pipeline/majorMarkets.js";
import { runTourBoard, type TourBrief } from "../src/pipeline/tourBoard.js";
import type { QlooCaller } from "../src/qlooCall.js";
import type { GatewayEvent, QlooEnvelope } from "../src/types.js";
import { describeOk, recs } from "./fixtures/envelopes.js";

// Invented layout: Mexico has Mexico City (largest), Monterrey and Guadalajara; Brazil has Sao Paulo (largest) and Curitiba; the US has New York City (largest) and Austin.
const MX_BIG: City = { id: "m1", name: "Mexico City", country: "MX", lat: 19.43, lon: -99.13, population: 9_000_000 };
const MX_2: City = { id: "m2", name: "Monterrey", country: "MX", lat: 25.68, lon: -100.31, population: 1_100_000 };
const MX_3: City = { id: "m3", name: "Guadalajara", country: "MX", lat: 20.67, lon: -103.35, population: 1_400_000 };
const BR_BIG: City = { id: "b1", name: "Sao Paulo", country: "BR", lat: -23.55, lon: -46.63, population: 12_000_000 };
const BR_2: City = { id: "b2", name: "Curitiba", country: "BR", lat: -25.43, lon: -49.27, population: 1_900_000 };
const US_BIG: City = { id: "u1", name: "New York City", country: "US", lat: 40.71, lon: -74.0, population: 8_800_000 };
const US_2: City = { id: "u2", name: "Austin", country: "US", lat: 30.27, lon: -97.74, population: 960_000 };
const CA_BIG: City = { id: "c1", name: "Toronto", country: "CA", lat: 43.65, lon: -79.38, population: 2_700_000 };
const CA_2: City = { id: "c2", name: "Montreal", country: "CA", lat: 45.5, lon: -73.57, population: 1_700_000 };
const ALL = [MX_BIG, MX_2, MX_3, BR_BIG, BR_2, US_BIG, US_2, CA_BIG, CA_2];

const heatOf = (cs: City[]): QlooEnvelope => ({ operation: "where_popular", status: "ok", results: cs.map((c, i) => ({ location: { latitude: c.lat, longitude: c.lon }, query: { affinity: 0.9 - i * 0.2, popularity: 0.6 - i * 0.1 } })) });
const around = (c: City): QlooEnvelope => ({ operation: "where_popular", status: "ok", results: [[0, 0, 0.8], [0.01, 0.01, 0.5], [-0.01, 0, 0.3]].map(([a, b, aff]) => ({ location: { latitude: c.lat + a!, longitude: c.lon + b! }, query: { affinity: aff!, popularity: 0.3 } })) });
const place = (c: City): Record<string, unknown> => ({ entity_id: `00000000-v-${c.id}`, name: `Hall ${c.name}`, subtype: "urn:entity:place", affinity: 0.9, popularity: 0.5, properties: { geocode: { city: c.name, country_code: c.country } } });

type Call = { tool: string; args: Record<string, unknown> };
function fake(regionHeat: Record<string, City[]>, opts: { misplaced?: Set<string>; calls?: Call[] } = {}): QlooCaller {
  const calls = opts.calls ?? [];
  return {
    async call(tool, args) {
      calls.push({ tool, args });
      const env = ((): QlooEnvelope => {
        if (tool === "qloo_describe") return describeOk;
        if (tool === "qloo_where_popular") {
          const within = String(args.within);
          if (within in regionHeat) return regionHeat[within]!.length ? heatOf(regionHeat[within]!) : { operation: "where_popular", status: "empty", results: [] };
          const city = ALL.find((c) => within.startsWith(`${c.name},`))!;
          if (opts.misplaced?.has(city.name)) return around({ ...city, lat: 0, lon: 0 });
          return around(city);
        }
        if (tool === "qloo_recommend") {
          if (args.target_type === "place") { const city = ALL.find((c) => String(args.filter_location).startsWith(`${c.name},`))!; return { operation: "recommend", status: "ok", results: [place(city)] } as QlooEnvelope; }
          return recs(["One", "Two", "Three"], [0.9, 0.8, 0.7]);
        }
        if (tool === "qloo_rank") return recs(["Hall"], [0.8]);
        return { operation: tool, status: "ok", results: [] };
      })();
      return { envelope: env, cacheKey: `${tool}:${calls.length}`, cached: false, stale: false };
    },
  };
}
async function collect(g: AsyncGenerator<GatewayEvent>) { const o: GatewayEvent[] = []; for await (const e of g) o.push(e); return o; }
type C = { id: string; name: string; candidateSource?: string; fanHeatFloor?: boolean; fanHeat: { value: number | null; refs: unknown[] }; verdict: string; insufficientReason?: string };
const citiesOf = (events: GatewayEvent[]) => events.filter((e) => e.type === "city_scored").map((e) => (e as unknown as { city: C }).city);
const brief = (regions: string[], maxStops = 8): TourBrief => ({ artist: "Test Artist", regions, maxStops, sessionId: "s", today: "2026-10-20" });

describe("major markets", () => {
  it("adds the country's largest city when Qloo's heat list lacks it, labelled and at the board's fan-heat floor", async () => {
    const events = await collect(runTourBoard(brief(["Mexico"]), { qloo: fake({ Mexico: [MX_2, MX_3] }), cities: ALL }));
    const cs = citiesOf(events);
    const seed = cs.find((c) => c.id === "m1")!;
    expect(seed).toMatchObject({ candidateSource: "major_market", fanHeatFloor: true });
    const heatCs = cs.filter((c) => c.candidateSource === "heat");
    expect(heatCs.map((c) => c.id).sort()).toEqual(["m2", "m3"]);
    expect(heatCs.every((c) => c.fanHeatFloor === undefined)).toBe(true);
    expect(seed.fanHeat.value).toBe(Math.min(...heatCs.map((c) => c.fanHeat.value!)));
    expect(seed.fanHeat.refs).toEqual([]);
    expect(seed.verdict).not.toBe("insufficient_data"); // normal activation path
  });

  it("a seed already in the heat pool appears once, as a heat candidate", async () => {
    const events = await collect(runTourBoard(brief(["Mexico"]), { qloo: fake({ Mexico: [MX_BIG, MX_2] }), cities: ALL }));
    const cs = citiesOf(events);
    expect(cs.filter((c) => c.id === "m1")).toHaveLength(1);
    expect(cs.find((c) => c.id === "m1")).toMatchObject({ candidateSource: "heat" });
    expect(cs.find((c) => c.id === "m1")!.fanHeatFloor).toBeUndefined();
    expect(cs.filter((c) => c.candidateSource === "major_market")).toEqual([]);
  });

  it("a pool seed that the shortlist would skip is still checked, as a heat candidate", async () => {
    // Nine metros in the heat list and maxStops 1: the shortlist is 8, so the least-hot ninth (New York City) would be left out.
    const filler: City[] = Array.from({ length: 8 }, (_, i) => ({ id: `f${i}`, name: `Filler${i}`, country: "US", lat: 10 + i * 3, lon: -100, population: 200_000 }));
    const events = await collect(runTourBoard(brief(["United States"]), { qloo: fake({ "United States": [...filler, US_BIG] }), cities: [...ALL, ...filler] }));
    const ny = citiesOf(events).find((c) => c.id === "u1")!;
    expect(ny.candidateSource).toBe("heat");
    expect(ny.fanHeatFloor).toBeUndefined();
    expect(ny.fanHeat.refs.length).toBeGreaterThan(0);
  });

  it("a region that is not a country gets no seed", async () => {
    const events = await collect(runTourBoard(brief(["Texas, United States"]), { qloo: fake({ "Texas, United States": [US_2] }), cities: ALL }));
    expect(citiesOf(events).map((c) => c.id)).toEqual(["u2"]);
    const events2 = await collect(runTourBoard(brief(["Texas"]), { qloo: fake({ Texas: [US_2] }), cities: ALL }));
    expect(citiesOf(events2).map((c) => c.id)).toEqual(["u2"]);
  });

  it("seeds at most one per region and three per board (the fourth country's largest city is absent from its heat list and stays out)", async () => {
    const heat = { Mexico: [MX_2], Brazil: [BR_2], "United States": [US_2], Canada: [CA_2] };
    const events = await collect(runTourBoard(brief(["Mexico", "Brazil", "United States", "Canada"]), { qloo: fake(heat), cities: ALL }));
    const cs = citiesOf(events);
    expect(cs.filter((c) => c.candidateSource === "major_market").map((c) => c.id).sort()).toEqual(["b1", "m1", "u1"]);
    expect(cs.map((c) => c.id)).not.toContain("c1");
  });

  it("majorMarkets(): one per country region, brief order, at most 3; states and cities get none", () => {
    expect(majorMarkets(["Mexico", "Brazil", "United States", "Canada"], ALL).map((c) => c.id)).toEqual(["m1", "b1", "u1"]);
    expect(majorMarkets(["Mexico", "mexico", "Texas", "Texas, United States", "Monterrey"], ALL).map((c) => c.id)).toEqual(["m1"]);
    expect(majorMarkets([], ALL)).toEqual([]);
  });

  it("two regions of one country seed its largest city once", async () => {
    const events = await collect(runTourBoard(brief(["Mexico", "mexico"]), { qloo: fake({ Mexico: [MX_2], mexico: [MX_3] }), cities: ALL }));
    expect(citiesOf(events).filter((c) => c.id === "m1")).toHaveLength(1);
  });

  it("a seed Qloo cannot place is insufficient_data, still labelled a major market and never scored", async () => {
    const events = await collect(runTourBoard(brief(["Mexico"]), { qloo: fake({ Mexico: [MX_2, MX_3] }, { misplaced: new Set(["Mexico City"]) }), cities: ALL }));
    expect(citiesOf(events).find((c) => c.id === "m1")).toMatchObject({ candidateSource: "major_market", verdict: "insufficient_data", insufficientReason: "location_unresolved" });
  });

  it("with no heat candidates at all there is no floor and no seed", async () => {
    const events = await collect(runTourBoard(brief(["Mexico"]), { qloo: fake({ Mexico: [] }), cities: ALL }));
    expect(citiesOf(events)).toEqual([]);
    expect(events.at(-1)?.type).toBe("done");
  });
});
