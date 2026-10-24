import { describe, expect, it } from "vitest";
import { BudgetGuard, SESSION_QLOO_BUDGET } from "../src/budget.js";
import { MemoryCache } from "../src/cache.js";
import type { City } from "../src/geo/cities.js";
import { reserveAttempt } from "../src/narrative/ceiling.js";
import { suggestLocalActs } from "../src/pipeline/localActs.js";
import { runCityPlaybook } from "../src/pipeline/cityPlaybook.js";
import { runTourBoard } from "../src/pipeline/tourBoard.js";
import { createQlooCaller } from "../src/qlooCall.js";
import type { GatewayEvent, QlooEnvelope } from "../src/types.js";
import { describeOk } from "./fixtures/envelopes.js";

// Three regions, eight cities, each far from the others.
const REGIONS: Record<string, City[]> = {
  Mexico: [
    { id: "m1", name: "Mexico City", country: "MX", lat: 19.43, lon: -99.13, population: 9_000_000 },
    { id: "m2", name: "Monterrey", country: "MX", lat: 25.68, lon: -100.31, population: 1_100_000 },
    { id: "m3", name: "Guadalajara", country: "MX", lat: 20.67, lon: -103.35, population: 1_400_000 },
  ],
  Brazil: [
    { id: "b1", name: "Sao Paulo", country: "BR", lat: -23.55, lon: -46.63, population: 12_000_000 },
    { id: "b2", name: "Rio de Janeiro", country: "BR", lat: -22.9, lon: -43.17, population: 6_000_000 },
    { id: "b3", name: "Curitiba", country: "BR", lat: -25.43, lon: -49.27, population: 1_900_000 },
  ],
  "United States": [
    { id: "u1", name: "Austin", country: "US", lat: 30.27, lon: -97.74, population: 960_000 },
    { id: "u2", name: "Portland", country: "US", lat: 45.52, lon: -122.68, population: 650_000 },
  ],
};
// Smaller metros, only in Qloo's heat list in the "major-market seeds" case below (the largest city of each country is left out of that list).
const EXTRA: City[] = [
  { id: "x1", name: "Puebla", country: "MX", lat: 19.04, lon: -98.2, population: 500_000 },
  { id: "x2", name: "Merida", country: "MX", lat: 20.97, lon: -89.62, population: 500_000 },
  { id: "x3", name: "Recife", country: "BR", lat: -8.05, lon: -34.88, population: 500_000 },
  { id: "x4", name: "Salvador", country: "BR", lat: -12.97, lon: -38.5, population: 500_000 },
  { id: "x5", name: "Denver", country: "US", lat: 39.74, lon: -104.99, population: 500_000 },
  { id: "x6", name: "Boise", country: "US", lat: 43.62, lon: -116.2, population: 300_000 },
];
const SEEDED: Record<string, City[]> = {
  Mexico: [REGIONS.Mexico![1]!, REGIONS.Mexico![2]!, EXTRA[0]!, EXTRA[1]!],
  Brazil: [REGIONS.Brazil![1]!, REGIONS.Brazil![2]!, EXTRA[2]!, EXTRA[3]!],
  "United States": [REGIONS["United States"]![1]!, EXTRA[4]!, EXTRA[5]!],
};
let ACTIVE: Record<string, City[]> = REGIONS;
const CITIES = [...Object.values(REGIONS).flat(), ...EXTRA];
const placeOf = (where: string) => CITIES.find((c) => where.startsWith(`${c.name},`))!;
const heat = (cs: City[]): QlooEnvelope => ({ operation: "where_popular", status: "ok", results: cs.map((c, i) => ({ location: { latitude: c.lat, longitude: c.lon }, query: { affinity: 0.9 - i * 0.05, popularity: 0.5 } })) });
const cityZones = (c: City): QlooEnvelope => ({ operation: "where_popular", status: "ok", results: [0, 1, 2].map((i) => ({ location: { latitude: c.lat + i * 0.01, longitude: c.lon }, query: { affinity: 0.8 - i * 0.2, popularity: 0.3 } })) });
const tags = [["Funk", 0.9], ["Soul", 0.7], ["Pop", 0.5]].map(([n, s]) => ({ tag_id: `urn:tag:genre:music:${n}`, name: n, type: "urn:tag", query: { score: s } }));
const FULL: Record<string, string> = { MX: "Mexico", BR: "Brazil", US: "United States" };
/** Query strings (by exact text) that Qloo resolves to the wrong place: three points at 0,0, far from every test city. */
const MISPLACED = new Set<string>();
const misplaced: QlooEnvelope = { operation: "where_popular", status: "ok", results: [0, 1, 2].map((i) => ({ location: { latitude: i * 0.01, longitude: 0 }, query: { affinity: 0.5, popularity: 0.3 } })) };
const slug = (s: string) => s.replace(/\W/g, "");

