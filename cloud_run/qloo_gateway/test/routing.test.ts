import request from "supertest";
import { describe, expect, it } from "vitest";
import { BudgetGuard, SESSION_QLOO_BUDGET } from "../src/budget.js";
import { MemoryCache } from "../src/cache.js";
import type { City } from "../src/geo/cities.js";
import { createApp } from "../src/http/app.js";
import { MAX_ROUTING_CITIES, resolveRouting } from "../src/pipeline/routing.js";
import { runCityPlaybook } from "../src/pipeline/cityPlaybook.js";
import { runTourBoard, type TourBrief } from "../src/pipeline/tourBoard.js";
import { createQlooCaller, type QlooCaller } from "../src/qlooCall.js";
import type { GatewayEvent, QlooEnvelope } from "../src/types.js";
import { describeOk, recs } from "./fixtures/envelopes.js";

// Invented layout. Two countries (MX, US); Springfield exists in both; Aldea is the biggest MX city, Bosque is in the heat list, Cumbre is not.
const A: City = { id: "m1", name: "Aldea", country: "MX", lat: 19.43, lon: -99.13, population: 9_000_000 };
const B: City = { id: "m2", name: "Bosque", country: "MX", lat: 25.68, lon: -100.31, population: 1_100_000 };
const C: City = { id: "m3", name: "Cumbre", country: "MX", lat: 20.67, lon: -103.35, population: 1_400_000 };
const Q: City = { id: "m4", name: "Quérétaro Nuevo", country: "MX", lat: 20.59, lon: -100.39, population: 800_000 };
const U1: City = { id: "u1", name: "Río Claro", country: "US", lat: 45.52, lon: -122.68, population: 650_000 };
const U2: City = { id: "u2", name: "Pradera", country: "US", lat: 43.62, lon: -116.2, population: 300_000 };
const S_MX: City = { id: "s1", name: "Springfield", country: "MX", lat: 22.0, lon: -101.0, population: 100_000 };
const S_US: City = { id: "s2", name: "Springfield", country: "US", lat: 39.8, lon: -89.6, population: 110_000 };
const ALL = [A, B, C, Q, U1, U2, S_MX, S_US];
const FULL: Record<string, string> = { MX: "Mexico", US: "United States" };

const heatOf = (cs: City[]): QlooEnvelope => ({ operation: "where_popular", status: "ok", results: cs.map((c, i) => ({ location: { latitude: c.lat, longitude: c.lon }, query: { affinity: 0.9 - i * 0.15, popularity: 0.5 } })) });
const around = (c: City): QlooEnvelope => ({ operation: "where_popular", status: "ok", results: [[0, 0, 0.8], [0.01, 0.01, 0.5], [-0.01, 0, 0.3]].map(([a, b, aff]) => ({ location: { latitude: c.lat + a!, longitude: c.lon + b! }, query: { affinity: aff, popularity: 0.3 } })) });
const placeOf = (where: string, world: City[] = ALL) => world.find((c) => where.startsWith(`${c.name},`));

type Call = { tool: string; args: Record<string, unknown> };
function fake(heat: Record<string, City[]>, calls: Call[] = [], opts: { misplaced?: Set<string>; world?: City[] } = {}): QlooCaller {
  return {
    async call(tool, args) {
      calls.push({ tool, args });
      const env = ((): QlooEnvelope => {
        if (tool === "qloo_describe") return describeOk;
        if (tool === "qloo_where_popular") {
          const within = String(args.within);
          if (heat[within]) return heatOf(heat[within]!);
          if (opts.misplaced?.has(within)) return around({ ...A, lat: 0, lon: 0 });
          const c = placeOf(within, opts.world);
          return c ? around(c) : { operation: "where_popular", status: "empty", results: [] };
        }
        if (tool === "qloo_recommend") return recs(["One", "Two", "Three"], [0.99, 0.98, 0.97]);
        return { operation: tool, status: "ok", results: [] };
      })();
      return { envelope: env, cacheKey: `${tool}:${calls.length}`, cached: false, stale: false };
    },
  };
}
async function collect(g: AsyncGenerator<GatewayEvent>) { const o: GatewayEvent[] = []; for await (const e of g) o.push(e); return o; }
type SC = { id: string; name: string; candidateSource: string; fanHeatFloor?: boolean; fanHeat: { value: number | null }; verdict: string; insufficientReason?: string; warnings: Array<{ code?: string }> };
const citiesOf = (events: GatewayEvent[]) => events.filter((e) => e.type === "city_scored").map((e) => (e as unknown as { city: SC }).city);
const brief = (routing: Array<{ name: string; country?: string }>, regions: string[] = []): TourBrief => ({ artist: "Test Artist", regions, maxStops: 8, sessionId: "s", today: "2026-10-20", routing });

