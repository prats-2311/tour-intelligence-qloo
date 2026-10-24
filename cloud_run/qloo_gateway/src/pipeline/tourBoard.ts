import { extractEntities, extractHeatPoints, extractIssues, extractMusicTags, extractTrendPoints } from "../extract.js";
import type { City } from "../geo/cities.js";
import { locationQueries, locationResolved } from "../geo/location.js";
import { majorMarkets } from "./majorMarkets.js";
import { marketsFromHeat, zonesFromHeat } from "../geo/heat.js";
import type { CallResult, QlooCaller } from "../qlooCall.js";
import { activation, fanConcentration, meanTopK, type ComponentName } from "../scoring/activation.js";
import { SCORING } from "../scoring/calibration.js";
import { concentrationValue, isThin, rescaleAffinity } from "../scoring/config.js";
import { fanHeat } from "../scoring/fanHeat.js";
import { CLOSE_CALL_BAND, closeCall, verdict, winnability } from "../scoring/winnability.js";
import { artistTasteArgs } from "./recArgs.js";
import { noVenuesCopy, sameCityVenues, venueArgs } from "./venues.js";
import type { DataWarning, EvidenceRef, GatewayEvent, Score, Verdict } from "../types.js";

export interface TourBrief { artist: string; artistEntityId?: string; regions: string[]; maxStops: number; sessionId: string; today: string }
export interface ScoredCity {
  id: string; name: string; country: string; lat: number; lon: number;
  fanHeat: Score; activation: Score & { components: Partial<Record<ComponentName, number>>; rawComponents?: Partial<Record<ComponentName, number>> }; winnability: Score; verdict: Verdict; closeCall: boolean;
  zones: ReturnType<typeof zonesFromHeat>;
  warnings: DataWarning[];
  /** Machine-readable reason a city has no activation score (today only "location_unresolved"). */
  insufficientReason?: "location_unresolved";
  /** Where the city came from: Qloo's regional fan-heat list, or the largest market of a brief region that the list did not contain. */
  candidateSource: "heat" | "major_market";
  /** True when fan heat is the board's floor (the minimum among heat candidates) because Qloo's heat list does not include this city: no Qloo evidence. */
  fanHeatFloor?: true;
  /** The query string Qloo resolved this city with, and how many in-city lookups it took (unresolved: all that were tried). */
  locationQuery?: string;
  locationAttempts?: number;
}
interface Deps { qloo: QlooCaller; cities: City[]; signal?: AbortSignal; concurrency?: number }

const SHORTLIST = 8;
/** Largest board (scored cities) once major-market seeds are added; a longer shortlist gets no seeds. */
const MAX_BOARD_WITH_SEEDS = 11;
const MID_BAND = { min: 45, max: 70 };
const MID_CENTRE = (MID_BAND.min + MID_BAND.max) / 2;

/** Pick exactly min(shortlist size, pool) markets to score: the hottest half, then mid-band fan heat (where hidden goldmines live), then the next hottest. */
export function pickCandidates<T extends { city: { id: string } }>(pooled: T[], heat: Map<string, Score>, size: number): T[] {
  const h = (m: T) => heat.get(m.city.id)?.value ?? -1;
  const hottest = [...pooled].sort((a, b) => h(b) - h(a));
  const chosen = hottest.slice(0, Math.ceil(size / 2));
  const taken = new Set(chosen);
  const mid = hottest.filter((m) => !taken.has(m) && h(m) >= MID_BAND.min && h(m) < MID_BAND.max)
    .sort((a, b) => Math.abs(h(a) - MID_CENTRE) - Math.abs(h(b) - MID_CENTRE));
  for (const m of mid) { if (chosen.length >= size) break; chosen.push(m); taken.add(m); }
  for (const m of hottest) { if (chosen.length >= size) break; if (!taken.has(m)) { chosen.push(m); taken.add(m); } }
  return chosen;
}
const ref = (tool: string, r: CallResult, resultIndex?: number): EvidenceRef => ({ tool, cacheKey: r.cacheKey, ...(resultIndex !== undefined ? { resultIndex } : {}) });

