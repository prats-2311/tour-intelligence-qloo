import { describe, expect, it } from "vitest";
import { BudgetGuard, SESSION_QLOO_BUDGET } from "../src/budget.js";
import { MemoryCache } from "../src/cache.js";
import { runCityRank, type CityCase } from "../src/backtest/cityRank.js";
import type { CallTool, PermutationRanker } from "../src/backtest/proofShared.js";
import { StopMonitor } from "../src/backtest/proofStats.js";
import type { City } from "../src/geo/cities.js";
import { createQlooCaller } from "../src/qlooCall.js";
import type { QlooEnvelope } from "../src/types.js";
import { describeOk } from "./fixtures/envelopes.js";

// Invented geography: three countries, each with its largest city missing from Qloo's heat list (so 3 major-market seeds), plus 6 small cities
// that are only ever "played" (never in the heat list). Board = 8 heat + 3 seeds = 11; Amendment 1 adds 3 played cities: 14 candidates.
const MX: City[] = [
  { id: "m1", name: "Mexa", country: "MX", lat: 19.43, lon: -99.13, population: 9_000_000 },
  { id: "m2", name: "Montera", country: "MX", lat: 25.68, lon: -100.31, population: 1_100_000 },
  { id: "m3", name: "Guadara", country: "MX", lat: 20.67, lon: -103.35, population: 1_400_000 },
  { id: "m4", name: "Pueblo", country: "MX", lat: 19.04, lon: -98.2, population: 500_000 },
  { id: "m5", name: "Meridal", country: "MX", lat: 20.97, lon: -89.62, population: 500_000 },
];
const BR: City[] = [
  { id: "b1", name: "Saopa", country: "BR", lat: -23.55, lon: -46.63, population: 12_000_000 },
  { id: "b2", name: "Riode", country: "BR", lat: -22.9, lon: -43.17, population: 6_000_000 },
  { id: "b3", name: "Curita", country: "BR", lat: -25.43, lon: -49.27, population: 1_900_000 },
  { id: "b4", name: "Recifa", country: "BR", lat: -8.05, lon: -34.88, population: 500_000 },
  { id: "b5", name: "Salvada", country: "BR", lat: -12.97, lon: -38.5, population: 500_000 },
];
const US: City[] = [
  { id: "u1", name: "Newyorka", country: "US", lat: 40.71, lon: -74.0, population: 8_800_000 },
  { id: "u2", name: "Austina", country: "US", lat: 30.27, lon: -97.74, population: 960_000 },
  { id: "u3", name: "Denvera", country: "US", lat: 39.74, lon: -104.99, population: 500_000 },
  { id: "u4", name: "Boisea", country: "US", lat: 43.62, lon: -116.2, population: 300_000 },
];
const SMALL: City[] = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, name: `Smalltown${String.fromCharCode(65 + i)}`, country: "US", lat: 33 + i * 1.7, lon: -85 + i * 3.1, population: 120_000 - i * 1000 }));
const WORLD = [...MX, ...BR, ...US, ...SMALL];
const HEAT: Record<string, City[]> = {
  Mexico: [MX[1]!, MX[2]!, MX[3]!, MX[4]!], Brazil: [BR[1]!, BR[2]!, BR[3]!, BR[4]!], "United States": [US[1]!, US[2]!, US[3]!],
};
const FULL: Record<string, string> = { MX: "Mexico", BR: "Brazil", US: "United States" };

const heat = (cs: City[]): QlooEnvelope => ({ operation: "where_popular", status: "ok", results: cs.map((c, i) => ({ location: { latitude: c.lat, longitude: c.lon }, query: { affinity: 0.9 - i * 0.05, popularity: 0.5 } })) });
const around = (c: City): QlooEnvelope => ({ operation: "where_popular", status: "ok", results: [0, 1, 2].map((i) => ({ location: { latitude: c.lat + i * 0.01, longitude: c.lon }, query: { affinity: 0.8 - i * 0.2, popularity: 0.3 } })) });
const misplaced: QlooEnvelope = { operation: "where_popular", status: "ok", results: [0, 1, 2].map((i) => ({ location: { latitude: i * 0.01, longitude: 0 }, query: { affinity: 0.5, popularity: 0.3 } })) };
const slug = (s: string) => s.replace(/\W/g, "");
const tags = [["Funk", 0.9], ["Soul", 0.7]].map(([n, s]) => ({ tag_id: `urn:tag:genre:music:${n}`, name: n, type: "urn:tag", query: { score: s } }));

