import type { Zone } from "./types";

/** Display only: one row per zone name, strongest first (shares add, the strongest point stands for the row). Map dots stay per point. */
export function mergeZonesByLabel(zones: Zone[]): Zone[] {
  const rows = new Map<string, Zone>();
  for (const z of zones) {
    const prev = rows.get(z.label);
    if (!prev) rows.set(z.label, { ...z });
    else {
      prev.share += z.share;
      if (z.affinity > prev.affinity) Object.assign(prev, { affinity: z.affinity, lat: z.lat, lon: z.lon, index: z.index });
    }
  }
  return [...rows.values()].sort((a, b) => b.affinity - a.affinity);
}
