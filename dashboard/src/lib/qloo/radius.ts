import type { ScoredCity } from "./types";

type Pt = Pick<ScoredCity, "id" | "name" | "lat" | "lon">;
const placed = (c: Pt): boolean => Number.isFinite(c.lat) && Number.isFinite(c.lon);
const rad = (d: number): number => (d * Math.PI) / 180;

/** Great-circle distance in km (mean Earth radius 6371). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The nearest other city in `pool` with coordinates, distance rounded to the nearest 10 km. Null when either side lacks coordinates. */
export function nearestStop(city: Pt, pool: Pt[]): { name: string; km: number } | null {
  if (!placed(city)) return null;
  let best: { name: string; km: number } | null = null;
  for (const o of pool) {
    if (o.id === city.id || !placed(o)) continue;
    const km = haversineKm(city.lat, city.lon, o.lat, o.lon);
    if (!best || km < best.km) best = { name: o.name, km };
  }
  return best ? { name: best.name, km: Math.round(best.km / 10) * 10 } : null;
}

export function radiusNote(city: Pt, pool: Pt[]): string | null {
  const n = nearestStop(city, pool);
  return n ? `Nearest other stop: ${n.name}, ${n.km} km — check radius clauses.` : null;
}
