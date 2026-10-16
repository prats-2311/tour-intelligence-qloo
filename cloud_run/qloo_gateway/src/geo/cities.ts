import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

export interface City { id: string; name: string; country: string; lat: number; lon: number; population: number }

let memo: City[] | undefined;
const DEFAULT_PATH = fileURLToPath(new URL("../../data/cities5000.json.gz", import.meta.url));

export function loadCities(path: string = DEFAULT_PATH): City[] {
  if (memo) return memo;
  const rows = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as Array<[string, string, string, number, number, number]>;
  memo = rows.map(([id, name, country, lat, lon, population]) => ({ id, name, country, lat, lon, population }));
  return memo;
}

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function nearestCity(cities: City[], p: { lat: number; lon: number }, opts: { maxKm: number; minPopulation: number }): City | null {
  let best: City | null = null;
  let bestKm = opts.maxKm;
  const dLat = opts.maxKm / 111;
  const dLonMax = opts.maxKm / (111 * Math.max(Math.cos((p.lat * Math.PI) / 180), 0.01));
  for (const c of cities) {
    if (c.population < opts.minPopulation) continue;
    const dLonDeg = Math.abs(((c.lon - p.lon + 540) % 360) - 180);
    if (Math.abs(c.lat - p.lat) > dLat || dLonDeg > dLonMax) continue;
    const km = haversineKm(c, p);
    if (km <= bestKm) { best = c; bestKm = km; }
  }
  return best;
}

/** The most populous city (>= minPopulation) within maxKm of the point; equal populations break by distance. Anchors suburbs to their tour city. */
export function metroAnchor(cities: City[], p: { lat: number; lon: number }, { maxKm = 50, minPopulation = 100_000 }: { maxKm?: number; minPopulation?: number } = {}): City | null {
  let best: City | null = null;
  let bestKm = Infinity;
  const dLat = maxKm / 111;
  const dLonMax = maxKm / (111 * Math.max(Math.cos((p.lat * Math.PI) / 180), 0.01));
  for (const c of cities) {
    if (c.population < minPopulation) continue;
    const dLonDeg = Math.abs(((c.lon - p.lon + 540) % 360) - 180);
    if (Math.abs(c.lat - p.lat) > dLat || dLonDeg > dLonMax) continue;
    const km = haversineKm(c, p);
    if (km > maxKm) continue;
    if (!best || c.population > best.population || (c.population === best.population && km < bestKm)) { best = c; bestKm = km; }
  }
  return best;
}
