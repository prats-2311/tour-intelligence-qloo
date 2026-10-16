import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ScoredCity, Zone } from "@/lib/qloo/types";
import { boundsFor, cityMarkers, MAP_STYLE_URL, shouldRefit, warmTint } from "@/lib/qloo/geometry";
import { useIsDesktop, useMediaQuery } from "@/lib/useMediaQuery";
import { markerElement, markerSignature, setMarkerSelected } from "./mapMarker";

interface Props {
  cities: ScoredCity[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  zones?: Zone[];
  /** Markers carry no verdict (shape, colour or label) and are not interactive. */
  neutral?: boolean;
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

export default function TourMap({ cities, selectedId, onSelect, zones, neutral = false }: Props) {
  const isDesktop = useIsDesktop();
  const [tilesFailed, setTilesFailed] = useState(false);
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Map<string, { marker: maplibregl.Marker; element: HTMLButtonElement; sig: string }>>(new Map());
  const styleReady = useRef(false);
  const onSelectRef = useRef(onSelect);
  const zonesRef = useRef(zones);
  const citiesRef = useRef(cities);
  const selectedRef = useRef(selectedId);
  const reduceRef = useRef(reduce);
  const neutralRef = useRef(neutral);
  neutralRef.current = neutral;
  onSelectRef.current = onSelect;
  zonesRef.current = zones;
  citiesRef.current = cities;
  selectedRef.current = selectedId;
  reduceRef.current = reduce;

  const idKey = useMemo(() => cities.map((c) => c.id).sort().join("|"), [cities]);
  const sigKey = useMemo(
    () => cityMarkers(cities).map((m, i) => markerSignature({ ...m, name: cities.find((c) => c.id === m.id)?.name ?? String(i) }, neutral)).sort().join("\n"),
    [cities, neutral],
  );

  const applyZones = (map: maplibregl.Map) => {
    const data = zoneData(zonesRef.current);
    const src = map.getSource(ZONES) as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData(data);
      return;
    }
    map.addSource(ZONES, { type: "geojson", data });
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
  };

  // Create once; cooperative gestures keep the map from hijacking page scroll on phones.
  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: MAP_STYLE_URL,
      attributionControl: { compact: true },
      cooperativeGestures: !isDesktop,
      maxZoom: 6,
    });
    mapRef.current = map;
    styleReady.current = false;
    map.once("style.load", () => warmTint(map));
    setTilesFailed(false);
    let styleSeen = false;
    // Only a style-level failure means "no basemap": a stray tile 404 after the style
    // loaded leaves a usable map, so it must not raise the overlay (R31).
    map.on("style.load", () => { styleSeen = true; });
    map.on("error", () => { if (!styleSeen) setTilesFailed(true); });
    const watchdog = setTimeout(() => { if (!styleSeen) setTilesFailed(true); }, 8000);
    map.on("idle", () => setTilesFailed(false));
    const refit = () => {
      const b = boundsFor(citiesRef.current);
      if (b) map.fitBounds(b, { padding: 48, animate: false, maxZoom: 6 });
    };
    map.on("load", () => {
      clearTimeout(watchdog);
      setTilesFailed(false);
      styleReady.current = true;
      map.resize();
      refit();
      applyZones(map); // applies the latest zones, including ones queued before load
    });
    // Layout can settle after the map is constructed (lazy chunk, grid reflow):
    // keep the canvas and framing in step with the container.
    let last = { w: 0, h: 0 };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      const next = { w: r.width, h: r.height };
      if (!shouldRefit(last, next)) return;
      last = next;
      clearTimeout(timer);
      timer = setTimeout(() => {
        map.resize();
        refit();
      }, 100);
    });
    ro?.observe(container.current);
    return () => {
      ro?.disconnect();
      clearTimeout(timer);
      clearTimeout(watchdog);
      markers.current.forEach(({ marker }) => marker.remove());
      markers.current.clear();
      map.remove();
      mapRef.current = null;
      styleReady.current = false;
    };
    // applyZones only reads refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && styleReady.current) applyZones(map); // otherwise the load handler picks up zonesRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, isDesktop]);

  // Refit only when the set of cities changes, not on every new array identity.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const b = boundsFor(citiesRef.current);
    if (b) map.fitBounds(b, { padding: 48, animate: !reduceRef.current, maxZoom: 6 });
  }, [idKey, isDesktop]);

  // Rebuild only markers whose rendered content changed; add new, remove gone.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const byId = new Map(citiesRef.current.map((c) => [c.id, c]));
    const wanted = cityMarkers(citiesRef.current).map((m) => {
      const name = byId.get(m.id)!.name;
      return { ...m, name, sig: markerSignature({ ...m, name }, neutralRef.current) };
    });
    const keep = new Map(wanted.map((m) => [m.id, m.sig]));
    for (const [id, entry] of markers.current) {
      if (keep.get(id) !== entry.sig) {
        entry.marker.remove();
        markers.current.delete(id);
      }
    }
    for (const m of wanted) {
      if (markers.current.has(m.id)) continue;
      const element = markerElement({
        verdict: m.verdict,
        city: m.name,
        label: m.label,
        selected: m.id === selectedRef.current,
        reduce: reduceRef.current,
        neutral: neutralRef.current,
        onSelect: () => onSelectRef.current(m.id),
      });
      markers.current.set(m.id, { marker: new maplibregl.Marker({ element }).setLngLat(m.lngLat).addTo(map), element, sig: m.sig });
    }
  }, [sigKey, isDesktop]);

  // Selection changes mutate in place so keyboard focus is preserved.
  useEffect(() => {
    markers.current.forEach(({ element }, id) => setMarkerSelected(element, id === selectedId));
  }, [selectedId, sigKey, isDesktop]);

  return (
    <div className="relative size-full">
      <div ref={container} className="size-full overflow-hidden rounded-[18px] bg-[#151410]" />
      {tilesFailed && (
        <p role="status" className="pointer-events-none absolute bottom-2 left-2 z-10 rounded-[6px] bg-canvas-raised px-2 py-1 text-[12px] text-canvas-muted">Map tiles unavailable</p>
      )}
    </div>
  );
}
