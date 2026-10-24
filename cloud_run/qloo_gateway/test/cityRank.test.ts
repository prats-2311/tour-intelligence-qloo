import { describe, expect, it } from "vitest";
import { buildLlmPrompt, decoyPool, llmLabels, MAX_CANDIDATES, rankByScore, reanchorPlayed, rPrecision, runCityRank, selectExtras, type CityCase } from "../src/backtest/cityRank.js";
import { createPermutationRanker, type CallTool, type PermutationRanker } from "../src/backtest/proofShared.js";
import { sha256Hex, StopMonitor } from "../src/backtest/proofStats.js";
import type { City } from "../src/geo/cities.js";
import type { QlooEnvelope } from "../src/types.js";
import { describeOk, recs } from "./fixtures/envelopes.js";

const byHash = (artist: string, ids: string[]) => [...ids].sort((a, b) => sha256Hex(artist + a).localeCompare(sha256Hex(artist + b)));
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

describe("selectExtras (Amendment 2.1: played/decoy pairs)", () => {
  const dec = (n: number) => ids("d", n);
  it("adds a played city then an unplayed decoy per pair, played in sha256(artist + id) order, decoys in the order given, up to 14", () => {
    const board = ids("b", 8);
    const played = ids("p", 12);
    const decoys = dec(12);
    const r = selectExtras("Artist", board, played, decoys);
    expect(r.boardMostlyPlayed).toBe(false);
    expect(r.played).toEqual(byHash("Artist", played).slice(0, 3));
    expect(r.decoys).toEqual(decoys.slice(0, 3));
    expect(board.length + r.played.length + r.decoys.length).toBe(MAX_CANDIDATES);
  });
  it("never lets played cities exceed half of the list, never exceeds 14, for many boards", () => {
    for (const boardSize of [3, 8, 11, 12, 13, 14, 15]) for (const boardPlayed of [0, 1, 2, 3, 5]) {
      if (boardPlayed > boardSize) continue;
      const board = ids("b", boardSize);
      const r = selectExtras("Z", board, [...board.slice(0, boardPlayed), ...ids("p", 30)], dec(30));
      const total = boardSize + r.played.length + r.decoys.length, played = boardPlayed + r.played.length;
      expect(r.played.length).toBe(r.decoys.length);
      if (!r.boardMostlyPlayed) { expect(played * 2).toBeLessThanOrEqual(total); expect(total).toBeLessThanOrEqual(Math.max(MAX_CANDIDATES, boardSize)); }
      expect(r.played.every((x) => !board.includes(x))).toBe(true);
    }
  });
  it("stops when either pool runs dry (no unpaired extra), and skips decoys that are played or on the board", () => {
    expect(selectExtras("A", ids("b", 8), ids("p", 5), dec(2))).toMatchObject({ played: expect.any(Array), decoys: dec(2) });
    expect(selectExtras("A", ids("b", 8), ids("p", 5), dec(2)).played).toHaveLength(2);
    expect(selectExtras("A", ids("b", 8), ids("p", 5), []).played).toEqual([]);
    const r = selectExtras("A", ids("b", 8), ids("p", 5), ["p1", "b2", "d1"]);
    expect(r.decoys).toEqual(["d1"]);
  });
  it("board mostly played: nothing added and flagged; exactly half played is not flagged and pairs keep it at half", () => {
    const board = ids("b", 8);
    expect(selectExtras("A", board, [...board.slice(0, 5), ...ids("p", 10)], dec(10))).toEqual({ played: [], decoys: [], boardMostlyPlayed: true });
    const half = selectExtras("A", board, [...board.slice(0, 4), ...ids("p", 5)], dec(10));
    expect(half.boardMostlyPlayed).toBe(false);
    expect(half.played.length).toBe(3); // each pair keeps played at exactly half: 5/10, 6/12, 7/14
  });
  it("a different artist orders the same played cities differently", () => {
    const played = ids("p", 12);
    expect(selectExtras("One", ids("b", 8), played, dec(9)).played).not.toEqual(selectExtras("Two", ids("b", 8), played, dec(9)).played);
  });
});

