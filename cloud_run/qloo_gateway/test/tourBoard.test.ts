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
    expect(events[0]).toMatchObject({ type: "resolve", entity: { entityId: "A1", name: "Test Artist" } });
    expect(events.some((e) => e.type === "artist_profile")).toBe(true);
    const scored = events.filter((e) => e.type === "city_scored");
    expect(scored.map((e) => (e as { city: { name: string } }).city.name)).toEqual(["Mexico City", "Monterrey"]);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("stops with needs_input for ambiguous artists (Review Focus 1)", async () => {
    const events = await collect(runTourBoard({ ...brief, artist: "Pedro" }, { qloo: fakeQloo((t) => (t === "qloo_describe" ? describeAmbiguous : happy(t, {}))), cities: CITIES }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "needs_input", candidates: [{ id: "P1" }, { id: "P2" }] });
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
});
