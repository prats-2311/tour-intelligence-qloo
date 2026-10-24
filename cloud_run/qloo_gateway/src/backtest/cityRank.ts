import { runTourBoard, type ScoredCity, type TourBrief } from "../pipeline/tourBoard.js";
import type { City } from "../geo/cities.js";
import { anchorCity } from "../geo/heat.js";
import { countryCodeFor } from "../geo/location.js";
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

/** Order used for choosing decoys: sha256(artist + "decoy" + city id). */
const decoyKey = (artist: string, id: string): string => sha256Hex(`${artist}decoy${id}`);

/**
 * Played cities re-anchored with the board's own anchoring function (Amendment 2.4), so the ground truth and the board use the same city ids.
 * Shows of cities that anchor to one city are added; every change is listed.
 */
export function reanchorPlayed(cities: City[], played: PlayedCity[]): { played: PlayedCity[]; changes: Array<{ from: string; to: string }> } {
  const byId = new Map(cities.map((c) => [c.id, c]));
  const out = new Map<string, PlayedCity>();
  const changes: Array<{ from: string; to: string }> = [];
  for (const p of played) {
    const c = byId.get(p.city_id);
    const anchor = c ? anchorCity(c, cities) ?? c : undefined;
    if (!anchor) { out.set(p.city_id, p); continue; }
    if (anchor.id !== p.city_id) changes.push({ from: p.name, to: anchor.name });
    const prev = out.get(anchor.id);
    out.set(anchor.id, prev ? { ...prev, shows: prev.shows + p.shows } : { city_id: anchor.id, name: anchor.name, country: anchor.country, shows: p.shows });
  }
  return { played: [...out.values()], changes };
}

/**
 * Unplayed decoys (Amendment 2.1): cities5000 cities in the artist's regions (ISO-2 of each country region) that were not played, are not already
 * candidates, are their own board anchor (the location-check rules: a suburb the board would fold into a bigger city is not a market) and have
 * population >= the smallest played city. Best first by sha256(artist + "decoy" + city id).
 */
export function decoyPool(artist: string, cities: City[], regions: string[], playedIds: string[], boardIds: string[]): City[] {
  const byId = new Map(cities.map((c) => [c.id, c]));
  const countries = new Set(regions.map((r) => countryCodeFor(r)).filter((c): c is string => c !== undefined));
  const minPop = Math.min(...playedIds.map((id) => byId.get(id)?.population ?? Infinity));
  const taken = new Set([...playedIds, ...boardIds]);
  return cities
    .filter((c) => countries.has(c.country) && !taken.has(c.id) && c.population >= minPop && anchorCity(c, cities)?.id === c.id)
    .sort((x, y) => { const a = decoyKey(artist, x.id), b = decoyKey(artist, y.id); return a < b ? -1 : a > b ? 1 : 0; });
}

/**
 * Amendment 2.1 (replacing Amendment 1's played-only additions). After the board's cities, extras are added in pairs: one played city (in
 * sha256(artist + city id) order), then one unplayed decoy (`decoys`, already in decoy order), while the list stays at most 14 and the played
 * cities at most half. A board with more played than unplayed cities adds nothing and is flagged.
 */
export function selectExtras(artist: string, boardIds: string[], playedIds: string[], decoyIds: string[]): { played: string[]; decoys: string[]; boardMostlyPlayed: boolean } {
  const played = new Set(playedIds);
  const onBoard = new Set(boardIds);
  const boardPlayed = boardIds.filter((id) => played.has(id)).length;
  if (boardPlayed * 2 > boardIds.length) return { played: [], decoys: [], boardMostlyPlayed: true };
  const playedPool = [...played].filter((id) => !onBoard.has(id)).sort(byHash(artist));
  const decoyPoolIds = decoyIds.filter((id) => !played.has(id) && !onBoard.has(id));
  const out = { played: [] as string[], decoys: [] as string[], boardMostlyPlayed: false };
  let total = boardIds.length, playedNow = boardPlayed;
  for (let i = 0; i < Math.min(playedPool.length, decoyPoolIds.length); i += 1) {
    if (total + 2 > MAX_CANDIDATES || (playedNow + 1) * 2 > total + 2) break;
    out.played.push(playedPool[i]!); out.decoys.push(decoyPoolIds[i]!);
    total += 2; playedNow += 1;
  }
  return out;
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
  const regionProblems: string[] = [];
  // One city at a time: a stop (429, quota text) can then leave at most one city's parallel requests in flight.
  for await (const e of runTourBoard(brief, { qloo, cities: deps.cities, concurrency: 1 }) as AsyncGenerator<GatewayEvent>) {
    if (e.type === "city_scored") scored.push(e.city as ScoredCity);
    else if (e.type === "region_unavailable") regionProblems.push(`${e.region} unavailable (${e.code})`);
    else if (e.type === "region_empty") regionProblems.push(`${e.region} empty`);
    else if (e.type === "needs_input") throw new ArtistDropped(`artist needs input: ${e.summary}`);
    else if (e.type === "error") {
      deps.monitor.assertOk(); // the board reports a call that threw (a stop included) as an INTERNAL error event
      if (e.code === "BUDGET") { deps.monitor.halt(`session budget exhausted (${e.message})`); deps.monitor.assertOk(); }
      throw new ArtistDropped(`board error ${e.code}: ${e.message}`);
    }
  }
  deps.monitor.assertOk(); // the board swallows a per-city failure; a stop must still end the artist
  // A region with no heat list silently shrinks the board: the artist is dropped and the drop is listed, never scored on part of its regions.
  if (regionProblems.length) throw new ArtistDropped(`region heat lookup failed: ${regionProblems.join("; ")}`);
  return scored;
}