describe("resolveRouting (findCity with default regions)", () => {
  it("tries the brief's regions in order when no country is given", () => {
    const r = resolveRouting([{ name: "Springfield" }], ["United States", "Mexico"], ALL);
    expect(r.matched.map((c) => c.id)).toEqual(["s2"]);
    expect(resolveRouting([{ name: "Springfield" }], ["Mexico", "United States"], ALL).matched.map((c) => c.id)).toEqual(["s1"]);
  });
  it("skips regions that are not countries and falls to the next one that has the city", () => {
    expect(resolveRouting([{ name: "Pradera" }], ["Somewhere State", "Mexico", "United States"], ALL).matched.map((c) => c.id)).toEqual(["u2"]);
  });
  it("with no regions, the name alone if unambiguous, else unmatched", () => {
    const r = resolveRouting([{ name: "Cumbre" }, { name: "Springfield" }], [], ALL);
    expect(r.matched.map((c) => c.id)).toEqual(["m3"]);
    expect(r.unmatched).toEqual(["Springfield"]);
  });
  it("an explicit country (ISO-2 or English name, accent and case insensitive) wins over regions", () => {
    const r = resolveRouting([{ name: "springfield", country: "us" }, { name: "RIO CLARO", country: "United States" }, { name: "Queretaro Nuevo", country: "mx" }], ["Mexico"], ALL);
    expect(r.matched.map((c) => c.id)).toEqual(["s2", "u1", "m4"]);
    expect(r.unmatched).toEqual([]);
  });
  it("lists unmatched names back as pasted (with the country if given), de-duplicates, and caps at 8", () => {
    const r = resolveRouting([{ name: "Atlantis" }, { name: "Nowhere", country: "MX" }, { name: "Aldea", country: "MX" }, { name: "aldea", country: "Mexico" }], ["Mexico"], ALL);
    expect(r.matched.map((c) => c.id)).toEqual(["m1"]);
    expect(r.unmatched).toEqual(["Atlantis", "Nowhere, MX"]);
    const many = Array.from({ length: 12 }, (_, i) => ({ name: `Ghost${i}`, country: "MX" }));
    expect(resolveRouting(many, [], ALL).unmatched).toHaveLength(MAX_ROUTING_CITIES);
  });
});

