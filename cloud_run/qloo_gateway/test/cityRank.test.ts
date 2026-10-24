import { describe, expect, it } from "vitest";
import { buildLlmPrompt, llmLabels, MAX_CANDIDATES, rankByScore, rPrecision, runCityRank, selectAdditions, type CityCase } from "../src/backtest/cityRank.js";
import { createPermutationRanker, type CallTool, type PermutationRanker } from "../src/backtest/proofShared.js";
import { sha256Hex, StopMonitor } from "../src/backtest/proofStats.js";
import type { City } from "../src/geo/cities.js";
import type { QlooEnvelope } from "../src/types.js";
import { describeOk, recs } from "./fixtures/envelopes.js";

const byHash = (artist: string, ids: string[]) => [...ids].sort((a, b) => sha256Hex(artist + a).localeCompare(sha256Hex(artist + b)));
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

describe("selectAdditions (Amendment 1, rule 3)", () => {
  it("adds played cities in sha256(artist + city id) order up to 14, never more than half played", () => {
    const board = ids("b", 8); // none played
    const played = ids("p", 12);
    const r = selectAdditions("Artist", board, played);
    expect(r.boardMostlyPlayed).toBe(false);
    expect(r.added).toEqual(byHash("Artist", played).slice(0, 6)); // 8 + 6 = 14, 6 of 14 played
    expect(board.length + r.added.length).toBe(MAX_CANDIDATES);
  });
  it("more played than unplayed on the board: nothing is added (5 of 8 played)", () => {
    const board = ids("b", 8);
    const played = [...board.slice(0, 5), ...ids("p", 10)]; // 5 of 8 played already: 5/8 > half, so more played would break the balance
    const r = selectAdditions("A", board, played);
    expect(r.boardMostlyPlayed).toBe(true);
    expect(r.added).toEqual([]);
  });
  it("exactly half played on the board still adds nothing (one more would exceed half) and is not flagged", () => {
    const board = ids("b", 8);
    const r = selectAdditions("A", board, [...board.slice(0, 4), ...ids("p", 5)]);
    expect(r.added).toEqual([]);
    expect(r.boardMostlyPlayed).toBe(false);
  });
  it("the played share of the final list never exceeds half and the list never exceeds 14, for many boards", () => {
    for (const boardSize of [3, 8, 11, 13, 14, 15]) for (const boardPlayed of [0, 1, 2, 3, 5]) {
      if (boardPlayed > boardSize) continue;
      const board = ids("b", boardSize);
      const playedIds = [...board.slice(0, boardPlayed), ...ids("p", 30)];
      const r = selectAdditions("Z", board, playedIds);
      const total = boardSize + r.added.length, played = boardPlayed + r.added.length;
      if (!r.boardMostlyPlayed) expect(played * 2).toBeLessThanOrEqual(Math.max(total, boardPlayed * 2));
      expect(total).toBeLessThanOrEqual(Math.max(MAX_CANDIDATES, boardSize));
      expect(r.added.every((a) => !board.includes(a))).toBe(true);
    }
  });
  it("a board mostly played keeps every board city, adds nothing, and flags it; played cities already on the board are never re-added", () => {
    const board = ids("b", 6);
    const r = selectAdditions("A", board, [...board.slice(0, 4), "q1", "q2"]);
    expect(r).toEqual({ added: [], boardMostlyPlayed: true });
    const r2 = selectAdditions("A", board, [board[0]!, board[0]!, "q1"]);
    expect(r2.added).toEqual(["q1"]);
  });
  it("a different artist orders the same played cities differently", () => {
    const played = ids("p", 12);
    expect(selectAdditions("One", ids("b", 8), played).added).not.toEqual(selectAdditions("Two", ids("b", 8), played).added);
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
const HEAT = Array.from({ length: 10 }, (_, i) => mk(`h${i + 1}`, `Heatville${i + 1}`, i, 2_000_000 - i * 150_000));
const ONLY = Array.from({ length: 6 }, (_, i) => mk(`p${i + 1}`, `Playville${i + 1}`, 10 + i, 900_000 - i * 40_000));
const WORLD = [...HEAT, ...ONLY];
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

  it("builds candidates from the board then added played cities, scores the extras with a second pass, and never repeats a request", async () => {
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
    const added = a.candidates.filter((c) => c.origin === "added_played");
    expect(board.length).toBe(8);
    expect(a.boardCount).toBe(8);
    expect(a.addedCount).toBe(added.length);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((c) => c.played && c.candidateSource === "backtest_extra")).toBe(true);
    expect(added.map((c) => c.id)).toEqual(byHash("Art One", ["p1", "p2", "p3", "p4"].filter((id) => !board.some((b) => b.id === id))).slice(0, added.length));
    expect(added.every((c) => c.fanHeatFloor === true)).toBe(true); // none of them is in Qloo's heat list
    expect(a.candidateCount).toBe(board.length + added.length);
    expect(a.candidates.filter((c) => c.played).length * 2).toBeLessThanOrEqual(a.candidateCount);
    expect(a.n).toBe(a.candidates.filter((c) => c.played).length);
    expect(a.chance).toBeCloseTo(a.n / a.candidateCount, 10);
    // second pass only costs the extras
    expect(sent.filter((s) => s.tool === "qloo_where_popular" && String(s.args.within).startsWith("Playville")).length).toBeGreaterThanOrEqual(added.length);
    expect(out.callCounts.qloo).toBe(sent.length);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("in 2024");
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
    expect(a.addedCount).toBe(0);
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