export class Aborted extends Error {}
export class BudgetStop extends Error {}
const budgetHit = new WeakSet<object>();

function warningsOf(tool: string, r: CallResult): DataWarning[] {
  const e = r.envelope;
  const out: DataWarning[] = [];
  if (e.status === "error") {
    const message = e.summary ?? e.error?.recovery;
    out.push({ tool, kind: "error", ...(e.error?.code ? { code: e.error.code } : {}), ...(message ? { message } : {}) });
  } else if (e.status === "partial" || e.status === "degraded") {
    out.push({ tool, kind: e.status, ...(e.summary ? { message: e.summary } : {}) });
  }
  if (r.stale) out.push({ tool, kind: "stale" });
  return out;
}

const dedupeWarnings = (ws: DataWarning[]): DataWarning[] => [...new Map(ws.map((w) => [JSON.stringify(w), w])).values()];

/** Like Promise.all, but waits for every sibling to settle before rejecting (no events pushed after we return). */
async function settleAll<T extends readonly unknown[]>(ps: { [K in keyof T]: Promise<T[K]> }): Promise<T> {
  const settled = await Promise.allSettled(ps as readonly Promise<unknown>[]);
  const bad = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected").map((s) => s.reason);
  if (bad.length) throw bad.find((b) => b instanceof Aborted || b instanceof BudgetStop) ?? bad[0];
  return settled.map((s) => (s as PromiseFulfilledResult<unknown>).value) as unknown as T;
}

async function call(deps: Deps, sessionId: string, tool: string, args: Record<string, unknown>, events: GatewayEvent[]): Promise<CallResult> {
  if (deps.signal?.aborted) throw new Aborted();
  if (budgetHit.has(deps)) throw new BudgetStop("session budget exhausted");
  const r = await deps.qloo.call(tool, args, sessionId);
  events.push({ type: "tool_call", tool, args, cached: r.cached });
  events.push({ type: "tool_result", tool, status: r.envelope.status, resultCount: Array.isArray(r.envelope.results) ? r.envelope.results.length : 0, cacheKey: r.cacheKey, stale: r.stale });
  if (r.envelope.status === "error" && r.envelope.error?.code === "BUDGET") {
    budgetHit.add(deps);
    throw new BudgetStop(r.envelope.summary ?? "session budget exhausted");
  }
  return r;
}

export { call as trackedCall };

export type LocationResolution =
  | { status: "resolved"; where: string; inCity: CallResult; attempts: number }
  | { status: "unresolved"; attempts: number; tried: string[] };

/**
 * Qloo only gets a city as a fuzzy location query, so it can place it somewhere else entirely. Try each query string in order
 * (the original first, so cached boards keep serving) until the in-city heat points sit near the city. A string passes only on an
 * answer that checks out: an error, empty or far-away answer (cached or not) is a miss. No string passing means unresolved; a city is
 * never scored on an unchecked string. Shared by the board and the playbook.
 */
export async function resolveLocation(artist: string, city: { name: string; country: string; lat: number; lon: number }, deps: Deps, sessionId: string, events: GatewayEvent[]): Promise<LocationResolution> {
  const tried: string[] = [];
  for (const where of locationQueries(city)) {
    const inCity = await call(deps, sessionId, "qloo_where_popular", { entity: artist, entity_type: "artist", within: where, limit: 20 }, events);
    tried.push(where);
    if (inCity.envelope.status === "error") continue;
    if (locationResolved(city, extractHeatPoints(inCity.envelope))) return { status: "resolved", where, inCity, attempts: tried.length };
  }
  return { status: "unresolved", attempts: tried.length, tried };
}