describe("decoyPool (Amendment 2.1)", () => {
  const city = (id: string, country: string, lat: number, lon: number, population: number): City => ({ id, name: id, country, lat, lon, population });
  const world = [
    city("played-small", "MX", 20, -100, 300_000), city("played-big", "MX", 25, -100, 900_000),
    city("ok1", "MX", 30, -100, 400_000), city("ok2", "MX", 35, -100, 350_000), city("too-small", "MX", 40, -100, 299_999),
    city("on-board", "MX", 15, -100, 500_000), city("elsewhere", "CA", 30, -80, 800_000),
    city("suburb", "MX", 30.1, -100, 310_000), // 11 km from ok1 (bigger): the board would fold it into ok1
    city("other-region-us", "US", 35, -90, 600_000),
  ];
  it("regions' ISO-2, not played, not candidates, population >= smallest played, own board anchor, in sha256(artist + 'decoy' + id) order", () => {
    const got = decoyPool("Art", world, ["Mexico"], ["played-small", "played-big"], ["on-board"]).map((c) => c.id);
    expect(new Set(got)).toEqual(new Set(["ok1", "ok2"]));
    const expected = ["ok1", "ok2"].sort((x, y) => (sha256Hex("Artdecoy" + x) < sha256Hex("Artdecoy" + y) ? -1 : 1));
    expect(got).toEqual(expected);
    expect(decoyPool("Art", world, ["Mexico", "United States"], ["played-small", "played-big"], ["on-board"]).map((c) => c.id)).toContain("other-region-us");
    expect(decoyPool("Art", world, ["Texas"], ["played-small"], [])).toEqual([]); // a region that is not a country has no ISO-2
  });
});

describe("reanchorPlayed (Amendment 2.4)", () => {
  const city = (id: string, name: string, lat: number, lon: number, population: number): City => ({ id, name, country: "US", lat, lon, population });
  const cities = [city("nyc", "New York City", 40.7, -74.0, 8_800_000), city("queens", "Queens", 40.75, -73.82, 2_300_000), city("austin", "Austin", 30.27, -97.74, 960_000), city("far", "Faraway", 45, -110, 150_000)];
  it("anchors a suburb to its tour city, lists the change, merges shows, leaves anchored cities alone", () => {
    const r = reanchorPlayed(cities, [{ city_id: "queens", name: "Queens", country: "US", shows: 2 }, { city_id: "nyc", name: "New York City", country: "US", shows: 1 }, { city_id: "austin", name: "Austin", country: "US", shows: 1 }]);
    expect(r.changes).toEqual([{ from: "Queens", to: "New York City" }]);
    expect(r.played.map((p) => p.city_id).sort()).toEqual(["austin", "nyc"]);
    expect(r.played.find((p) => p.city_id === "nyc")!.shows).toBe(3);
  });
  it("on the committed ground truth, re-anchors Queens, Oakland, Vallejo and Warren the way the board does", async () => {
    const { loadCities } = await import("../src/geo/cities.js");
    const { readFileSync } = await import("node:fs");
    const cases = JSON.parse(readFileSync(new URL("../../../backtest/city/cases.json", import.meta.url), "utf8")) as CityCase[];
    const all = loadCities();
    const changes = Object.fromEntries(cases.map((c) => [c.artist, reanchorPlayed(all, c.played).changes]));
    expect(changes["Sting"]).toEqual(expect.arrayContaining([{ from: "Queens", to: "New York City" }, { from: "Oakland", to: "San Francisco" }]));
    expect(changes["Mon Laferte"]).toEqual(expect.arrayContaining([{ from: "Vallejo", to: "Concord" }]));
    expect(changes["Lea Salonga"]).toEqual(expect.arrayContaining([{ from: "Warren", to: "Detroit" }]));
  });
});

