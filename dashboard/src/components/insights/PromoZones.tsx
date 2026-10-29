import { mergeZonesByLabel, zoneDisplayLabel } from "@/lib/qloo/zones";
import type { ScoredCity } from "@/lib/qloo/types";

export function PromoZones({ city }: { city: ScoredCity }) {
  const zones = mergeZonesByLabel(city.zones.filter((z) => Number.isFinite(z.share)));
  return (
    <section aria-label={`Promo zones in ${city.name}`} className="flex min-w-0 flex-col gap-3 rounded-[14px] bg-paper p-3 lg:p-4">
      <h2 className="font-title text-[20px] leading-tight text-canvas-text">Promo zones · {city.name}</h2>
      {zones.length === 0 ? (
        <p className="text-[14px] text-canvas-muted">Qloo returned no promo zones for {city.name}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {zones.map((z) => {
            const pct = Math.round(Math.max(0, Math.min(1, z.share)) * 100);
            return (
              <li key={z.label} data-testid="zone-row" className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-[14px]">
                  <span className="min-w-0 truncate text-canvas-text">{zoneDisplayLabel(z.label, city.name)}</span>
                  <span className="font-mono tabular text-canvas-text">{pct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-canvas" aria-hidden><div className="h-full bg-bone" style={{ width: `${pct}%` }} /></div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