export async function activationInputs(artist: string, loc: { where: string; inCity: CallResult; city: { name: string; country: string } }, deps: Deps, sessionId: string, events: GatewayEvent[], venueFallbackMessage = "venue ranking unresolved — showing place recommendations") {
  const { where, inCity } = loc;
  const [brands, places, films, artists, tv] = await settleAll([
    call(deps, sessionId, "qloo_recommend", artistTasteArgs("brand", artist, where, 10), events),
    call(deps, sessionId, "qloo_recommend", venueArgs(artist, where), events),
    call(deps, sessionId, "qloo_recommend", { target_type: "movie", signals: [artist], signal_location: where, limit: 10 }, events),
    call(deps, sessionId, "qloo_recommend", artistTasteArgs("artist", artist, where, 10), events),
    call(deps, sessionId, "qloo_recommend", { target_type: "tv_show", signals: [artist], signal_location: where, limit: 10 }, events),
  ] as const);
  // Only real venues in this city count: Qloo also returns places in neighbouring towns and countries, and ones with no geocode.
  const placeEntities = sameCityVenues(extractEntities(places.envelope), loc.city, where);
  // F6: qloo_rank needs entity ids; names come back as needs_input with candidates.
  const venueIds = placeEntities.map((e) => e.entityId);
  const ranked = venueIds.length > 0
    ? await call(deps, sessionId, "qloo_rank", { options: venueIds, option_type: "place", signals: [artist], signal_location: where }, events)
    : undefined;
  const rankedVenues = ranked ? extractEntities(ranked.envelope) : [];
  const venueFallback = ranked !== undefined && rankedVenues.length === 0;
  const venues = {
    items: venueFallback ? [...placeEntities].sort((a, b) => (Number.isNaN(b.affinity) ? -1 : b.affinity) - (Number.isNaN(a.affinity) ? -1 : a.affinity)).slice(0, 3) : rankedVenues.slice(0, 3),
    refs: ranked && !venueFallback ? [ref("qloo_rank", ranked)] : placeEntities.length > 0 ? [ref("qloo_recommend", places)] : [],
    warnings: venueFallback ? [{ tool: "qloo_rank", kind: "partial" as const, message: venueFallbackMessage }]
      : placeEntities.length === 0 ? [{ tool: "qloo_recommend", kind: "partial" as const, message: noVenuesCopy(loc.city.name) }] : [],
  };

  const zones = zonesFromHeat(extractHeatPoints(inCity.envelope), deps.cities);
  const rawComponents: Partial<Record<ComponentName, number>> = {};
  const components: Partial<Record<ComponentName, { value: number; refs: EvidenceRef[] }>> = {};
  const sponsor = meanTopK(extractEntities(brands.envelope).map((e) => e.affinity), 5);
  if (sponsor !== null) {
    rawComponents.sponsor_fit = sponsor;
    components.sponsor_fit = { value: rescaleAffinity(sponsor, SCORING.affinityFloors.sponsor_fit), refs: [ref("qloo_recommend", brands)] };
  }
  const hooks = meanTopK([...placeEntities, ...extractEntities(films.envelope), ...extractEntities(artists.envelope), ...extractEntities(tv.envelope)].map((e) => e.affinity), 5);
  if (hooks !== null) {
    rawComponents.local_hooks = hooks;
    components.local_hooks = { value: rescaleAffinity(hooks, SCORING.affinityFloors.local_hooks), refs: [...(placeEntities.length > 0 ? [ref("qloo_recommend", places)] : []), ref("qloo_recommend", films), ref("qloo_recommend", artists), ref("qloo_recommend", tv)] };
  }
  const shares = zones.map((z) => z.share);
  const conc = fanConcentration(shares);
  if (conc !== null) rawComponents.fan_concentration = conc;
  const concScored = concentrationValue(shares, SCORING.concentration);
  if (concScored !== null) components.fan_concentration = { value: concScored, refs: [ref("qloo_where_popular", inCity)] };
  const venue = ranked ? meanTopK(rankedVenues.map((e) => e.affinity), 1) : null;
  if (venue !== null && ranked) {
    rawComponents.venue_fit = venue;
    components.venue_fit = { value: rescaleAffinity(venue, SCORING.affinityFloors.venue_fit), refs: [ref("qloo_rank", ranked)] };
  }

  const warnings = dedupeWarnings([
    ...warningsOf("qloo_recommend", brands), ...warningsOf("qloo_recommend", places), ...warningsOf("qloo_recommend", films),
    ...warningsOf("qloo_recommend", artists), ...warningsOf("qloo_recommend", tv), ...warningsOf("qloo_where_popular", inCity),
    ...(ranked ? warningsOf("qloo_rank", ranked) : []),
    ...venues.warnings,
  ]);
  return { components, rawComponents, zones, warnings, venues, placeEntities, raw: { brands, places, films, artists, tv, inCity, ranked } };
}