describe("arm orderings", () => {
  it("scored cities by value descending, unscored last, ties broken by sha256(artist + id)", () => {
    const cands = [{ id: "a", value: 50 }, { id: "b", value: null }, { id: "c", value: 70 }, { id: "d", value: 50 }, { id: "e", value: null }];
    const r = rankByScore("Art", cands);
    const tieOrder = byHash("Art", ["a", "d"]);
    const nullOrder = byHash("Art", ["b", "e"]);
    expect(r).toEqual(["c", ...tieOrder, ...nullOrder]);
  });
  it("NaN counts as unscored", () => {
    expect(rankByScore("A", [{ id: "x", value: Number.NaN }, { id: "y", value: 1 }])).toEqual(["y", "x"]);
  });
  it("R-precision is played cities in the top N over N", () => {
    const played = new Set(["a", "b", "c"]);
    expect(rPrecision(["a", "x", "b", "c", "y"], played, 3)).toBeCloseTo(2 / 3, 10);
    expect(rPrecision(["x", "y", "z", "a", "b"], played, 3)).toBe(0);
    expect(rPrecision(["a", "b", "c", "x"], played, 3)).toBe(1);
    expect(() => rPrecision(["a"], played, 0)).toThrow();
  });
});

describe("LLM prompt", () => {
  const cands = [
    { id: "2", name: "Zeta", country: "MX", lat: 1, lon: 1 }, { id: "1", name: "Alpha", country: "US", lat: 2, lon: 2 }, { id: "3", name: "Beta", country: "MX", lat: 3, lon: 3 },
  ];
  it("uses the protocol sentence verbatim, then the cities alphabetically with countries and no other data", () => {
    const { labels } = llmLabels(cands);
    expect(labels).toEqual(["Alpha, United States", "Beta, Mexico", "Zeta, Mexico"]);
    const prompt = buildLlmPrompt("Some Artist", 2024, labels);
    expect(prompt.startsWith("You are a concert booking agent. Rank these cities from best to worst for a headline tour by Some Artist in 2024. Return every city exactly once.")).toBe(true);
    expect(prompt.indexOf("Alpha, United States")).toBeLessThan(prompt.indexOf("Beta, Mexico"));
    expect(prompt).not.toMatch(/population|affinity|fan heat/i);
  });
  it("disambiguates two cities with the same name and country, and maps labels back to ids", () => {
    const { labels, idOf } = llmLabels([{ id: "1", name: "Portland", country: "US", lat: 45.5, lon: -122.7 }, { id: "2", name: "Portland", country: "US", lat: 43.7, lon: -70.3 }]);
    expect(new Set(labels).size).toBe(2);
    expect(labels.map((l) => idOf.get(l)).sort()).toEqual(["1", "2"]);
  });
});

// ---- orchestrator, with a fake world -------------------------------------------------------------------------------------------------
const mk = (id: string, name: string, i: number, pop: number): City => ({ id, name, country: "MX", lat: 14 + i * 2.5, lon: -100 + (i % 3) * 4, population: pop });
const ALLH = Array.from({ length: 10 }, (_, i) => mk(`h${i + 1}`, `Heatville${i + 1}`, i, 2_000_000 - i * 150_000));
const HEAT = ALLH.slice(0, 8); // h9 and h10 are in no heat list
const HEAT_AND_REST = ALLH;
const ONLY = Array.from({ length: 6 }, (_, i) => mk(`p${i + 1}`, `Playville${i + 1}`, 10 + i, 900_000 - i * 10_000));
const WORLD = [...HEAT_AND_REST, ...ONLY];
const heatOf = (cs: City[]): QlooEnvelope => ({ operation: "where_popular", status: "ok", results: cs.map((c, i) => ({ location: { latitude: c.lat, longitude: c.lon }, query: { affinity: 0.95 - i * 0.07, popularity: 0.5 } })) });
const around = (c: City): QlooEnvelope => ({ operation: "where_popular", status: "ok", results: [[0, 0, 0.8], [0.01, 0.01, 0.5], [-0.01, 0, 0.3]].map(([a, b, aff]) => ({ location: { latitude: c.lat + a!, longitude: c.lon + b! }, query: { affinity: aff, popularity: 0.3 } })) });