describe("pasted-mode board", () => {
  const heat = { Mexico: [A, B], "United States": [U1] };

  it("scores only the pasted cities: no heat shortlist, no major-market seeds, labelled your_routing", async () => {
    const calls: Call[] = [];
    const events = await collect(runTourBoard(brief([{ name: "Bosque", country: "MX" }, { name: "Pradera", country: "US" }]), { qloo: fake(heat, calls), cities: ALL }));
    const cs = citiesOf(events);
    expect(cs.map((c) => c.id).sort()).toEqual(["m2", "u2"]);
    expect(cs.every((c) => c.candidateSource === "your_routing")).toBe(true);
    expect(cs.some((c) => c.id === "m1")).toBe(false); // Aldea is in the heat list and the biggest MX city: neither a shortlist nor a seed picked it
    expect(events.at(-1)).toMatchObject({ type: "done", summary: { cities: 2 } });
  });

  it("heat regions are the distinct countries of the matched cities (at most 3)", async () => {
    const calls: Call[] = [];
    await collect(runTourBoard(brief([{ name: "Bosque", country: "MX" }, { name: "Cumbre", country: "MX" }, { name: "Pradera", country: "US" }], ["Atlantis"]), { qloo: fake(heat, calls), cities: ALL }));
    const regionCalls = calls.filter((c) => c.tool === "qloo_where_popular" && c.args.entity === "A1").map((c) => c.args.within);
    expect(regionCalls.filter((w) => w === "Mexico" || w === "United States")).toEqual(["Mexico", "United States"]);
    const four: City[] = [A, U1, { id: "g1", name: "Gran", country: "GB", lat: 51.5, lon: -0.1, population: 5 }, { id: "d1", name: "Dorf", country: "DE", lat: 52.5, lon: 13.4, population: 5 }];
    const calls2: Call[] = [];
    await collect(runTourBoard(brief(four.map((c) => ({ name: c.name, country: c.country }))), { qloo: fake({}, calls2), cities: [...ALL, ...four.slice(2)] }));
    const heatRegions = calls2.filter((c) => c.tool === "qloo_where_popular" && c.args.entity === "A1" && ["Mexico", "United States", "United Kingdom", "Germany"].includes(String(c.args.within)));
    expect(heatRegions).toHaveLength(3);
  });

  it("a matched city in the regional heat keeps its real fan heat; one absent gets the floor and the floored cap", async () => {
    const events = await collect(runTourBoard(brief([{ name: "Bosque", country: "MX" }, { name: "Cumbre", country: "MX" }]), { qloo: fake({ Mexico: [A, B] }), cities: ALL }));
    const cs = citiesOf(events);
    const bosque = cs.find((c) => c.id === "m2")!, cumbre = cs.find((c) => c.id === "m3")!;
    expect(bosque.fanHeatFloor).toBeUndefined();
    expect(cumbre.fanHeatFloor).toBe(true);
    // the floor is the minimum fan heat in the regional heat list; Aldea is hotter than Bosque, so Bosque is the coldest
    expect(cumbre.fanHeat.value).toBe(bosque.fanHeat.value);
    expect(cumbre.fanHeat).toMatchObject({ refs: [] });
    expect(["play", "hidden_goldmine"]).not.toContain(cumbre.verdict);
  });

  it("the floored cap fires: the same activation is hidden_goldmine for a city in the heat list and consider for a floored one", async () => {
    // One city in the regional heat: its fan heat is mid-band (0.7 x 0.6 + 0.3 x 0.5 = 57). A pasted city outside the list gets that same
    // value as its floor, and every city shares the same activation, so only the cap can tell them apart.
    const inner = fake({});
    const midBand: QlooCaller = { async call(tool, args, sid) {
      if (tool === "qloo_where_popular" && args.within === "Mexico") {
        return { envelope: { operation: "where_popular", status: "ok", results: [{ location: { latitude: B.lat, longitude: B.lon }, query: { affinity: 0.6, popularity: 0.5 } }] }, cacheKey: "k", cached: false, stale: false };
      }
      return inner.call(tool, args, sid);
    } };
    const events = await collect(runTourBoard(brief([{ name: "Bosque", country: "MX" }, { name: "Cumbre", country: "MX" }]), { qloo: midBand, cities: ALL }));
    const cs = citiesOf(events);
    const inList = cs.find((c) => c.id === "m2")!, floored = cs.find((c) => c.id === "m3")!;
    expect(inList.fanHeat.value).toBeCloseTo(floored.fanHeat.value!, 6);
    expect(inList.fanHeatFloor).toBeUndefined();
    expect(floored.fanHeatFloor).toBe(true);
    expect(inList.verdict).toBe("hidden_goldmine");
    expect(floored.verdict).toBe("consider");
  });

  it("emits routing_unmatched with the names before any city is scored", async () => {
    const events = await collect(runTourBoard(brief([{ name: "Bosque", country: "MX" }, { name: "Atlantis" }, { name: "Nowhere", country: "MX" }]), { qloo: fake(heat), cities: ALL }));
    const i = events.findIndex((e) => e.type === "routing_unmatched");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(events[i]).toEqual({ type: "routing_unmatched", names: ["Atlantis", "Nowhere, MX"] });
    expect(i).toBeLessThan(events.findIndex((e) => e.type === "city_scored"));
  });

  it("nothing matched: routing_unmatched, then a ROUTING_EMPTY error, and no Qloo call at all", async () => {
    const calls: Call[] = [];
    const events = await collect(runTourBoard(brief([{ name: "Atlantis" }]), { qloo: fake(heat, calls), cities: ALL }));
    expect(events.map((e) => e.type)).toEqual(["routing_unmatched", "error"]);
    expect(events[1]).toMatchObject({ code: "ROUTING_EMPTY" });
    expect(calls).toEqual([]);
  });

  it("an unplaceable pasted city gets the existing location_unresolved handling", async () => {
    const misplaced = new Set(["Bosque, MX", "Bosque, Mexico"]);
    const calls: Call[] = [];
    const cs = citiesOf(await collect(runTourBoard(brief([{ name: "Bosque", country: "MX" }, { name: "Pradera", country: "US" }]), { qloo: fake(heat, calls, { misplaced }), cities: ALL })));
    const b = cs.find((c) => c.id === "m2")!;
    expect(b).toMatchObject({ insufficientReason: "location_unresolved", verdict: "insufficient_data", candidateSource: "your_routing" });
    expect(b.warnings.some((w) => w.code === "LOCATION_UNRESOLVED")).toBe(true);
    expect(cs.find((c) => c.id === "u2")!.insufficientReason).toBeUndefined();
  });

  it("a normal board never carries routing, and brief.extraCities is ignored in pasted mode", async () => {
    const plain = await collect(runTourBoard({ artist: "Test Artist", regions: ["Mexico"], maxStops: 8, sessionId: "s", today: "2026-10-20" }, { qloo: fake(heat), cities: ALL }));
    expect(plain.some((e) => e.type === "routing_unmatched")).toBe(false);
    expect(citiesOf(plain).some((c) => c.candidateSource === "your_routing")).toBe(false);
    const pasted = citiesOf(await collect(runTourBoard({ ...brief([{ name: "Bosque", country: "MX" }]), extraCities: [C] }, { qloo: fake(heat), cities: ALL })));
    expect(pasted.map((c) => c.id)).toEqual(["m2"]);
  });
});

