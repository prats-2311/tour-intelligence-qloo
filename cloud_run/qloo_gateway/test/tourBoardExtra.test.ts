import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/http/app.js";
import type { City } from "../src/geo/cities.js";
import { runTourBoard, type TourBrief } from "../src/pipeline/tourBoard.js";
import type { QlooCaller } from "../src/qlooCall.js";
import type { GatewayEvent, QlooEnvelope } from "../src/types.js";
import { describeOk, recs } from "./fixtures/envelopes.js";

// Invented layout: three Mexican cities in Qloo's heat list, plus Puebla (extra, absent from the list) and Merida (extra, present in the list).
const A: City = { id: "m1", name: "Aldea", country: "MX", lat: 19.43, lon: -99.13, population: 9_000_000 };
const B: City = { id: "m2", name: "Bosque", country: "MX", lat: 25.68, lon: -100.31, population: 1_100_000 };
const C: City = { id: "m3", name: "Cumbre", country: "MX", lat: 20.67, lon: -103.35, population: 1_400_000 };
const PUEBLA: City = { id: "x1", name: "Puebla", country: "MX", lat: 19.04, lon: -98.2, population: 500_000 };
const MERIDA: City = { id: "x2", name: "Merida", country: "MX", lat: 20.97, lon: -89.62, population: 500_000 };
const ALL = [A, B, C, PUEBLA, MERIDA];

const heatOf = (cs: City[]): QlooEnvelope => ({ operation: "where_popular", status: "ok", results: cs.map((c, i) => ({ location: { latitude: c.lat, longitude: c.lon }, query: { affinity: 0.9 - i * 0.15, popularity: 0.5 } })) });
const around = (c: City): QlooEnvelope => ({ operation: "where_popular", status: "ok", results: [[0, 0, 0.8], [0.01, 0.01, 0.5], [-0.01, 0, 0.3]].map(([a, b, aff]) => ({ location: { latitude: c.lat + a!, longitude: c.lon + b! }, query: { affinity: aff, popularity: 0.3 } })) });

function fake(inHeat: City[], calls: Array<{ tool: string; args: Record<string, unknown> }> = []): QlooCaller {
  return {
    async call(tool, args) {
      calls.push({ tool, args });
      const env = ((): QlooEnvelope => {
        if (tool === "qloo_describe") return describeOk;
        if (tool === "qloo_where_popular") {
          const within = String(args.within);
          if (within === "Mexico") return heatOf(inHeat);
          return around(ALL.find((c) => within.startsWith(`${c.name},`))!);
        }
        if (tool === "qloo_recommend") return recs(["One", "Two", "Three"], [0.99, 0.98, 0.97]);
        return { operation: tool, status: "ok", results: [] };
      })();
      return { envelope: env, cacheKey: `${tool}:${calls.length}`, cached: false, stale: false };
    },
  };
}
async function collect(g: AsyncGenerator<GatewayEvent>) { const o: GatewayEvent[] = []; for await (const e of g) o.push(e); return o; }
type C = { id: string; candidateSource: string; fanHeatFloor?: boolean; fanHeat: { value: number | null; refs: unknown[] }; winnability: { value: number | null }; verdict: string };
const citiesOf = (events: GatewayEvent[]) => events.filter((e) => e.type === "city_scored").map((e) => (e as unknown as { city: C }).city);
const brief = (extra?: City[]): TourBrief => ({ artist: "Test Artist", regions: ["Mexico"], maxStops: 8, sessionId: "s", today: "2026-10-20", ...(extra ? { extraCities: extra } : {}) });

describe("extraCities (back-test only)", () => {
  it("scores an extra absent from the heat list like a seed: floor fan heat, labelled backtest_extra, same activation path", async () => {
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const events = await collect(runTourBoard(brief([PUEBLA]), { qloo: fake([A, B, C], calls), cities: ALL }));
    const cs = citiesOf(events);
    const x = cs.find((c) => c.id === "x1")!;
    expect(x).toMatchObject({ candidateSource: "backtest_extra", fanHeatFloor: true });
    expect(x.fanHeat.value).toBe(Math.min(...cs.filter((c) => c.candidateSource === "heat").map((c) => c.fanHeat.value!)));
    expect(x.fanHeat.refs).toEqual([]);
    expect(x.winnability.value).not.toBeNull(); // location check + activation ran
    expect(["play", "hidden_goldmine"]).not.toContain(x.verdict); // a floored city never earns a headline verdict
    expect(calls.some((c) => c.tool === "qloo_where_popular" && String(c.args.within).startsWith("Puebla,"))).toBe(true);
    expect(cs.filter((c) => c.candidateSource === "heat").map((c) => c.id).sort()).toEqual(["m1", "m2", "m3"]);
  });

  it("an extra already in Qloo's heat pool keeps its real fan heat (no floor flag) but is still labelled backtest_extra", async () => {
    // 9 metros in the pool: the 8-city shortlist leaves one out; that one is passed as an extra.
    const filler: City[] = Array.from({ length: 8 }, (_, i) => ({ id: `f${i}`, name: `Filler${i}`, country: "MX", lat: 10 + i * 3, lon: -100, population: 200_000 }));
    const all = [...ALL, ...filler];
    const withFiller = (extra?: City[]) => runTourBoard(brief(extra), { qloo: { async call(tool, args) {
      const env = tool === "qloo_where_popular" && args.within === "Mexico" ? heatOf([...filler, MERIDA])
        : tool === "qloo_where_popular" ? around(all.find((c) => String(args.within).startsWith(`${c.name},`))!) : (await fake([]).call(tool, args, "s")).envelope;
      return { envelope: env, cacheKey: "k", cached: false, stale: false };
    } }, cities: all });
    const base = citiesOf(await collect(withFiller()));
    expect(base.map((c) => c.id)).not.toContain("x2"); // skipped by the shortlist
    const cs = citiesOf(await collect(withFiller([MERIDA])));
    const x = cs.find((c) => c.id === "x2")!;
    expect(x.candidateSource).toBe("backtest_extra");
    expect(x.fanHeatFloor).toBeUndefined();
    expect(x.fanHeat.refs.length).toBeGreaterThan(0);
  });

  it("changes nothing without extraCities, and a repeated city is scored once", async () => {
    const plain = citiesOf(await collect(runTourBoard(brief(), { qloo: fake([A, B, C]), cities: ALL })));
    expect(plain.some((c) => c.candidateSource === "backtest_extra")).toBe(false);
    const dup = citiesOf(await collect(runTourBoard(brief([A, PUEBLA, PUEBLA]), { qloo: fake([A, B, C]), cities: ALL })));
    expect(dup.filter((c) => c.id === "x1")).toHaveLength(1);
    expect(dup.find((c) => c.id === "m1")!.candidateSource).toBe("heat"); // already on the board
  });

  it("the live route ignores extraCities in the request body", async () => {
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const app = createApp({ qloo: fake([A, B, C], calls), cities: ALL, health: async () => ({ connected: true, ready: true }) });
    const res = await request(app).post("/v1/tour-board").set("x-session-id", "s")
      .send({ artist: "Test Artist", regions: ["Mexico"], maxStops: 8, extraCities: [PUEBLA] });
    expect(res.status).toBe(200);
    expect(res.text).toContain("event: done");
    expect(res.text).not.toContain("backtest_extra");
    expect(res.text).not.toContain("Puebla");
    expect(calls.some((c) => String(c.args.within).startsWith("Puebla"))).toBe(false);
  });
});