interface Sent { tool: string; args: Record<string, unknown>; session: string }
function world(sent: Sent[] = [], opts: { failFrom?: number; failWith?: "429" | "error" } = {}): CallTool {
  return async (tool, args, session) => {
    sent.push({ tool, args, session });
    if (opts.failFrom !== undefined && sent.length >= opts.failFrom) {
      if (opts.failWith === "429") throw new Error(`${tool}: HTTP 429`);
      if (tool === "qloo_where_popular" && args.within !== "Mexico") return { operation: tool, status: "error", summary: "upstream failed", error: { code: "INTERNAL", retryable: false, recovery: "retry" } };
    }
    if (tool === "qloo_describe") return describeOk;
    if (tool === "qloo_where_popular") return args.within === "Mexico" ? heatOf(HEAT) : around(WORLD.find((c) => String(args.within).startsWith(`${c.name},`))!);
    if (tool === "qloo_recommend") return recs(["One", "Two", "Three", "Four", "Five"], [0.99, 0.98, 0.97, 0.96, 0.95]);
    return { operation: tool, status: "ok", results: [] };
  };
}
const caseOf = (position: number, artist: string, playedIds: string[]): CityCase => ({
  position, artist, tour_title: "Tour", url: "https://example.org/t", revid: 1, first_show_year: 2024, regions: ["Mexico"],
  played: playedIds.map((id) => { const c = WORLD.find((w) => w.id === id)!; return { city_id: id, name: c.name, country: "MX", shows: 1 }; }),
});
const reverseRanker = (prompts: string[] = []): PermutationRanker => ({ async rank(prompt, labels) { prompts.push(prompt); return { order: [...labels].reverse(), attempts: 1, model: "fake-model" }; } });
const nullRanker: PermutationRanker = { async rank() { return { order: null, attempts: 2, reason: "not_a_permutation" }; } };
const baseDeps = (callTool: CallTool, ranker: PermutationRanker, monitor = new StopMonitor()) => ({ callTool, cities: WORLD, ranker, monitor, today: "2026-10-20" });

