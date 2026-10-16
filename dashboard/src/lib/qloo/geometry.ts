import type { ScoredCity, Verdict } from "./types";

export function cityMarkers(cities: ScoredCity[]) {
  return cities
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon))
    .map((c) => ({
      id: c.id,
      lngLat: [c.lon, c.lat] as [number, number],
      verdict: c.verdict as Verdict,
      label: c.verdict === "play" || c.verdict === "hidden_goldmine" ? c.name : null,
    }));
}

export function boundsFor(cities: ScoredCity[]): [[number, number], [number, number]] | null {
  const pts = cities.filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon));
  if (pts.length === 0) return null;
  const lons = pts.map((c) => c.lon), lats = pts.map((c) => c.lat);
  const pad = 2;
  return [[Math.min(...lons) - pad, Math.min(...lats) - pad], [Math.max(...lons) + pad, Math.max(...lats) + pad]];
}

/** OpenFreeMap: keyless vector tiles (© OpenFreeMap © OpenMapTiles, data © OpenStreetMap contributors; the style carries the attribution). */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

export interface Tint { paint?: Record<string, string | number>; hide?: true }

const LAND = "#1c1b18";
const WATER = "#12110e";
const ROAD = "#2a2924";

/** Pure mapping from a style layer to its warm-noir override (testable without a map). */
export function tintFor(layer: { id: string; type: string }): Tint {
  const { id, type } = layer;
  const water = /^water/.test(id);
  switch (type) {
    case "background": return { paint: { "background-color": "#151410" } };
    case "fill": return { paint: { "fill-color": water ? WATER : LAND } };
    case "line":
      if (water) return { paint: { "line-color": WATER } };
      if (/^boundary/.test(id)) return { paint: { "line-color": "#3a382f" } };
      return { paint: { "line-color": ROAD } };
    case "symbol":
      if (/^place_country/.test(id)) return { paint: { "text-color": "#a4a094", "text-opacity": 0.5, "text-halo-color": "#151410" } };
      return { hide: true };
    default: return {};
  }
}

interface TintableMap {
  getStyle(): { layers?: Array<{ id: string; type: string }> };
  setPaintProperty(layer: string, prop: string, value: unknown): unknown;
  setLayoutProperty(layer: string, prop: string, value: unknown): unknown;
}

/** Apply the warm tint to every layer of the loaded style. */
export function warmTint(map: TintableMap): void {
  for (const layer of map.getStyle().layers ?? []) {
    const t = tintFor(layer);
    if (t.hide) map.setLayoutProperty(layer.id, "visibility", "none");
    for (const [k, v] of Object.entries(t.paint ?? {})) map.setPaintProperty(layer.id, k, v);
  }
}

/** Refit the map only when the container has a real size and it changed by at least a pixel. */
export function shouldRefit(prev: { w: number; h: number }, next: { w: number; h: number }): boolean {
  if (next.w <= 0 || next.h <= 0) return false;
  return Math.abs(next.w - prev.w) >= 1 || Math.abs(next.h - prev.h) >= 1;
}
