import { describe, expect, it, vi } from "vitest";

// A config under which a city with all-zero affinities has only two weighted components (rule 8).
vi.mock("../src/scoring/calibration.js", async () => {
  const { DEFAULT_SCORING } = await import("../src/scoring/config.js");
  return { SCORING: { ...DEFAULT_SCORING, version: "thin-test", affinityFloors: { sponsor_fit: 0.9, local_hooks: 0.9, venue_fit: 0.9 }, weights: { ...DEFAULT_SCORING.weights, fan_concentration: 0, venue_fit: 0 } } };
});

import type { City } from "../src/geo/cities.js";
import { runTourBoard, type TourBrief } from "../src/pipeline/tourBoard.js";
import type { QlooCaller } from "../src/qlooCall.js";
import type { GatewayEvent, QlooEnvelope } from "../src/types.js";
import { cityHeat, describeOk, heatMexico, recs } from "./fixtures/envelopes.js";

const CITIES: City[] = [{ id: "1", name: "Mexico City", country: "MX", lat: 19.4326, lon: -99.1332, population: 9_000_000 }];
const brief: TourBrief = { artist: "Test Artist", regions: ["Mexico"], maxStops: 8, sessionId: "s", today: "2026-10-20" };
const fake = (route: (tool: string, args: Record<string, unknown>) => QlooEnvelope): QlooCaller => ({ async call(tool, args) { return { envelope: route(tool, args), cacheKey: tool, cached: false, stale: false }; } });
async function collect(gen: AsyncGenerator<GatewayEvent>) { const out: GatewayEvent[] = []; for await (const e of gen) out.push(e); return out; }
const route = (affinity: number) => (tool: string, args: Record<string, unknown>): QlooEnvelope => {
  if (tool === "qloo_describe") return describeOk;
  if (tool === "qloo_where_popular") return args.within === "Mexico" ? heatMexico : cityHeat;
  if (tool === "qloo_recommend") return recs(["One", "Two"], [affinity, affinity]);
  if (tool === "qloo_rank") return recs(["Venue A"], [affinity]);
  return { operation: tool, status: "ok", results: [] };
};
const first = async (affinity: number) => (await collect(runTourBoard(brief, { qloo: fake(route(affinity)), cities: CITIES }))).find((e) => e.type === "city_scored") as { city: { verdict: string; closeCall: boolean; activation: { value: number | null; reason?: string } } };

describe("runTourBoard thin data (rule 8)", () => {
  it("a thin city is insufficient_data, never 0, and is not a close call", async () => {
    const { city } = await first(0.5); // below the 0.9 floor -> adjusted 0 for both weighted components
    expect(city.activation.value).toBeNull();
    expect(city.activation.reason).toBe("insufficient_data");
    expect(city.verdict).toBe("insufficient_data");
    expect(city.closeCall).toBe(false);
  });
  it("the same city with real signal is scored", async () => {
    const { city } = await first(0.95);
    expect(city.activation.value).toBeGreaterThan(0);
    expect(city.verdict).not.toBe("insufficient_data");
  });
});
