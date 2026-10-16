import type { StyleSpecification } from "maplibre-gl";
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

export const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: ["a", "b", "c", "d"].map((s) => `https://${s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png`),
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#151410" } },
    { id: "carto", type: "raster", source: "carto", paint: { "raster-saturation": -0.6, "raster-brightness-max": 0.75, "raster-hue-rotate": 15 } },
  ],
};