/** Fake Qloo MCP: every tool answers ok, with distinct ids per city so no two cities share cache keys. */
function route(tool: string, args: Record<string, unknown>): QlooEnvelope {
  const where = String(args.signal_location ?? args.filter_location ?? args.within ?? "");
  switch (tool) {
    case "qloo_describe": return args.entity === "Test Artist" ? describeOk : { operation: "describe", status: "ok", results: [{ entity_id: `D-${String(args.entity)}`, name: String(args.entity), popularity: 0.4 }] };
    case "qloo_where_popular": {
      const region = ACTIVE[String(args.within)];
      if (MISPLACED.has(String(args.within))) return misplaced;
      return region ? heat(region) : cityZones(CITIES.find((c) => [`${c.name}, ${c.country}`, `${c.name}, ${FULL[c.country]}`].includes(String(args.within)))!);
    }
    case "qloo_recommend": {
      if (args.target_type === "place") {
        const city = placeOf(where);
        return { operation: "recommend", status: "ok", results: Array.from({ length: 10 }, (_, i) => ({ entity_id: `${slug(`venue ${where}`)}-${i}`, name: `venue ${where} ${i}`, affinity: 0.9 - i * 0.01, popularity: 0.5, properties: { geocode: { city: city.name, country_code: city.country } } })) };
      }
      const names = args.signals ? Array.from({ length: 10 }, (_, i) => `${String(args.target_type)} ${where} ${i}`) : Array.from({ length: 20 }, (_, i) => `Pool ${where} ${i}`);
      return { operation: "recommend", status: "ok", results: names.map((name, i) => ({ entity_id: `${slug(name)}-${i}`, name, affinity: 0.9 - i * 0.01, popularity: 0.5 })) };
    }
    case "qloo_rank": return { operation: "rank", status: "ok", results: (args.options as string[]).map((id, i) => ({ entity_id: id, name: id, affinity: 0.9 - i * 0.01 })) };
    case "qloo_compare_audiences": return { operation: "compare_audiences", status: "ok", results: { a: [], b: [], matchEntities: [], tags } };
    default: return { operation: tool, status: "ok", results: [] };
  }
}

const BIG: City[] = Array.from({ length: 22 }, (_, i) => ({ id: `big${i}`, name: `Bigtown${String.fromCharCode(65 + i)}`, country: "MX", lat: 10 + (i % 11) * 3, lon: -110 + Math.floor(i / 11) * 12, population: 400_000 }));
CITIES.push(...BIG);

async function collect(g: AsyncGenerator<GatewayEvent>) { const o: GatewayEvent[] = []; for await (const e of g) o.push(e); return o; }