export async function* runTourBoard(brief: TourBrief, deps: Deps): AsyncGenerator<GatewayEvent> {
  const events: GatewayEvent[] = [];
  const flush = function* () { while (events.length) yield events.shift()!; };
  const scored: ScoredCity[] = [];
  try {
    let artistName = brief.artist;
    let entityId = brief.artistEntityId;
    if (!entityId) {
      let d: CallResult;
      try {
        d = await call(deps, brief.sessionId, "qloo_describe", { entity: brief.artist, type: "artist" }, events);
      } finally {
        yield* flush();
      }
      if (d.envelope.status === "needs_input") {
        const issue = extractIssues(d.envelope)[0];
        yield { type: "needs_input", field: issue?.field ?? "entity", candidates: issue?.candidates ?? [], summary: d.envelope.summary ?? "Choose the intended artist." };
        return;
      }
      if (d.envelope.status === "error") {
        yield { type: "error", code: d.envelope.error?.code ?? "UNKNOWN", message: d.envelope.summary ?? d.envelope.error?.recovery ?? "Live Qloo data unavailable" };
        return;
      }
      const top = extractEntities(d.envelope)[0];
      if (!top) { yield { type: "error", code: "NOT_FOUND", message: `Qloo has no artist matching "${brief.artist}"` }; return; }
      entityId = top.entityId;
      artistName = top.name;
    }
    yield { type: "resolve", entity: { entityId, name: artistName } };
    yield { type: "scoring", scoring: SCORING, closeCallBand: CLOSE_CALL_BAND };
    const signalArtist = entityId; // harness accepts Qloo UUIDs as entity inputs

    // Window ends on the Monday of the week so the cache key is stable for 7 days: a cached board costs at most one trends call a week.
    const today = new Date(`${brief.today}T00:00:00Z`);
    const end = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * 86_400_000);
    const endDate = end.toISOString().slice(0, 10);
    const start = new Date(end.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
    let demo!: CallResult, tags!: CallResult, trends!: CallResult;
    let heatCalls!: Array<{ region: string; r: CallResult }>;
    try {
      [demo, tags, trends, heatCalls] = await settleAll([
        call(deps, brief.sessionId, "qloo_audience_demographics", { entity: signalArtist, entity_type: "artist" }, events),
        call(deps, brief.sessionId, "qloo_entity_tags", { entities: [signalArtist], entity_type: "artist", limit: 10 }, events),
        call(deps, brief.sessionId, "qloo_trends", { entities: [signalArtist], entity_type: "artist", start_date: start, end_date: endDate }, events),
        settleAll(brief.regions.map(async (region) => ({
          region, r: await call(deps, brief.sessionId, "qloo_where_popular", { entity: signalArtist, entity_type: "artist", within: region, limit: 20 }, events),
        }))),
      ] as const);
    } finally {
      yield* flush();
    }
    yield {
      type: "artist_profile",
      demographics: Array.isArray(demo.envelope.results) ? demo.envelope.results : [],
      tags: extractMusicTags(tags.envelope).map((t) => ({ name: t.name, affinity: t.affinity })),
      trends: extractTrendPoints(trends.envelope),
      refs: [ref("qloo_audience_demographics", demo), ref("qloo_entity_tags", tags), ref("qloo_trends", trends)],
      warnings: dedupeWarnings([...warningsOf("qloo_audience_demographics", demo), ...warningsOf("qloo_entity_tags", tags), ...warningsOf("qloo_trends", trends)]),
    };

    type Market = { city: City; affinity: number; popularity: number; refs: EvidenceRef[]; warnings: DataWarning[] };
    const byId = new Map<string, Market>();
    for (const { region, r } of heatCalls) {
      const points = extractHeatPoints(r.envelope);
      if (points.length === 0) {
        if (r.envelope.status === "error") {
          yield { type: "region_unavailable", region, code: r.envelope.error?.code ?? "UNKNOWN", message: r.envelope.summary ?? r.envelope.error?.recovery ?? "Live Qloo data unavailable" };
        } else {
          yield { type: "region_empty", region };
        }
        continue;
      }
      const warnings = warningsOf("qloo_where_popular", r);
      for (const m of marketsFromHeat(points, deps.cities)) {
        const prev = byId.get(m.city.id);
        if (!prev) { byId.set(m.city.id, { city: m.city, affinity: m.affinity, popularity: m.popularity, refs: [ref("qloo_where_popular", r)], warnings: [...warnings] }); continue; }
        prev.affinity = Math.max(prev.affinity, m.affinity);
        prev.popularity = Math.max(prev.popularity, m.popularity);
        prev.refs.push(ref("qloo_where_popular", r));
        prev.warnings = dedupeWarnings([...prev.warnings, ...warnings]);
      }
    }
    const pooled = [...byId.values()];

    const heat = fanHeat(pooled.map((m) => ({ id: m.city.id, affinity: m.affinity, popularity: m.popularity, refs: m.refs })));
    const picked = pickCandidates(pooled, heat, Math.max(SHORTLIST, brief.maxStops));
    // Major markets we always check: the largest city of each country region, at most MAX_MAJOR_MARKETS. One already in the heat pool is
    // a heat candidate (added if the shortlist skipped it); one absent from Qloo's list gets the board's fan-heat floor and no Qloo evidence.
    const seeds = pooled.length > 0 ? majorMarkets(brief.regions, deps.cities) : [];
    const shortlist: Array<(typeof pooled)[number] & { source: "heat" | "major_market" }> = picked.map((m) => ({ ...m, source: "heat" as const }));
    const have = new Set(shortlist.map((m) => m.city.id));
    // Seeds never push the board past max(MAX_BOARD_WITH_SEEDS, the shortlist size): a big board is already near the session budget.
    const cap = Math.max(MAX_BOARD_WITH_SEEDS, picked.length);
    for (const seed of seeds) {
      const inPool = byId.get(seed.id);
      if (inPool && !have.has(seed.id) && shortlist.length < cap) { shortlist.push({ ...inPool, source: "heat" }); have.add(seed.id); }
    }
    const heatValues = shortlist.map((m) => heat.get(m.city.id)?.value).filter((v): v is number => typeof v === "number");
    if (heatValues.length > 0) {
      const floor = Math.min(...heatValues);
      for (const seed of seeds) {
        if (have.has(seed.id) || shortlist.length >= cap) continue;
        heat.set(seed.id, { value: floor, refs: [] });
        shortlist.push({ city: seed, affinity: Number.NaN, popularity: Number.NaN, refs: [], warnings: [], source: "major_market" });
        have.add(seed.id);
      }
    }

    type CityOutcome = { ok: ScoredCity } | { stop: unknown };
    const limit = Math.max(deps.concurrency ?? 3, 1);
    for (let i = 0; i < shortlist.length; i += limit) {
      const batch: CityOutcome[] = await Promise.all(shortlist.slice(i, i + limit).map(async (m): Promise<CityOutcome> => {
        const fan = heat.get(m.city.id)!;
        const base = { id: m.city.id, name: m.city.name, country: m.city.country, lat: m.city.lat, lon: m.city.lon, candidateSource: m.source, ...(m.source === "major_market" ? { fanHeatFloor: true as const } : {}) };
        try {
          const loc = await resolveLocation(signalArtist, m.city, deps, brief.sessionId, events);
          if (loc.status === "unresolved") {
            // Qloo placed this city somewhere else: no activation calls, never a confident score from another place's data.
            const act = { ...activation({}, SCORING.weights), rawComponents: {} as Partial<Record<ComponentName, number>> };
            const win = winnability(fan, act);
            const warning: DataWarning = { tool: "qloo_where_popular", kind: "partial", code: "LOCATION_UNRESOLVED", message: "Qloo couldn't place this city precisely, so we didn't score it." };
            return { ok: { ...base, fanHeat: fan, activation: act, winnability: win, verdict: verdict(fan, act, win, SCORING.thresholds), closeCall: false, zones: [], warnings: dedupeWarnings([...m.warnings, warning]), insufficientReason: "location_unresolved", locationAttempts: loc.attempts } };
          }
          const inputs = await activationInputs(signalArtist, { ...loc, city: m.city }, deps, brief.sessionId, events, "venue ranking unresolved — venue fit not scored");
          const adjusted = Object.fromEntries(Object.entries(inputs.components).map(([k, c]) => [k, c.value]));
          const scoredAct = activation(inputs.components, SCORING.weights);
          // Rule 8: a thin-data city is insufficient_data, never 0 (same isThin as calibration's scoreCity).
          const act = { ...(isThin(adjusted, SCORING.weights) ? { ...scoredAct, value: null, reason: "insufficient_data" as const } : scoredAct), rawComponents: inputs.rawComponents };
          const win = winnability(fan, act);
          const v = verdict(fan, act, win, SCORING.thresholds);
          // A floored seed has no Qloo fan-heat evidence, so it can never earn the headline verdicts.
          const capped = m.source === "major_market" && (v === "play" || v === "hidden_goldmine") ? "consider" : v;
          return { ok: { ...base, fanHeat: fan, activation: act, winnability: win, verdict: capped, closeCall: closeCall(fan, act, SCORING.thresholds), zones: inputs.zones, warnings: dedupeWarnings([...m.warnings, ...inputs.warnings]), locationQuery: loc.where, locationAttempts: loc.attempts } };
        } catch (err) {
          if (err instanceof Aborted || err instanceof BudgetStop) return { stop: err };
          const act = { ...activation({}, SCORING.weights), rawComponents: {} as Partial<Record<ComponentName, number>> };
          const win = winnability(fan, act);
          const warning: DataWarning = { tool: "pipeline", kind: "error", code: "INTERNAL", message: (err as Error).message };
          return { ok: { ...base, fanHeat: fan, activation: act, winnability: win, verdict: verdict(fan, act, win, SCORING.thresholds), closeCall: false, zones: [], warnings: dedupeWarnings([...m.warnings, warning]) } };
        }
      }));
      yield* flush();
      let stop: unknown;
      const fresh: ScoredCity[] = [];
      for (const o of batch) { if ("ok" in o) fresh.push(o.ok); else stop ??= o.stop; }
      fresh.sort((a, b) => (b.winnability.value ?? -1) - (a.winnability.value ?? -1));
      for (const city of fresh) { scored.push(city); yield { type: "city_scored", city }; }
      if (stop) throw stop;
    }
    yield { type: "done", summary: { artist: { entityId, name: artistName }, cities: scored.length } };
  } catch (err) {
    yield* flush();
    if (err instanceof Aborted) { yield { type: "error", code: "ABORTED", message: "client disconnected" }; return; }
    if (err instanceof BudgetStop) { yield { type: "error", code: "BUDGET", message: err.message }; return; }
    yield { type: "error", code: "INTERNAL", message: (err as Error).message };
  }
}