describe("POST /v1/tour-board with cities", () => {
  const app = (calls: Call[] = []) => createApp({ qloo: fake({ Mexico: [A, B], "United States": [U1] }, calls), cities: ALL, health: async () => ({ connected: true, ready: true }) });
  const post = (a: ReturnType<typeof app>, body: unknown) => request(a).post("/v1/tour-board").set("x-session-id", "s").send(body as object);

  it("streams a pasted run; regions and maxStops are optional in pasted mode", async () => {
    const res = await post(app(), { artist: "Test Artist", cities: [{ name: "Bosque", country: "MX" }, { name: "Atlantis" }] });
    expect(res.status).toBe(200);
    expect(res.text).toContain("event: routing_unmatched");
    expect(res.text).toContain("your_routing");
    expect(res.text).toContain("event: done");
  });
  it.each<[string, unknown]>([
    ["empty list", []],
    ["more than 8", Array.from({ length: 9 }, (_, i) => ({ name: `C${i}` }))],
    ["not an array", "Bosque"],
    ["an entry without a name", [{ country: "MX" }]],
    ["a control character", [{ name: "Bos\u0007que" }]],
    ["angle brackets", [{ name: "<b>Bosque</b>" }]],
    ["a bidi override", [{ name: "Bosque‮" }]],
    ["an unsafe country", [{ name: "Bosque", country: "M<X" }]],
    ["a name over 100 chars", [{ name: "x".repeat(101) }]],
    ["a non-object entry", ["Bosque"]],
  ])("is a 400 with a clear message: %s", async (_n, cities) => {
    const calls: Call[] = [];
    const res = await post(app(calls), { artist: "Test Artist", regions: ["Mexico"], maxStops: 8, cities });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cities/);
    expect(calls).toEqual([]);
  });
  it("still ignores extraCities in the body", async () => {
    const calls: Call[] = [];
    const res = await post(app(calls), { artist: "Test Artist", cities: [{ name: "Bosque", country: "MX" }], extraCities: [C] });
    expect(res.status).toBe(200);
    expect(res.text).not.toContain("backtest_extra");
    expect(res.text).not.toContain("Cumbre");
  });
  it("a normal board request is unchanged (regions still required without cities)", async () => {
    expect((await post(app(), { artist: "Test Artist", maxStops: 8 })).status).toBe(400);
  });
});

