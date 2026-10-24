import { runTourBoard, type ScoredCity, type TourBrief } from "../pipeline/tourBoard.js";
import type { City } from "../geo/cities.js";
import type { GatewayEvent } from "../types.js";
import { ARMS, computeCityRankStats, type ArmName, type CandidateRow, type CityArmResult, type CityRankArtist, type CityRankSection } from "./proofResults.js";
import { countryLabel, memoQloo, monitoredCallTool, type CallTool, type PermutationRanker } from "./proofShared.js";
import { sha256Hex, StopRun, type StopMonitor } from "./proofStats.js";

/** Candidate list cap (Amendment 1) and the board size the test asks for (the live default: shortlist 8). */
export const MAX_CANDIDATES = 14;
export const BOARD_MAX_STOPS = 8;

export interface PlayedCity { city_id: string; name: string; country: string; shows: number }
/** One entry of backtest/city/cases.json (ground truth from Wikipedia; no Qloo data). */
export interface CityCase {
  position: number; artist: string; tour_title: string; url: string; revid: number; first_show_year: number;
  regions: string[]; played: PlayedCity[]; unmapped?: unknown; shows?: unknown;
}

/** Order used for ties and for choosing which played cities to add: sha256(artist + city id), hex, ascending. */
const hashKey = (artist: string, id: string): string => sha256Hex(artist + id);
const byHash = (artist: string) => (a: string, b: string): number => { const x = hashKey(artist, a), y = hashKey(artist, b); return x < y ? -1 : x > y ? 1 : 0; };

/**
 * Amendment 1, rule 3. Start from the board's cities; add played cities not already there, in hash order, while the list stays at most
 * MAX_CANDIDATES and the played cities stay at most half of it. If the board already has more played cities than unplayed, add nothing and flag it.
 */
export function selectAdditions(artist: string, boardIds: string[], playedIds: string[]): { added: string[]; boardMostlyPlayed: boolean } {
  const played = new Set(playedIds);
  const onBoard = new Set(boardIds);
  const boardPlayed = boardIds.filter((id) => played.has(id)).length;
  if (boardPlayed * 2 > boardIds.length) return { added: [], boardMostlyPlayed: true };
  const pool = [...played].filter((id) => !onBoard.has(id)).sort(byHash(artist));
  const added: string[] = [];
  let total = boardIds.length, playedNow = boardPlayed;
  for (const id of pool) {
    if (total >= MAX_CANDIDATES || (playedNow + 1) * 2 > total + 1) break;
    added.push(id); total += 1; playedNow += 1;
  }
  return { added, boardMostlyPlayed: false };
}

/** Best first. Scored cities by value (descending), unscored last; ties by the hash order. */
export function rankByScore(artist: string, cands: Array<{ id: string; value: number | null }>): string[] {
  const scored = (v: number | null): v is number => typeof v === "number" && Number.isFinite(v);
  const tie = byHash(artist);
  return [...cands].sort((a, b) => {
    const sa = scored(a.value), sb = scored(b.value);
    if (sa !== sb) return sa ? -1 : 1;
    if (sa && sb && a.value !== b.value) return (b.value as number) - (a.value as number);
    return tie(a.id, b.id);
  }).map((c) => c.id);
}

/** Played cities among the arm's top N, over N (N = played cities in the candidate list). */
export function rPrecision(ranking: string[], played: Set<string>, n: number): number {
  if (n <= 0) throw new Error("R-precision needs at least one played city among the candidates");
  return ranking.slice(0, n).filter((id) => played.has(id)).length / n;
}

