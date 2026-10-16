import { decodeGeohash } from "./geo/geohash.js";
import type { HeatPoint } from "./geo/heat.js";
import type { QlooEnvelope } from "./types.js";

const rec = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number.NaN);
const list = (env: QlooEnvelope): unknown[] => (Array.isArray(env.results) ? env.results : []);

export function extractEntities(env: QlooEnvelope) {
  return list(env).flatMap((raw, index) => {
    const e = rec(raw);
    if (!e || typeof e.name !== "string") return [];
    return [{
      entityId: String(e.entity_id ?? e.id ?? ""), name: e.name,
      ...(typeof e.subtype === "string" ? { type: e.subtype } : typeof e.type === "string" ? { type: e.type } : {}),
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