/** Fake Qloo MCP. `legacyMisplaced`: the "<name>, <ISO-2>" string always resolves to the wrong place, so every city needs its second string. */
function route(tool: string, args: Record<string, unknown>, legacyMisplaced: boolean): QlooEnvelope {
  const where = String(args.signal_location ?? args.filter_location ?? args.within ?? "");
  switch (tool) {
    case "qloo_describe": return describeOk;
    case "qloo_where_popular": {
      if (HEAT[where]) return heat(HEAT[where]!);
      const city = WORLD.find((c) => where === `${c.name}, ${c.country}` || where === `${c.name}, ${FULL[c.country]}`)!;
      return legacyMisplaced && where === `${city.name}, ${city.country}` ? misplaced : around(city);
    }
    case "qloo_recommend": {
      if (args.target_type === "place") {
        const city = WORLD.find((c) => where.startsWith(`${c.name},`))!;
        return { operation: "recommend", status: "ok", results: Array.from({ length: 10 }, (_, i) => ({ entity_id: `${slug(`venue ${where}`)}-${i}`, name: `venue ${where} ${i}`, affinity: 0.9 - i * 0.01, popularity: 0.5, properties: { geocode: { city: city.name, country_code: city.country } } })) };
      }
      return { operation: "recommend", status: "ok", results: Array.from({ length: 10 }, (_, i) => ({ entity_id: `${slug(`${String(args.target_type)} ${where}`)}-${i}`, name: `${String(args.target_type)} ${where} ${i}`, affinity: 0.9 - i * 0.01, popularity: 0.5 })) };
    }
    case "qloo_rank": return { operation: "rank", status: "ok", results: (args.options as string[]).map((id, i) => ({ entity_id: id, name: id, affinity: 0.9 - i * 0.01 })) };
    case "qloo_compare_audiences": return { operation: "compare_audiences", status: "ok", results: { a: [], b: [], matchEntities: [], tags } };
    default: return { operation: tool, status: "ok", results: [] };
  }
}

const reverseRanker: PermutationRanker = { async rank(_p, labels) { return { order: [...labels].reverse(), attempts: 1, model: "fake" }; } };
const caseOf: CityCase = {
  position: 1, artist: "Test Artist", tour_title: "T", url: "https://example.org/t", revid: 1, first_show_year: 2024, regions: ["Mexico", "Brazil", "United States"],
  played: ["m1", "b1", "s0", "s1", "s2", "s3", "s4", "s5"].map((id) => { const c = WORLD.find((w) => w.id === id)!; return { city_id: id, name: c.name, country: c.country, shows: 1 }; }),
};

// Measured with this world (a change to the pipeline's call pattern changes these on purpose): board 11 + one played/decoy pair = 13 candidates.
const FIRST = 98, WORST = 111;

describe("Test A budget: one artist with a full board and a played/decoy pair in one gateway session", () => {
  it.each([[false, "every city resolves on the first string"], [true, "every city needs its second location string (worst case)"]])("stays within SESSION_QLOO_BUDGET (%s: %s)", async (legacyMisplaced) => {
    let uncached = 0;
    const budget = new BudgetGuard({ perSession: SESSION_QLOO_BUDGET, perDay: 2000 });
    // The real gateway path: resilientCall (validate, cache, budget, mcp, retry) behind the HTTP route; the runner sees only envelopes.
    const gateway = createQlooCaller({ mcp: { async callTool(name, args) { uncached += 1; return route(name, args, legacyMisplaced); } }, cache: new MemoryCache(), budget, sleep: async () => {} });
    const callTool: CallTool = async (name, args, session) => (await gateway.call(name, args, session)).envelope;
    const monitor = new StopMonitor();
    const out = await runCityRank({ cases: [caseOf], batch: 1, plannedTotal: 12 }, { callTool, cities: WORLD, ranker: reverseRanker, monitor, today: "2026-10-20" });
    expect(out.stop).toBeUndefined();
    expect(out.section.dropped).toEqual([]);
    const a = out.section.artists[0]!;
    expect(a.boardCount).toBe(11);
    expect(a.playedExtras).toBe(1);
    expect(a.decoyExtras).toBe(1);
    expect(a.candidateCount).toBe(13); // one more pair would make 15
    expect(uncached).toBeLessThanOrEqual(SESSION_QLOO_BUDGET);
    expect(budget.remaining("proof-v3-city-1").session).toBe(SESSION_QLOO_BUDGET - uncached);
    expect(out.callCounts.qloo).toBe(uncached); // the runner's own count equals what the gateway spent
    expect(out.callCounts.gemini).toBe(0); // the fake ranker makes no Vertex call
    expect(uncached).toBe(legacyMisplaced ? WORST : FIRST);
  });
});
