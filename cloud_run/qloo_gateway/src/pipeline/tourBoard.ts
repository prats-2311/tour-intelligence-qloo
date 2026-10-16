import { extractEntities, extractHeatPoints, extractIssues } from "../extract.js";
import type { City } from "../geo/cities.js";
import { marketsFromHeat, zonesFromHeat } from "../geo/heat.js";
import type { CallResult, QlooCaller } from "../qlooCall.js";
import { activation, fanConcentration, meanTopK, type ComponentName } from "../scoring/activation.js";
import { fanHeat } from "../scoring/fanHeat.js";
import { verdict, winnability } from "../scoring/winnability.js";
import type { EvidenceRef, GatewayEvent, Score, Verdict } from "../types.js";

export interface TourBrief { artist: string; artistEntityId?: string; regions: string[]; maxStops: number; sessionId: string; today: string }
export interface ScoredCity {
  id: string; name: string; country: string; lat: number; lon: number;
  fanHeat: Score; activation: Score & { components: Partial<Record<ComponentName, number>> }; winnability: Score; verdict: Verdict;
  zones: ReturnType<typeof zonesFromHeat>;
}
interface Deps { qloo: QlooCaller; cities: City[]; signal?: AbortSignal; concurrency?: number }

const SHORTLIST = 8;
const ref = (tool: string, r: CallResult, resultIndex?: number): EvidenceRef => ({ tool, cacheKey: r.cacheKey, ...(resultIndex !== undefined ? { resultIndex } : {}) });

class Aborted extends Error {}

async function call(deps: Deps, sessionId: string, tool: string, args: Record<string, unknown>, events: GatewayEvent[]): Promise<CallResult> {
  if (deps.signal?.aborted) throw new Aborted();
  const r = await deps.qloo.call(tool, args, sessionId);
  events.push({ type: "tool_call", tool, args, cached: r.cached });
  events.push({ type: "tool_result", tool, status: r.envelope.status, resultCount: Array.isArray(r.envelope.results) ? r.envelope.results.length : 0, cacheKey: r.cacheKey, stale: r.stale });
  return r;
}

export async function activationInputs(artist: string, city: { name: string; country: string }, deps: Deps, sessionId: string, events: GatewayEvent[]) {
  const where = `${city.name}, ${city.country}`;
  const [brands, places, films, artists, inCity] = await Promise.all([
    call(deps, sessionId, "qloo_recommend", { target_type: "brand", signals: [artist], signal_location: where, limit: 10 }, events),
    call(deps, sessionId, "qloo_recommend", { target_type: "place", signals: [artist], filter_location: where, limit: 10 }, events),
    call(deps, sessionId, "qloo_recommend", { target_type: "movie", signals: [artist], signal_location: where, limit: 10 }, events),
    call(deps, sessionId, "qloo_recommend", { target_type: "artist", signals: [artist], signal_location: where, limit: 10 }, events),
    call(deps, sessionId, "qloo_where_popular", { entity: artist, entity_type: "artist", within: where, limit: 20 }, events),
  ]);
  const placeEntities = extractEntities(places.envelope);
  const venueNames = placeEntities.slice(0, 10).map((e) => e.name);
  const ranked = venueNames.length > 0
    ? await call(deps, sessionId, "qloo_rank", { options: venueNames, option_type: "place", signals: [artist], signal_location: where }, events)
    : undefined;

  const zones = zonesFromHeat(extractHeatPoints(inCity.envelope), deps.cities);
  const components: Partial<Record<ComponentName, { value: number; refs: EvidenceRef[] }>> = {};
  const sponsor = meanTopK(extractEntities(brands.envelope).map((e) => e.affinity), 5);
  if (sponsor !== null) components.sponsor_fit = { value: sponsor, refs: [ref("qloo_recommend", brands)] };
  const hooks = meanTopK([...placeEntities, ...extractEntities(films.envelope), ...extractEntities(artists.envelope)].map((e) => e.affinity), 5);
  if (hooks !== null) components.local_hooks = { value: hooks, refs: [ref("qloo_recommend", places), ref("qloo_recommend", films), ref("qloo_recommend", artists)] };
  const conc = fanConcentration(zones.map((z) => z.share));
  if (conc !== null) components.fan_concentration = { value: conc, refs: [ref("qloo_where_popular", inCity)] };
  const venue = ranked ? meanTopK(extractEntities(ranked.envelope).map((e) => e.affinity), 1) : null;
  if (venue !== null && ranked) components.venue_fit = { value: venue, refs: [ref("qloo_rank", ranked)] };

  return { components, zones, raw: { brands, places, films, artists, inCity, ranked } };
}