describe("budget: 8 pasted cities plus 4 playbooks in one session", () => {
  it("stays within SESSION_QLOO_BUDGET even when every city needs its second location string", async () => {
    const eight: City[] = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `Villa${i}`, country: i % 2 ? "US" : "MX", lat: 10 + i * 4, lon: -100 + i * 3, population: 200_000 }));
    const cities = [...ALL, ...eight];
    const misplaced = new Set(eight.map((c) => `${c.name}, ${c.country}`)); // first string always misses
    const inner = fake({ Mexico: eight.filter((c) => c.country === "MX"), "United States": eight.filter((c) => c.country === "US") }, [], { misplaced, world: cities });
    let qlooCalls = 0;
    const budget = new BudgetGuard({ perSession: SESSION_QLOO_BUDGET, perDay: 2000 });
    const route = async (tool: string, args: Record<string, unknown>): Promise<QlooEnvelope> => {
      qlooCalls += 1;
      const env = (await inner.call(tool, args, "x")).envelope;
      if (tool === "qloo_recommend" && args.target_type === "place") {
        const where = String(args.filter_location);
        const c = cities.find((k) => where.startsWith(`${k.name},`))!;
        return { operation: "recommend", status: "ok", results: Array.from({ length: 10 }, (_, i) => ({ entity_id: `v-${c.id}-${i}`, name: `venue ${c.id} ${i}`, affinity: 0.9 - i * 0.01, popularity: 0.5, properties: { geocode: { city: c.name, country_code: c.country } } })) };
      }
      if (tool === "qloo_recommend") return { ...env, results: Array.from({ length: args.signals ? 10 : 20 }, (_, i) => ({ entity_id: `${tool}-${String(args.target_type)}-${String(args.signal_location ?? args.filter_location)}-${i}`, name: `n${i}`, affinity: 0.9 - i * 0.01, popularity: 0.5 })) };
      if (tool === "qloo_rank") return { operation: "rank", status: "ok", results: (args.options as string[]).map((id, i) => ({ entity_id: id, name: id, affinity: 0.9 - i * 0.01 })) };
      return env;
    };
    const qloo = createQlooCaller({ mcp: { async callTool(name, args) { return route(name, args); } }, cache: new MemoryCache(), budget, sleep: async () => {} });
    const sessionId = "routing-session";
    const board = await collect(runTourBoard({ ...brief(eight.map((c) => ({ name: c.name, country: c.country })), []), sessionId, maxStops: 8 }, { qloo, cities }));
    expect(board.filter((e) => e.type === "error")).toEqual([]);
    expect(citiesOf(board)).toHaveLength(8);
    const boardCalls = qlooCalls;
    for (const c of citiesOf(board).slice(0, 4)) {
      const ev = await collect(runCityPlaybook({ artist: "Test Artist", artistEntityId: "A1", city: { name: c.name, country: eight.find((e) => e.id === c.id)!.country, id: c.id }, sessionId }, { qloo, cities }));
      expect(ev.filter((e) => e.type === "error")).toEqual([]);
    }
    // Worst case by construction: 7 profile and heat calls + 8 cities x (2 lookups + 6 activation calls) + 4 playbooks x 14 + 1 headliner describe = 128.
    expect(boardCalls).toBe(70);
    expect(qlooCalls).toBe(107);
    expect(qlooCalls).toBeLessThanOrEqual(SESSION_QLOO_BUDGET);
    expect(budget.remaining(sessionId).session).toBe(SESSION_QLOO_BUDGET - qlooCalls);
  });
});
