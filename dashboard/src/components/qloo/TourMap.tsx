import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ScoredCity, Zone } from "@/lib/qloo/types";
import { boundsFor, cityMarkers, MAP_STYLE } from "@/lib/qloo/geometry";
import { useIsDesktop, useMediaQuery } from "@/lib/useMediaQuery";
import { markerElement } from "./mapMarker";

interface Props {
  cities: ScoredCity[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  zones?: Zone[];
}

const ZONES = "zones";

function zoneData(zones: Zone[] | undefined) {
  return {
    type: "FeatureCollection" as const,
    features: (zones ?? [])
      .filter((z) => Number.isFinite(z.lat) && Number.isFinite(z.lon))
      .map((z) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [z.lon, z.lat] },
        properties: { share: Number.isFinite(z.share) ? Math.min(Math.max(z.share, 0), 1) : 0 },
      })),
  };
}

export default function TourMap({ cities, selectedId, onSelect, zones }: Props) {
  const isDesktop = useIsDesktop();
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  const zonesRef = useRef(zones);
  onSelectRef.current = onSelect;
  zonesRef.current = zones;

  // Create once; cooperative gestures keep the map from hijacking page scroll on phones.
  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: MAP_STYLE,
      attributionControl: { compact: true },
      cooperativeGestures: !isDesktop,
    });
    mapRef.current = map;
    map.on("load", () => {
      map.addSource(ZONES, { type: "geojson", data: zoneData(zonesRef.current) });
      map.addLayer({
        id: ZONES,
        type: "circle",
        source: ZONES,
        paint: {
          "circle-color": "#e9e4d6",
          "circle-opacity": 0.35,
          "circle-radius": ["interpolate", ["linear"], ["get", "share"], 0, 6, 1, 32],
        },
      });
    });
    return () => {
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [isDesktop]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => (map.getSource(ZONES) as maplibregl.GeoJSONSource | undefined)?.setData(zoneData(zones));
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [zones, isDesktop]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const b = boundsFor(cities);
    if (b) map.fitBounds(b, { padding: 48, animate: !reduce });
    // Refit when the city set changes, not on every selection or motion-preference flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cities, isDesktop]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markers.current.forEach((m) => m.remove());
    const byId = new Map(cities.map((c) => [c.id, c]));
    markers.current = cityMarkers(cities).map((m) => {
      const element = markerElement({
        verdict: m.verdict,
        city: byId.get(m.id)!.name,
        label: m.label,
        selected: m.id === selectedId,
        onSelect: () => onSelectRef.current(m.id),
      });
      return new maplibregl.Marker({ element }).setLngLat(m.lngLat).addTo(map);
    });
  }, [cities, selectedId, isDesktop]);

  return <div ref={container} className="h-full min-h-[240px] w-full overflow-hidden rounded-[18px] bg-[#151410]" />;
}