export async function* runTourBoard(brief: TourBrief, deps: Deps): AsyncGenerator<GatewayEvent> {
  const events: GatewayEvent[] = [];
  const flush = function* () { while (events.length) yield events.shift()!; };
  try {
    let artistName = brief.artist;
    let entityId = brief.artistEntityId;
    if (!entityId) {
      const d = await deps.qloo.call("qloo_describe", { entity: brief.artist, type: "artist" }, brief.sessionId);
      if (d.envelope.status === "needs_input") {
        const issue = extractIssues(d.envelope)[0];
        yield { type: "needs_input", field: issue?.field ?? "entity", candidates: issue?.candidates ?? [], summary: d.envelope.summary ?? "Choose the intended artist." };
        return;
      }
      const top = extractEntities(d.envelope)[0];
      if (!top) { yield { type: "error", code: "NOT_FOUND", message: `Qloo has no artist matching "${brief.artist}"` }; return; }
      entityId = top.entityId;
      artistName = top.name;
    }
    yield { type: "resolve", entity: { entityId, name: artistName } };
    const signalArtist = entityId; // harness accepts Qloo UUIDs as entity inputs

    const end = new Date(`${brief.today}T00:00:00Z`);
    const start = new Date(end.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
    const [demo, tags, trends, heatCalls] = await Promise.all([
      call(deps, brief.sessionId, "qloo_audience_demographics", { entity: signalArtist, entity_type: "artist" }, events),
      call(deps, brief.sessionId, "qloo_entity_tags", { entities: [signalArtist], entity_type: "artist", limit: 10 }, events),
      call(deps, brief.sessionId, "qloo_trends", { entities: [signalArtist], entity_type: "artist", start_date: start, end_date: brief.today }, events),
      Promise.all(brief.regions.map(async (region) => ({
        region, r: await call(deps, brief.sessionId, "qloo_where_popular", { entity: signalArtist, entity_type: "artist", within: region, limit: 20 }, events),
      }))),
    ]);
    yield* flush();
    yield {
      type: "artist_profile",
      demographics: Array.isArray(demo.envelope.results) ? demo.envelope.results : [],
      tags: extractEntities(tags.envelope).map((t) => ({ name: t.name, affinity: t.affinity })),
      trends: trends.envelope.results ?? null,
      refs: [ref("qloo_audience_demographics", demo), ref("qloo_entity_tags", tags), ref("qloo_trends", trends)],
    };

    const pooled = heatCalls.flatMap(({ region, r }) => {
      const points = extractHeatPoints(r.envelope);
      if (points.length === 0) { events.push({ type: "region_empty", region }); return []; }
      return marketsFromHeat(points, deps.cities).map((m) => ({ ...m, refs: [ref("qloo_where_popular", r)] }));
    });
    yield* flush();

    const heat = fanHeat(pooled.map((m) => ({ id: m.city.id, affinity: m.affinity, popularity: m.popularity, refs: m.refs })));
    const shortlist = [...pooled]
      .sort((a, b) => (heat.get(b.city.id)?.value ?? -1) - (heat.get(a.city.id)?.value ?? -1))
      .slice(0, Math.min(SHORTLIST, Math.max(brief.maxStops, 1) + 2));

    const scored: ScoredCity[] = [];
    const limit = deps.concurrency ?? 3;
    for (let i = 0; i < shortlist.length; i += limit) {
      const batch = await Promise.all(shortlist.slice(i, i + limit).map(async (m) => {
        const inputs = await activationInputs(signalArtist, m.city, deps, brief.sessionId, events);
        const fan = heat.get(m.city.id)!;
        const act = activation(inputs.components);
        const win = winnability(fan, act);
        return { id: m.city.id, name: m.city.name, country: m.city.country, lat: m.city.lat, lon: m.city.lon, fanHeat: fan, activation: act, winnability: win, verdict: verdict(fan, act, win), zones: inputs.zones } satisfies ScoredCity;
      }));
      yield* flush();
      scored.push(...batch);
    }
    scored.sort((a, b) => (b.winnability.value ?? -1) - (a.winnability.value ?? -1));
    for (const city of scored) yield { type: "city_scored", city };
    yield { type: "done", summary: { artist: { entityId, name: artistName }, cities: scored.length } };
  } catch (err) {
    yield* flush();
    if (err instanceof Aborted) { yield { type: "error", code: "ABORTED", message: "client disconnected" }; return; }
    yield { type: "error", code: "INTERNAL", message: (err as Error).message };
  }
}