describe("one session: cold board plus 4 hybrid playbooks", () => {
  it.each<[string, string[], ("seeded" | undefined)?]>([
    ["every city resolves on the first string", []],
    ["a cold board with 3 major-market seeds absent from Qloo's heat list (11 cities), all resolving on the first string", [], "seeded"],
    ["one board city needs a second string and one never resolves", ["Sao Paulo, BR", "Portland, US", "Portland, United States"]],
    ["every board city except one needs its second string (worst case: one extra lookup per city)", ["Mexico City, MX", "Monterrey, MX", "Guadalajara, MX", "Sao Paulo, BR", "Rio de Janeiro, BR", "Curitiba, BR", "Austin, US"]],
    ["the largest city of each country is missing from Qloo's heat list: 3 major-market seeds, every seed needing its second string", ["Mexico City, MX", "Sao Paulo, BR", "Austin, US"], "seeded"],
  ])("never hits the Qloo or Gemini session limits: %s", async (_name, misplacedStrings, mode) => {
    ACTIVE = mode === "seeded" ? SEEDED : REGIONS;
    const seeded = mode === "seeded";
    MISPLACED.clear();
    for (const m of misplacedStrings) MISPLACED.add(m);
    const sessionId = "judge-session";
    let qlooCalls = 0;
    const budget = new BudgetGuard({ perSession: SESSION_QLOO_BUDGET, perDay: 2000 });
    const qloo = createQlooCaller({ mcp: { async callTool(name, args) { qlooCalls += 1; return route(name, args); } }, cache: new MemoryCache(), budget, sleep: async () => {} });

    const geminiBudget = new BudgetGuard({ perSession: 20, perDay: Number.MAX_SAFE_INTEGER });
    let geminiAttempts = 0;
    // The model proposes 3 city-pool artists (no describe needed) and 7 others (describes capped at 5).
    const generate = async (_m: string, body: Record<string, unknown>) => {
      geminiAttempts += 1;
      const prompt = JSON.stringify(body);
      const city = CITIES.find((c) => prompt.includes(c.name))!;
      const items = [...[0, 1, 2].map((i) => ({ name: `Pool ${city.name}, ${city.country} ${i}` })), ...Array.from({ length: 7 }, (_, i) => ({ name: `Guest ${city.name} ${i}` }))];
      return { candidates: [{ content: { parts: [{ text: JSON.stringify({ items }) }] } }] };
    };
    const ceiling = { ceiling: geminiBudget };
    const localActs = (input: { artist: string; city: { name: string; country: string }; sessionId: string }) =>
      suggestLocalActs(input, { generate, models: ["m1", "m2"], ceiling, cache: new MemoryCache() });
    const narrate = async () => { await reserveAttempt(ceiling, sessionId)(); geminiAttempts += 1; return { status: "unavailable" as const, reason: "disabled" as const, message: "m" }; };

    const board = await collect(runTourBoard({ artist: "Test Artist", regions: Object.keys(REGIONS), maxStops: 8, sessionId, today: "2026-10-20" }, { qloo, cities: CITIES }));
    const scored = board.filter((e) => e.type === "city_scored");
    expect(board.filter((e) => e.type === "error")).toEqual([]);
    expect(scored).toHaveLength(seeded ? 11 : 8);
    if (seeded) expect((scored as Array<{ city: { candidateSource: string } }>).filter((e) => e.city.candidateSource === "major_market")).toHaveLength(3);
    const boardCalls = qlooCalls;
    const unresolved = (scored as Array<{ city: { insufficientReason?: string } }>).filter((e) => e.city.insufficientReason === "location_unresolved");
    expect(unresolved).toHaveLength(misplacedStrings.includes("Portland, United States") ? 1 : 0);


    const stops = (scored as Array<{ city: { name: string; country: string; insufficientReason?: string } }>).filter((e) => !e.city.insufficientReason).slice(0, 4).map((e) => e.city);
    expect(stops).toHaveLength(4);
    for (const city of stops) {
      const events = await collect(runCityPlaybook({ artist: "Test Artist", artistEntityId: "A1", city, sessionId }, { qloo, cities: CITIES, narrate, localActs }));
      expect(events.filter((e) => e.type === "error")).toEqual([]);
      expect(events.at(-1)?.type).toBe("done");
      const talent = (events.find((e) => e.type === "playbook") as { playbook: { cards: Array<{ kind: string; items: Array<{ source?: string }> }> } }).playbook.cards.find((c) => c.kind === "talent")!;
      expect(talent.items.some((i) => i.source === "suggested")).toBe(true); // Gemini ran, not skipped by a ceiling
    }

    // The session limit was the problem at 100: the same run now needs more than that, and still fits.
    expect(qlooCalls).toBeGreaterThan(misplacedStrings.length > 2 ? 90 : 100); // unresolved cities skip their activation calls, so the cold board is cheaper
    expect(qlooCalls).toBeLessThanOrEqual(SESSION_QLOO_BUDGET);
    expect(budget.remaining(sessionId).session).toBe(SESSION_QLOO_BUDGET - qlooCalls);
    expect(qlooCalls - boardCalls).toBeLessThanOrEqual(4 * 14 + 1); // per playbook: 3 co-bill + 1 pool + <=5 describes + 1 rank + 1 compare + 3 city baselines (brand, movie, tv); +1 once for the headliner's popularity (cached after)
    // Gemini: 4 local-acts attempts + 4 narrative attempts = 8 of the 20-per-session ceiling (This-week syntheses add at most 1 per chapter: 12).
    expect(geminiAttempts).toBe(8);
    expect(geminiBudget.remaining(sessionId).session).toBe(20 - 8);
  });
});

describe("a 20-stop board with major markets requested", () => {
  it("adds no seed beyond max(11, shortlist) and never goes over the session budget", async () => {
    ACTIVE = { Mexico: BIG };
    MISPLACED.clear();
    const sessionId = "big-session";
    let qlooCalls = 0;
    const budget = new BudgetGuard({ perSession: SESSION_QLOO_BUDGET, perDay: 2000 });
    const qloo = createQlooCaller({ mcp: { async callTool(name, args) { qlooCalls += 1; return route(name, args); } }, cache: new MemoryCache(), budget, sleep: async () => {} });
    const board = await collect(runTourBoard({ artist: "Test Artist", regions: ["Mexico"], maxStops: 20, sessionId, today: "2026-10-20" }, { qloo, cities: CITIES }));
    const scored = board.filter((e) => e.type === "city_scored") as Array<{ city: { candidateSource: string } }>;
    expect(scored.length).toBeLessThanOrEqual(20);
    expect(scored.filter((e) => e.city.candidateSource === "major_market")).toHaveLength(0); // the 20-city shortlist is already past 11
    expect(qlooCalls).toBeLessThanOrEqual(SESSION_QLOO_BUDGET);
    const errors = board.filter((e) => e.type === "error") as Array<{ code: string }>;
    expect(errors.every((e) => e.code === "BUDGET")).toBe(true); // either done, or the existing BUDGET stop; never over
  });
});
