import { metroAnchor, nearestCity, type City } from "./cities.js";

const METRO_KM = 30;

export interface HeatPoint { lat: number; lon: number; affinity: number; popularity: number; index: number }

export function marketsFromHeat(points: HeatPoint[], cities: City[], opts: { maxKm?: number; minPopulation?: number } = {}) {
  const byCity = new Map<string, { city: City; affinity: number; popularity: number; pointIndexes: number[] }>();
  for (const p of points) {
    const minPopulation = opts.minPopulation ?? 100_000;
    const fallbackKm = opts.maxKm ?? 50;
    // Anchor to the biggest city within 30 km (suburb -> tour city); otherwise the nearest sizeable city within fallbackKm.
    const city = metroAnchor(cities, p, { maxKm: Math.min(METRO_KM, fallbackKm), minPopulation })
      ?? nearestCity(cities, p, { maxKm: fallbackKm, minPopulation });
    if (!city) continue;
    const m = byCity.get(city.id) ?? { city, affinity: -Infinity, popularity: -Infinity, pointIndexes: [] };
    m.affinity = Math.max(m.affinity, p.affinity);
    m.popularity = Math.max(m.popularity, p.popularity);
    m.pointIndexes.push(p.index);
    byCity.set(city.id, m);
  }
  return [...byCity.values()].sort((a, b) => b.affinity - a.affinity);
}

/** One zone per heat point, strongest first. These per-point shares are the fan_concentration scoring input: do not merge them. */
export function zonesFromHeat(points: HeatPoint[], cities: City[]) {
  const total = points.reduce((sum, p) => sum + Math.max(0, p.affinity), 0);
  return [...points]
    .sort((a, b) => b.affinity - a.affinity)
    .map((p) => {
      const near = nearestCity(cities, p, { maxKm: 8, minPopulation: 0 });
      return {
        label: near ? near.name : `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}`,
        lat: p.lat, lon: p.lon, affinity: p.affinity, index: p.index,
        share: total > 0 ? Math.max(0, p.affinity) / total : 0,
      };
    });
}

/** Display only: rows unique by label, strongest first (shares add, the strongest point stands for the row). */
export function uniqueZones<T extends { label: string; share: number }>(zones: T[]): T[] {
  const byLabel = new Map<string, T>();
  for (const z of zones) {
    const prev = byLabel.get(z.label);
    if (prev) prev.share += z.share;
    else byLabel.set(z.label, { ...z });
  }
  return [...byLabel.values()];
}
