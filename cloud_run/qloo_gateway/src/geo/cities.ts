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

/** GeoNames ids of well-known tour cities that a larger neighbouring municipality would otherwise outrank. Keep this small and curated. */
const METRO_CORES: ReadonlySet<string> = new Set([
  "4005539", // Guadalajara, over Zapopan
  "4641239", // Memphis, over "New South Memphis" (GeoNames artefact)
  "5391811", // San Diego, over Tijuana (28 km; a cross-border metro keeps its home-country label)
  "5520993", // El Paso, over Ciudad Juarez
  "3530597", // Mexico City, over Ecatepec de Morelos, Iztapalapa and the other conurbation municipalities
  "3448439", // Sao Paulo, over Osasco, Guarulhos and Sao Bernardo do Campo
  "3451190", // Rio de Janeiro, over Niteroi and Duque de Caxias
  "3995465", // Monterrey, over Guadalupe and San Nicolas de los Garza
  "3435910", // Buenos Aires, over the Gran Buenos Aires partidos
  "3871336", // Santiago, over Puente Alto and Maipu
  "3688689", // Bogota, over Soacha
  "3936456", // Lima, over Callao and San Juan de Lurigancho
]);

/** Wider reach (km) for the two 12M-person metros whose outer-ring heat cells sit 30-40 km from the GeoNames centre and would otherwise anchor to a suburb. Every other core uses the caller's radius. Kept at 40 so Jundiai, Petropolis, Toluca (all >=45 km) keep their own names. */
const METRO_CORE_REACH_KM: ReadonlyMap<string, number> = new Map([["3530597", 40], ["3448439", 40]]);

/** The most populous city (>= minPopulation) within maxKm of the point; equal populations break by distance. A METRO_CORES city in range (Mexico City and Sao Paulo reach 40 km) beats any non-core city (most populous core wins). Anchors suburbs to their tour city. */
export function metroAnchor(cities: City[], p: { lat: number; lon: number }, { maxKm = 50, minPopulation = 100_000 }: { maxKm?: number; minPopulation?: number } = {}): City | null {
  let best: City | null = null;
  let bestKm = Infinity;
  const reachKm = Math.max(maxKm, ...METRO_CORE_REACH_KM.values());
  const dLat = reachKm / 111;
  const dLonMax = reachKm / (111 * Math.max(Math.cos((p.lat * Math.PI) / 180), 0.01));
  for (const c of cities) {
    if (c.population < minPopulation) continue;
    const dLonDeg = Math.abs(((c.lon - p.lon + 540) % 360) - 180);
    if (Math.abs(c.lat - p.lat) > dLat || dLonDeg > dLonMax) continue;
    const km = haversineKm(c, p);
    if (km > Math.max(maxKm, METRO_CORE_REACH_KM.get(c.id) ?? 0)) continue;
    const coreC = METRO_CORES.has(c.id), coreBest = best !== null && METRO_CORES.has(best.id);
    if (!best || (coreC && !coreBest) || (coreC === coreBest && (c.population > best.population || (c.population === best.population && km < bestKm)))) { best = c; bestKm = km; }
  }
  return best;
}
