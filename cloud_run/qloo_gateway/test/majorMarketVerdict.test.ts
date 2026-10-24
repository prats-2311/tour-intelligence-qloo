import { describe, expect, it, vi } from "vitest";

// Every threshold is open, so any city with scores would be "play": the only thing that can stop a floored seed is the cap.
vi.mock("../src/scoring/calibration.js", async () => {
  const { DEFAULT_SCORING } = await import("../src/scoring/config.js");
  return { SCORING: { ...DEFAULT_SCORING, thresholds: { ...DEFAULT_SCORING.thresholds, playFan: 0, playAct: 0 } } };
});

import type { City } from "../src/geo/cities.js";
import { runTourBoard } from "../src/pipeline/tourBoard.js";
import type { QlooCaller } from "../src/qlooCall.js";
import type { GatewayEvent, QlooEnvelope } from "../src/types.js";
import { describeOk, recs } from "./fixtures/envelopes.js";

const BIG: City = { id: "m1", name: "Mexico City", country: "MX", lat: 19.43, lon: -99.13, population: 9_000_000 };
const A: City = { id: "m2", name: "Monterrey", country: "MX", lat: 25.68, lon: -100.31, population: 1_100_000 };
const B: City = { id: "m3", name: "Guadalajara", country: "MX", lat: 20.67, lon: -103.35, population: 1_400_000 };
const ALL = [BIG, A, B];
const pts = (cs: City[]): QlooEnvelope => ({ operation: "where_popular", status: "ok", results: cs.map((c, i) => ({ location: { latitude: c.lat, longitude: c.lon }, query: { affinity: 0.9 - i * 0.3, popularity: 0.6 - i * 0.2 } })) });
const place = (c: City) => ({ entity_id: "00000000-v", name: "Hall", subtype: "urn:entity:place", affinity: 0.9, popularity: 0.5, properties: { geocode: { city: c.name, country_code: c.country } } });
const qloo: QlooCaller = {
  async call(tool, args) {
    const env = ((): QlooEnvelope => {
      if (tool === "qloo_describe") return describeOk;
      if (tool === "qloo_where_popular") {
        if (args.within === "Mexico") return pts([A, B]);
        const c = ALL.find((x) => String(args.within).startsWith(`${x.name},`))!;
        return { operation: "where_popular", status: "ok", results: [[0, 0, 0.8], [0.01, 0.01, 0.5], [-0.01, 0, 0.3]].map(([a, b, aff]) => ({ location: { latitude: c.lat + a!, longitude: c.lon + b! }, query: { affinity: aff!, popularity: 0.3 } })) };
      }
      if (tool === "qloo_recommend") return args.target_type === "place" ? ({ operation: "recommend", status: "ok", results: [place(ALL.find((x) => String(args.filter_location).startsWith(`${x.name},`))!)] } as QlooEnvelope) : recs(["One", "Two", "Three"], [0.99, 0.98, 0.97]);
      if (tool === "qloo_rank") return recs(["Hall"], [0.99]);
      return { operation: tool, status: "ok", results: [] };
    })();
    return { envelope: env, cacheKey: `${tool}:${JSON.stringify(args)}`, cached: false, stale: false };
  },
};

describe("a floored major market is capped at Consider", () => {
  it("heat candidates keep play; the seed with no Qloo fan-heat evidence becomes consider", async () => {
    const out: GatewayEvent[] = [];
    for await (const e of runTourBoard({ artist: "Test Artist", regions: ["Mexico"], maxStops: 8, sessionId: "s", today: "2026-10-20" }, { qloo, cities: ALL })) out.push(e);
    const cs = out.filter((e) => e.type === "city_scored").map((e) => (e as unknown as { city: { id: string; verdict: string; candidateSource: string } }).city);
    expect(cs.filter((c) => c.candidateSource === "heat").map((c) => c.verdict)).toEqual(["play", "play"]);
    expect(cs.find((c) => c.id === "m1")).toMatchObject({ candidateSource: "major_market", verdict: "consider" });
  });
});
