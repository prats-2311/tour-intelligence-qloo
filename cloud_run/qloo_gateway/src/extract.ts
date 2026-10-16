import { decodeGeohash } from "./geo/geohash.js";
import type { HeatPoint } from "./geo/heat.js";
import type { QlooEnvelope } from "./types.js";

const rec = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number.NaN);
const list = (env: QlooEnvelope): unknown[] => (Array.isArray(env.results) ? env.results : []);

const ENTITY_PREFIX = "urn:entity:";

/** F7: the category lives in `subtype` ("urn:entity:artist"); `type` is the generic "urn:entity" on live data. */
function categoryOf(e: Record<string, unknown>): { category?: string } {
  const raw = typeof e.subtype === "string" ? e.subtype : typeof e.type === "string" && e.type !== "urn:entity" ? e.type : undefined;
  if (!raw) return {};
  const category = raw.startsWith(ENTITY_PREFIX) ? raw.slice(ENTITY_PREFIX.length) : raw;
  return category === "" ? {} : { category };
}

export function extractEntities(env: QlooEnvelope) {
  return list(env).flatMap((raw, index) => {
    const e = rec(raw);
    if (!e || typeof e.name !== "string" || e.name.trim() === "") return [];
    const entityId = String(e.entity_id ?? e.id ?? "");
    if (entityId === "") return [];
    return [{
      entityId, name: e.name,
      ...(typeof e.subtype === "string" ? { type: e.subtype } : typeof e.type === "string" ? { type: e.type } : {}),
      ...categoryOf(e),
      affinity: num(e.affinity), popularity: num(e.popularity), index,
    }];
  });
}

export function extractHeatPoints(env: QlooEnvelope): HeatPoint[] {
  return list(env).flatMap((raw, index) => {
    const p = rec(raw);
    const loc = rec(p?.location);
    const query = rec(p?.query);
    if (!loc || !query) return [];
    let lat = num(loc.latitude), lon = num(loc.longitude);
    if ((Number.isNaN(lat) || Number.isNaN(lon)) && typeof loc.geohash === "string") ({ lat, lon } = decodeGeohash(loc.geohash));
    const affinity = num(query.affinity), popularity = num(query.popularity);
    if ([lat, lon, affinity].some(Number.isNaN)) return [];
    return [{ lat, lon, affinity, popularity: Number.isNaN(popularity) ? 0 : popularity, index }];
  });
}

export function extractIssues(env: QlooEnvelope) {
  const raw = Array.isArray(env.issues) ? env.issues : Array.isArray(rec(env.resolution)?.issues) ? (rec(env.resolution)!.issues as unknown[]) : [];
  return raw.flatMap((i) => {
    const issue = rec(i);
    if (!issue) return [];
    const candidates = (Array.isArray(issue.candidates) ? issue.candidates : []).flatMap((c) => {
      const cand = rec(c);
      if (!cand || typeof cand.name !== "string") return [];
      return [{ id: String(cand.id ?? cand.entity_id ?? ""), name: cand.name, ...(typeof cand.type === "string" ? { type: cand.type } : {}) }];
    });
    return [{ field: String(issue.field ?? "entity"), candidates }];
  });
}

const TOP_TAGS = 5;

/** F1: compare_audiences has no scalar overlap; shared taste = mean of the top shared-tag scores (0..1). */
export function extractSharedTaste(env: QlooEnvelope): { value: number | null; tags: Array<{ name: string; score: number }> } {
  const raw = rec(env.results)?.tags;
  const tags = (Array.isArray(raw) ? raw : []).flatMap((t) => {
    const tag = rec(t);
    const score = num(rec(tag?.query)?.score);
    if (!tag || typeof tag.name !== "string" || Number.isNaN(score)) return [];
    return [{ name: tag.name, score }];
  }).sort((a, b) => b.score - a.score).slice(0, TOP_TAGS);
  if (tags.length === 0) return { value: null, tags: [] };
  return { value: tags.reduce((s, t) => s + t.score, 0) / tags.length, tags };
}

const firstFinite = (...vs: unknown[]): number => vs.map(num).find((n) => !Number.isNaN(n)) ?? Number.NaN;

/** F3: trends arrive as `series[0].points`; an empty series is a normal answer. */
export function extractTrendPoints(env: QlooEnvelope): Array<{ date: string; value: number }> {
  const series = Array.isArray(env.series) ? env.series : [];
  const points = rec(series[0])?.points;
  return (Array.isArray(points) ? points : []).flatMap((raw) => {
    const p = rec(raw);
    if (!p) return [];
    const date = [p.date, p.day, p.timestamp].find((d): d is string => typeof d === "string" && d !== "");
    const value = firstFinite(p.value, p.population_percentile, p.velocity_fold_change);
    return date && !Number.isNaN(value) ? [{ date, value }] : [];
  });
}

const MUSIC_TAG_PREFIXES = ["urn:tag:genre:music", "urn:tag:subgenre:", "urn:tag:artist:qloo"];

/** F8: entity_tags is noisy (credit cards, price bands); keep only music/taste tags. */
export function extractMusicTags(env: QlooEnvelope): Array<{ id: string; name: string; affinity: number }> {
  return list(env).flatMap((raw) => {
    const t = rec(raw);
    if (!t || typeof t.id !== "string" || typeof t.name !== "string") return [];
    if (!MUSIC_TAG_PREFIXES.some((p) => (t.id as string).startsWith(p))) return [];
    return [{ id: t.id, name: t.name, affinity: num(t.affinity) }];
  });
}

/** F6: rank with names returns needs_input; the candidates carry the ids to retry with. */
export function extractCandidates(env: QlooEnvelope): Array<{ id: string; name: string }> {
  return extractIssues(env).flatMap((i) => i.candidates.filter((c) => c.id !== "").map((c) => ({ id: c.id, name: c.name })));
}