const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * One artist, two board passes. The board's own cities come from a first pass with no extras; the extras (Amendment 2.1: played/decoy pairs)
 * are computed from them; a second pass adds them as `extraCities`. Every request of the first pass repeats in the second and is served from the
 * per-artist memory, so the second pass costs only the extras. The board cities of both passes must be identical, or the artist is dropped.
 * Arms rank a blind candidate list: nothing in it tells a played extra from a decoy extra.
 */
export async function scoreArtist(c: CityCase, deps: CityRankDeps): Promise<{ artist: CityRankArtist }> {
  const sessionId = `proof-v3-city-${c.position}`;
  const qloo = memoQloo(monitoredCallTool(deps.callTool, deps.monitor));
  const cityById = new Map(deps.cities.map((x) => [x.id, x]));
  const brief: TourBrief = { artist: c.artist, regions: c.regions, maxStops: BOARD_MAX_STOPS, sessionId, today: deps.today };
  const anchored = reanchorPlayed(deps.cities, c.played);
  const playedIds = anchored.played.map((p) => p.city_id);

  const pass1 = await runBoard(brief, qloo, deps);
  if (pass1.length === 0) throw new ArtistDropped("empty board (no scored cities)");
  const boardIds = pass1.map((x) => x.id);
  const decoys = decoyPool(c.artist, deps.cities, c.regions, playedIds, boardIds).map((d) => d.id);
  const sel = selectExtras(c.artist, boardIds, playedIds, decoys);
  // Hash order, so the stored order does not separate played extras from decoys.
  const addedIds = [...sel.played, ...sel.decoys].sort(byHash(c.artist));
  const extras = addedIds.map((id) => cityById.get(id)).filter((x): x is City => x !== undefined);
  if (extras.length !== addedIds.length) throw new ArtistDropped("an extra city is missing from cities5000");

  let all = pass1;
  if (extras.length > 0) {
    all = await runBoard({ ...brief, extraCities: extras }, qloo, deps);
    const boardAgain = all.filter((x) => x.candidateSource !== "backtest_extra").map((x) => x.id).sort();
    if (JSON.stringify(boardAgain) !== JSON.stringify([...boardIds].sort())) throw new ArtistDropped("board cities changed between the two passes");
    const scoredExtra = new Set(all.filter((x) => x.candidateSource === "backtest_extra").map((x) => x.id));
    const missing = addedIds.filter((id) => !scoredExtra.has(id));
    if (missing.length) throw new ArtistDropped(`extra cities not scored: ${missing.join(", ")}`);
  }

  // The blind list: everything an arm may read. No ground truth, no played/decoy marker.
  const blind = all.map((s) => ({
    id: s.id, name: s.name, country: s.country, population: cityById.get(s.id)?.population ?? 0,
    origin: boardIds.includes(s.id) ? ("board" as const) : ("extra" as const), candidateSource: s.candidateSource,
    winnability: finite(s.winnability.value), fanHeat: finite(s.fanHeat.value), verdict: s.verdict,
    ...(s.fanHeatFloor ? { fanHeatFloor: true as const } : {}), ...(s.insufficientReason ? { insufficientReason: s.insufficientReason } : {}),
  }));
  const played = new Set(playedIds);
  const n = blind.filter((x) => played.has(x.id)).length;
  if (n === 0) throw new ArtistDropped("no played city among the candidates");

  const nameOf = new Map(blind.map((x) => [x.id, x.name]));
  const ok = (ranking: string[]): CityArmResult => {
    const top = ranking.slice(0, n).filter((id) => played.has(id));
    return { status: "ok", ranking, rPrecision: rPrecision(ranking, played, n), hits: top.map((id) => nameOf.get(id) ?? id) };
  };
  const winRank = rankByScore(c.artist, blind.map((x) => ({ id: x.id, value: x.winnability })));
  const fanRank = rankByScore(c.artist, blind.map((x) => ({ id: x.id, value: x.fanHeat })));
  const arms = {} as Record<ArmName, CityArmResult>;
  arms.winnability = ok(winRank);
  arms.fan_heat = ok(fanRank);
  arms.population = ok(rankByScore(c.artist, blind.map((x) => ({ id: x.id, value: x.population }))));
  const { labels, idOf } = llmLabels(all.map((s) => ({ id: s.id, name: s.name, country: s.country, lat: s.lat, lon: s.lon })));
  const answer = await deps.ranker.rank(buildLlmPrompt(c.artist, c.first_show_year, labels), labels);
  arms.llm = answer.order ? ok(answer.order.map((l) => idOf.get(l)!)) : { status: "no_answer", reason: answer.reason ?? "no_answer" };

  // Secondary (Amendment 2.2): the same two Qloo arms over the board's own cities only, where both have real Qloo fan heat.
  const boardSet = new Set(boardIds);
  const nBoard = boardIds.filter((id) => played.has(id)).length;
  const boardR = (ranking: string[]) => rPrecision(ranking.filter((id) => boardSet.has(id)), played, nBoard);
  const boardOnly = nBoard > 0 ? { n: nBoard, count: boardIds.length, winnability: boardR(winRank), fan_heat: boardR(fanRank) } : null;

  return {
    artist: {
      position: c.position, artist: c.artist, tourTitle: c.tour_title, url: c.url, sessionId, regions: c.regions, firstShowYear: c.first_show_year,
      playedTotal: playedIds.length, boardCount: boardIds.length, playedExtras: sel.played.length, decoyExtras: sel.decoys.length, boardMostlyPlayed: sel.boardMostlyPlayed,
      anchoring: anchored.changes, boardOnly,
      candidateCount: blind.length, n, chance: n / blind.length, candidates: blind.map((x) => ({ ...x, played: played.has(x.id) })), arms,
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