describe("runCityRank", () => {
  const played = ["h1", "h2", "h9", "p1", "p2", "p3", "p4"];

  it("builds candidates from the board then played/decoy pairs, scores the extras with a second pass, and never repeats a request", async () => {
    const sent: Sent[] = [];
    const prompts: string[] = [];
    const out = await runCityRank({ cases: [caseOf(1, "Art One", played)], batch: 1, plannedTotal: 12 }, baseDeps(world(sent), reverseRanker(prompts)));
    expect(out.stop).toBeUndefined();
    expect(out.section.dropped).toEqual([]);
    const a = out.section.artists[0]!;
    expect(a.sessionId).toBe("proof-v3-city-1");
    expect(new Set(sent.map((s) => s.session))).toEqual(new Set(["proof-v3-city-1"]));
    const keys = sent.map((s) => JSON.stringify([s.tool, s.args]));
    expect(new Set(keys).size).toBe(keys.length); // second pass is served from memory
    const board = a.candidates.filter((c) => c.origin === "board");
    const extras = a.candidates.filter((c) => c.origin === "extra");
    expect(board.length).toBe(8);
    expect(a.boardCount).toBe(8);
    expect(extras.length).toBeGreaterThan(0);
    expect(a.playedExtras).toBe(a.decoyExtras);
    expect(extras.filter((c) => c.played)).toHaveLength(a.playedExtras);
    expect(extras.filter((c) => !c.played)).toHaveLength(a.decoyExtras);
    expect(extras.every((c) => c.candidateSource === "backtest_extra")).toBe(true);
    const boardIds = board.map((b) => b.id);
    const playedOff = played.filter((id) => !boardIds.includes(id));
    // stored order does not separate played from decoys: extras are in hash order
    expect(extras.map((c) => c.id)).toEqual(byHash("Art One", extras.map((c) => c.id)));
    expect(extras.filter((c) => c.played).map((c) => c.id).sort()).toEqual(byHash("Art One", playedOff).slice(0, a.playedExtras).sort());
    expect(extras.filter((c) => !c.played).map((c) => c.id).sort()).toEqual(decoyPool("Art One", WORLD, ["Mexico"], played, boardIds).map((c) => c.id).slice(0, a.decoyExtras).sort());
    expect(a.candidateCount).toBe(board.length + extras.length);
    expect(a.candidates.filter((c) => c.played).length * 2).toBeLessThanOrEqual(a.candidateCount);
    expect(a.n).toBe(a.candidates.filter((c) => c.played).length);
    expect(a.chance).toBeCloseTo(a.n / a.candidateCount, 10);
    for (const e of extras) expect(sent.some((s) => s.tool === "qloo_where_popular" && String(s.args.within).startsWith(`${e.name},`))).toBe(true);
    expect(out.callCounts.qloo).toBe(sent.length);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("in 2024");
  });

  it("no leakage: before ranking, a played extra and a decoy extra carry the same fields and the same floor treatment; fan heat among them ties at the floor and breaks by hash", async () => {
    const out = await runCityRank({ cases: [caseOf(1, "Art One", played)], batch: 1, plannedTotal: 12 }, baseDeps(world(), reverseRanker()));
    const a = out.section.artists[0]!;
    const extras = a.candidates.filter((c) => c.origin === "extra");
    const shape = (c: (typeof extras)[number]) => Object.keys(c).filter((k) => k !== "played").sort().join(",");
    expect(new Set(extras.map(shape)).size).toBe(1);
    expect(extras.some((c) => c.played)).toBe(true);
    expect(extras.some((c) => !c.played)).toBe(true);
    expect(extras.every((c) => c.fanHeatFloor === true && c.candidateSource === "backtest_extra")).toBe(true);
    expect(new Set(extras.map((c) => c.fanHeat)).size).toBe(1); // all at the floor
    const fan = a.arms.fan_heat;
    expect(fan.status).toBe("ok");
    if (fan.status !== "ok") return;
    const extraIds = new Set(extras.map((c) => c.id));
    const atFloor = fan.ranking.filter((id) => extraIds.has(id));
    expect(atFloor).toEqual([...atFloor].sort((x, y) => (sha256Hex("Art One" + x) < sha256Hex("Art One" + y) ? -1 : 1)));
  });

  it("reports the board-only R-precision (secondary) over the board's own cities", async () => {
    const out = await runCityRank({ cases: [caseOf(1, "Art One", played)], batch: 1, plannedTotal: 12 }, baseDeps(world(), reverseRanker()));
    const a = out.section.artists[0]!;
    const boardRows = a.candidates.filter((c) => c.origin === "board");
    const n = boardRows.filter((c) => c.played).length;
    expect(a.boardOnly).toMatchObject({ n, count: 8 });
    const byFan = [...boardRows].sort((x, y) => (y.fanHeat ?? -1) - (x.fanHeat ?? -1)).slice(0, n).filter((c) => c.played).length / n;
    expect(a.boardOnly!.fan_heat).toBeCloseTo(byFan, 10);
    expect(out.section.stats.boardOnly.answered).toBe(1);
    expect(out.section.stats.boardOnly.fan_heat).toBeCloseTo(byFan, 10);
  });

  it("re-anchors played cities at load and lists the change on the artist", async () => {
    // A suburb of h1 in the played list: the board folds it into h1, so ground truth does too.
    const suburb: City = { id: "sub1", name: "Subburb", country: "MX", lat: HEAT[0]!.lat + 0.1, lon: HEAT[0]!.lon, population: 150_000 };
    const c = caseOf(1, "Art One", ["h2", "p1", "p2"]);
    c.played.push({ city_id: "sub1", name: "Subburb", country: "MX", shows: 1 });
    const out = await runCityRank({ cases: [c], batch: 1, plannedTotal: 12 }, { ...baseDeps(world(), reverseRanker()), cities: [...WORLD, suburb] });
    const a = out.section.artists[0]!;
    expect(a.anchoring).toEqual([{ from: "Subburb", to: HEAT[0]!.name }]);
    expect(a.candidates.find((x) => x.id === "h1")!.played).toBe(true);
  });

  it("drops an artist when a region's heat lookup is unavailable or empty, and lists the drop", async () => {
    for (const mode of ["error", "empty"] as const) {
      const call: CallTool = async (t, a, s) => (t === "qloo_where_popular" && a.within === "Mexico"
        ? (mode === "error" ? { operation: t, status: "error", summary: "boom", error: { code: "UPSTREAM", retryable: false, recovery: "x" } } : { operation: t, status: "empty", results: [] })
        : world()(t, a, s));
      const out = await runCityRank({ cases: [caseOf(1, "Art One", played)], batch: 1, plannedTotal: 12 }, baseDeps(call, reverseRanker()));
      expect(out.section.artists).toEqual([]);
      expect(out.section.dropped).toEqual([{ position: 1, artist: "Art One", reason: expect.stringMatching(/region heat lookup failed: Mexico/) }]);
    }
  });

  it("ranks all four arms over the same candidates: population by population, LLM from the permutation, others by score with unscored last", async () => {
    const out = await runCityRank({ cases: [caseOf(1, "Art One", played)], batch: 1, plannedTotal: 12 }, baseDeps(world(), reverseRanker()));
    const a = out.section.artists[0]!;
    const allIds = a.candidates.map((c) => c.id).sort();
    for (const arm of ["winnability", "fan_heat", "llm", "population"] as const) {
      const r = a.arms[arm];
      expect(r.status).toBe("ok");
      if (r.status !== "ok") continue;
      expect([...r.ranking].sort()).toEqual(allIds);
      expect(r.rPrecision).toBeCloseTo(r.ranking.slice(0, a.n).filter((id) => played.includes(id)).length / a.n, 10);
      expect(r.hits.length).toBe(Math.round(r.rPrecision * a.n));
    }
    const pop = a.arms.population;
    if (pop.status === "ok") {
      const popOf = (id: string) => a.candidates.find((c) => c.id === id)!.population;
      expect(pop.ranking.map(popOf)).toEqual([...pop.ranking.map(popOf)].sort((x, y) => y - x));
    }
    const fan = a.arms.fan_heat;
    if (fan.status === "ok") {
      const f = (id: string) => a.candidates.find((c) => c.id === id)!.fanHeat;
      const vals = fan.ranking.map(f);
      expect(vals.filter((v) => v !== null)).toEqual([...vals.filter((v): v is number => v !== null)].sort((x, y) => y - x));
    }
    expect(a.llmModel).toBe("fake-model");
    expect(out.section.stats.arms.llm.answered).toBe(1);
  });

  it("an LLM that gives no answer leaves that arm out of its mean and sign test, and the artist still counts for the others", async () => {
    const out = await runCityRank({ cases: [caseOf(1, "Art One", played)], batch: 1, plannedTotal: 12 }, baseDeps(world(), nullRanker));
    const a = out.section.artists[0]!;
    expect(a.arms.llm).toMatchObject({ status: "no_answer", reason: "not_a_permutation" });
    expect(out.section.stats.arms.llm).toEqual({ answered: 0, mean: null });
    expect(out.section.stats.arms.winnability.answered).toBe(1);
    expect(out.section.stats.signTests.vs_llm.pairs).toBe(0);
  });

  it("flags 'board mostly played' and adds nothing", async () => {
    const out = await runCityRank({ cases: [caseOf(1, "Art One", ["h1", "h2", "h3", "h4", "h5", "h6", "p1"])], batch: 1, plannedTotal: 12 }, baseDeps(world(), reverseRanker()));
    const a = out.section.artists[0]!;
    expect(a.boardMostlyPlayed).toBe(true);
    expect(a.playedExtras + a.decoyExtras).toBe(0);
    expect(a.candidates.every((c) => c.origin === "board")).toBe(true);
  });

  it("drops an artist whose board fails and carries on with the next", async () => {
    const callTool: CallTool = async (tool, args, session) => (session === "proof-v3-city-1" && tool === "qloo_describe"
      ? { operation: "describe", status: "error", summary: "no", error: { code: "NOT_FOUND", retryable: false, recovery: "x" } } : world()(tool, args, session));
    const out = await runCityRank({ cases: [caseOf(1, "Missing", played), caseOf(2, "Art Two", played)], batch: 1, plannedTotal: 12 }, baseDeps(callTool, reverseRanker()));
    expect(out.section.dropped).toEqual([{ position: 1, artist: "Missing", reason: expect.stringContaining("NOT_FOUND") }]);
    expect(out.section.artists.map((a) => a.position)).toEqual([2]);
    expect(out.stop).toBeUndefined();
  });

  it("stops at once on a 429: keeps finished artists, drops the partly scored one, lists the rest as not run, sends nothing after", async () => {
    const sent: Sent[] = [];
    const cases = [caseOf(1, "Art One", played), caseOf(2, "Art Two", played), caseOf(3, "Art Three", played)];
    // artist 1 needs roughly 80 calls; fail well inside artist 2
    const firstRun = await runCityRank({ cases: [cases[0]!], batch: 1, plannedTotal: 12 }, baseDeps(world(), reverseRanker()));
    const failAt = firstRun.callCounts.qloo + 10;
    const progress: number[] = [];
    const out = await runCityRank({ cases, batch: 1, plannedTotal: 12 }, baseDeps(world(sent, { failFrom: failAt, failWith: "429" }), reverseRanker()), (s) => progress.push(s.artists.length));
    expect(out.stop).toMatch(/429/);
    expect(out.section.artists.map((a) => a.position)).toEqual([1]);
    expect(out.section.dropped).toEqual([{ position: 2, artist: "Art Two", reason: expect.stringMatching(/partly scored/) }]);
    expect(out.section.notRun).toEqual([{ position: 3, artist: "Art Three" }]);
    // One city is scored at a time, so at most the 5 activation requests already in flight when the 429 arrived can follow it; then nothing is sent.
    expect(sent.length).toBeGreaterThanOrEqual(failAt);
    expect(sent.length - failAt).toBeLessThanOrEqual(4);
    expect(sent.some((s) => s.session === "proof-v3-city-3")).toBe(false);
    expect(progress[0]).toBe(1);
  });

  it("stops on an error rate above 10% over the last 20 calls", async () => {
    const out = await runCityRank({ cases: [caseOf(1, "Art One", played), caseOf(2, "Art Two", played)], batch: 1, plannedTotal: 12 }, baseDeps(world([], { failFrom: 8, failWith: "error" }), reverseRanker()));
    expect(out.stop).toMatch(/error rate/);
    expect(out.section.artists).toEqual([]);
    expect(out.section.dropped.map((d) => d.position)).toEqual([1]);
    expect(out.section.notRun.map((d) => d.position)).toEqual([2]);
  });

  it("a Gemini quota error stops the run too", async () => {
    const monitor = new StopMonitor();
    const ranker = createPermutationRanker({ generate: async () => { throw new Error("Vertex 429"); }, models: ["m1"], monitor });
    const out = await runCityRank({ cases: [caseOf(1, "Art One", played), caseOf(2, "Art Two", played)], batch: 1, plannedTotal: 12 }, baseDeps(world(), ranker, monitor));
    expect(out.stop).toMatch(/429/);
    expect(out.section.artists).toEqual([]);
    expect(out.section.dropped[0]).toMatchObject({ position: 1 });
    expect(out.section.notRun.map((d) => d.position)).toEqual([2]);
  });
});
