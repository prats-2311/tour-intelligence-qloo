import { ZONE_SHARE_LABEL, zoneShareRows } from "@/lib/qloo/tourInsights";
import type { ScoredCity } from "@/lib/qloo/types";
import { ChartFrame } from "./ChartFrame";

/** Promo zone shares from the recording: each zone's share of the city's fan heat (the shares are the recording's, never re-derived). */
export function ZoneShareChart({ city }: { city: ScoredCity }) {
  const rows = zoneShareRows(city);
  const pct = (s: number): number => Math.round(s * 100);
  return (
    <ChartFrame
      title={`Promo zone share · ${city.name}`}
      caption={`Each bar is a zone's ${ZONE_SHARE_LABEL}.`}
      table={{ head: ["Zone", "Share of in-city fan heat"], rows: rows.map((r) => [r.label, `${pct(r.share)}%`]) }}
      empty={rows.length === 0 ? <p className="text-[14px] text-canvas-muted">Qloo returned no promo zones for {city.name}.</p> : undefined}
    >
      <div role="img" aria-label={`Promo zones in ${city.name}, ${ZONE_SHARE_LABEL}: ${rows.map((r) => `${r.label} ${pct(r.share)}%`).join(", ")}`} className="flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.label} data-testid="zone-share-row" aria-hidden className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-[14px]"><span className="min-w-0 truncate text-canvas-text">{r.label}</span><span className="font-mono tabular text-canvas-text">{pct(r.share)}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-canvas"><div data-testid="zone-share-bar" className="h-full bg-bone" style={{ width: `${pct(r.share)}%` }} /></div>
          </div>
        ))}
      </div>
    </ChartFrame>
  );
}