/** "Name, Country" labels in alphabetical order. Two cities that would share a label get their coordinates (then id) appended. */
export function llmLabels(cands: Array<{ id: string; name: string; country: string; lat: number; lon: number }>): { labels: string[]; idOf: Map<string, string> } {
  const base = (c: (typeof cands)[number]) => `${c.name}, ${countryLabel(c.country)}`;
  const count = new Map<string, number>();
  for (const c of cands) count.set(base(c), (count.get(base(c)) ?? 0) + 1);
  const withCoords = (c: (typeof cands)[number]) => (count.get(base(c))! > 1 ? `${base(c)} (${c.lat.toFixed(1)}, ${c.lon.toFixed(1)})` : base(c));
  const count2 = new Map<string, number>();
  for (const c of cands) count2.set(withCoords(c), (count2.get(withCoords(c)) ?? 0) + 1);
  const entries = cands.map((c) => [count2.get(withCoords(c))! > 1 ? `${withCoords(c)} #${c.id}` : withCoords(c), c.id] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return { labels: entries.map((e) => e[0]), idOf: new Map(entries) };
}

/** The protocol's fixed prompt, then the candidate list as data (names and countries only, alphabetical). */
export function buildLlmPrompt(artist: string, firstShowYear: number, labels: string[]): string {
  return [
    `You are a concert booking agent. Rank these cities from best to worst for a headline tour by ${artist} in ${firstShowYear}. Return every city exactly once.`,
    "", "Cities:", ...labels.map((l) => `- ${l}`),
  ].join("\n");
}

export class ArtistDropped extends Error {}

export interface CityRankDeps {
  /** The existing gateway HTTP caller (unmonitored; the runner adds the stop rule and the per-artist memory). */
  callTool: CallTool;
  cities: City[];
  ranker: PermutationRanker;
  monitor: StopMonitor;
  today: string;
  log?: (line: string) => void;
}

async function runBoard(brief: TourBrief, qloo: ReturnType<typeof memoQloo>, deps: CityRankDeps): Promise<ScoredCity[]> {
  const scored: ScoredCity[] = [];
  // One city at a time: a stop (429, quota text) can then leave at most one city's parallel requests in flight.
  for await (const e of runTourBoard(brief, { qloo, cities: deps.cities, concurrency: 1 }) as AsyncGenerator<GatewayEvent>) {
    if (e.type === "city_scored") scored.push(e.city as ScoredCity);
    else if (e.type === "needs_input") throw new ArtistDropped(`artist needs input: ${e.summary}`);
    else if (e.type === "error") {
      deps.monitor.assertOk(); // the board reports a call that threw (a stop included) as an INTERNAL error event
      if (e.code === "BUDGET") { deps.monitor.halt(`session budget exhausted (${e.message})`); deps.monitor.assertOk(); }
      throw new ArtistDropped(`board error ${e.code}: ${e.message}`);
    }
  }
  deps.monitor.assertOk(); // the board swallows a per-city failure; a stop must still end the artist
  return scored;
}

const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * One artist, two board passes. The board's own cities come from a first pass with no extras; candidates are computed from them; a second pass
 * adds the played cities as `extraCities`. Every request of the first pass repeats in the second and is served from the per-artist memory, so
 * the second pass costs only the extras. The board cities of both passes must be identical, or the artist is dropped.
 */
export async function scoreArtist(c: CityCase, deps: CityRankDeps): Promise<{ artist: CityRankArtist; qlooHits: number }> {
  const sessionId = `proof-v3-city-${c.position}`;
  const qloo = memoQloo(monitoredCallTool(deps.callTool, deps.monitor));
  const cityById = new Map(deps.cities.map((x) => [x.id, x]));
  const brief: TourBrief = { artist: c.artist, regions: c.regions, maxStops: BOARD_MAX_STOPS, sessionId, today: deps.today };

  const pass1 = await runBoard(brief, qloo, deps);
  if (pass1.length === 0) throw new ArtistDropped("empty board (no scored cities)");
  const boardIds = pass1.map((x) => x.id);
  const playedIds = [...new Set(c.played.map((p) => p.city_id))];
  const { added, boardMostlyPlayed } = selectAdditions(c.artist, boardIds, playedIds);
  const extras = added.map((id) => cityById.get(id)).filter((x): x is City => x !== undefined);
  if (extras.length !== added.length) throw new ArtistDropped("a played city is missing from cities5000");

  let all = pass1;
  if (extras.length > 0) {
    all = await runBoard({ ...brief, extraCities: extras }, qloo, deps);
    const boardAgain = all.filter((x) => x.candidateSource !== "backtest_extra").map((x) => x.id).sort();
    if (JSON.stringify(boardAgain) !== JSON.stringify([...boardIds].sort())) throw new ArtistDropped("board cities changed between the two passes");
    const scoredExtra = new Set(all.filter((x) => x.candidateSource === "backtest_extra").map((x) => x.id));
    const missing = added.filter((id) => !scoredExtra.has(id));
    if (missing.length) throw new ArtistDropped(`extra cities not scored: ${missing.join(", ")}`);
  }

  const played = new Set(playedIds);
  const addedSet = new Set(added);
  const candidates: CandidateRow[] = all.map((s) => ({
    id: s.id, name: s.name, country: s.country, population: cityById.get(s.id)?.population ?? 0,
    origin: addedSet.has(s.id) ? "added_played" : "board", candidateSource: s.candidateSource, played: played.has(s.id),
    winnability: finite(s.winnability.value), fanHeat: finite(s.fanHeat.value), verdict: s.verdict,
    ...(s.fanHeatFloor ? { fanHeatFloor: true as const } : {}), ...(s.insufficientReason ? { insufficientReason: s.insufficientReason } : {}),
  }));
  const n = candidates.filter((x) => x.played).length;
  if (n === 0) throw new ArtistDropped("no played city among the candidates");

  const nameOf = new Map(candidates.map((x) => [x.id, x.name]));
  const ok = (ranking: string[]): CityArmResult => {
    const top = ranking.slice(0, n).filter((id) => played.has(id));
    return { status: "ok", ranking, rPrecision: rPrecision(ranking, played, n), hits: top.map((id) => nameOf.get(id) ?? id) };
  };
  const arms = {} as Record<ArmName, CityArmResult>;
  arms.winnability = ok(rankByScore(c.artist, candidates.map((x) => ({ id: x.id, value: x.winnability }))));
  arms.fan_heat = ok(rankByScore(c.artist, candidates.map((x) => ({ id: x.id, value: x.fanHeat }))));
  arms.population = ok(rankByScore(c.artist, candidates.map((x) => ({ id: x.id, value: x.population }))));
  const { labels, idOf } = llmLabels(all.map((s) => ({ id: s.id, name: s.name, country: s.country, lat: s.lat, lon: s.lon })));
  const answer = await deps.ranker.rank(buildLlmPrompt(c.artist, c.first_show_year, labels), labels);
  arms.llm = answer.order ? ok(answer.order.map((l) => idOf.get(l)!)) : { status: "no_answer", reason: answer.reason ?? "no_answer" };

  return {
    qlooHits: qloo.stats.hits,
    artist: {
      position: c.position, artist: c.artist, tourTitle: c.tour_title, url: c.url, sessionId, regions: c.regions, firstShowYear: c.first_show_year,
      playedTotal: playedIds.length, boardCount: boardIds.length, addedCount: added.length, boardMostlyPlayed,
      candidateCount: candidates.length, n, chance: n / candidates.length, candidates, arms,
      ...(answer.model && answer.order ? { llmModel: answer.model } : {}),
    },
  };
}

export interface CityRankRun { section: CityRankSection; stop?: string; callCounts: StopMonitor["counts"]; geminiUsed: string[] }

/** Artists in order. A stop (429, quota text, error rate) ends the run: finished artists stay, the partly scored one is dropped and listed, the rest are "not run". */
export async function runCityRank(plan: { cases: CityCase[]; batch: number; plannedTotal: number }, deps: CityRankDeps, onProgress?: (s: CityRankSection) => void): Promise<CityRankRun> {
  const artists: CityRankArtist[] = [];
  const dropped: CityRankSection["dropped"] = [];
  const notRun: CityRankSection["notRun"] = [];
  const used = new Set<string>();
  let stop: string | undefined;
  const section = (): CityRankSection => ({ batch: plan.batch, plannedArtists: plan.cases.length, plannedTotal: plan.plannedTotal, artists, dropped, notRun, stats: computeCityRankStats(artists) });
  for (const c of plan.cases) {
    if (stop) { notRun.push({ position: c.position, artist: c.artist }); continue; }
    try {
      const { artist } = await scoreArtist(c, deps);
      artists.push(artist);
      if (artist.llmModel) used.add(artist.llmModel);
      deps.log?.(`city-rank ${c.position} ${c.artist}: N=${artist.n}/${artist.candidateCount} winnability=${(artist.arms.winnability as { rPrecision: number }).rPrecision.toFixed(2)} | qloo ${deps.monitor.counts.qloo} gemini ${deps.monitor.counts.gemini}`);
    } catch (err) {
      if (err instanceof StopRun) {
        stop = err.reason;
        dropped.push({ position: c.position, artist: c.artist, reason: `partly scored when the run stopped (${err.reason})` });
        deps.log?.(`STOP: ${err.reason}`);
      } else {
        const reason = err instanceof ArtistDropped ? err.message : `unexpected error: ${String((err as Error)?.message ?? err)}`;
        dropped.push({ position: c.position, artist: c.artist, reason });
        deps.log?.(`city-rank ${c.position} ${c.artist}: dropped (${reason})`);
      }
    }
    onProgress?.(section());
  }
  return { section: section(), ...(stop ? { stop } : {}), callCounts: { ...deps.monitor.counts }, geminiUsed: [...used] };
}
