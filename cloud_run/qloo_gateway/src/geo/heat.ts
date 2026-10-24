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

/** Zone rows, strongest first, unique by display name: points that land on the same locality merge (shares add, the strongest point stands for the row). */
export function zonesFromHeat(points: HeatPoint[], cities: City[]) {
  const total = points.reduce((sum, p) => sum + Math.max(0, p.affinity), 0);
  const byLabel = new Map<string, { label: string; lat: number; lon: number; affinity: number; index: number; share: number }>();
  for (const p of [...points].sort((a, b) => b.affinity - a.affinity)) {
    const near = nearestCity(cities, p, { maxKm: 8, minPopulation: 0 });
    const label = near ? near.name : `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}`;
    const share = total > 0 ? Math.max(0, p.affinity) / total : 0;
    const prev = byLabel.get(label);
    if (prev) prev.share += share;
    else byLabel.set(label, { label, lat: p.lat, lon: p.lon, affinity: p.affinity, index: p.index, share });
  }
  return [...byLabel.values()];
}
