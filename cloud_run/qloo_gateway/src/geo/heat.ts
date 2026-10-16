import { metroAnchor, nearestCity, type City } from "./cities.js";

export interface HeatPoint { lat: number; lon: number; affinity: number; popularity: number; index: number }

export function marketsFromHeat(points: HeatPoint[], cities: City[], opts: { maxKm?: number; minPopulation?: number } = {}) {
  const byCity = new Map<string, { city: City; affinity: number; popularity: number; pointIndexes: number[] }>();
  for (const p of points) {
    const city = metroAnchor(cities, p, { maxKm: opts.maxKm ?? 50, minPopulation: opts.minPopulation ?? 100_000 });
    if (!city) continue;
    const m = byCity.get(city.id) ?? { city, affinity: -Infinity, popularity: -Infinity, pointIndexes: [] };
    m.affinity = Math.max(m.affinity, p.affinity);
    m.popularity = Math.max(m.popularity, p.popularity);
    m.pointIndexes.push(p.index);
    byCity.set(city.id, m);
  }
  return [...byCity.values()].sort((a, b) => b.affinity - a.affinity);
}

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
