import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Sheet } from "@/components/qloo/Sheet";
import { VERDICT_LABEL } from "@/components/qloo/VerdictChip";
import { ALL_VERDICTS, activeFilterCount, defaultFilters, type InsightsFilters } from "@/lib/qloo/insightsFilters";
import type { ScoredCity, Verdict } from "@/lib/qloo/types";
import { useIsDesktop } from "@/lib/useMediaQuery";

const label = "font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-canvas-muted";
const row = "flex min-h-11 cursor-pointer items-center gap-3 rounded-[8px] px-2 text-[14px] text-canvas-text hover:bg-paper-raised lg:min-h-9";

const SOURCE_LABEL = { all: "All", fresh: "Fresh", stale: "Stale" } as const;

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function FiltersBody({ cities, filters, onChange }: Props) {
  const countries = [...new Set(cities.map((c) => c.country))];
  const verdictCount = (v: Verdict) => cities.filter((c) => c.verdict === v).length;
  const present = ALL_VERDICTS.filter((v) => verdictCount(v) > 0);
  const n = activeFilterCount(filters);
  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-1">
        <legend className={`${label} mb-1`}>Region</legend>
        {countries.map((c) => (
          <label key={c} className={row}>
            <input type="checkbox" className="size-5 accent-[#ffcc00]" checked={!filters.excludedCountries.includes(c)} aria-label={c} onChange={() => onChange({ ...filters, excludedCountries: toggle(filters.excludedCountries, c) })} />
            <span className="flex-1">{c}</span>
            <span aria-hidden className="font-mono text-[12px] text-canvas-muted">{cities.filter((x) => x.country === c).length}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-1">
        <legend className={`${label} mb-1`}>Verdict</legend>
        {present.map((v) => (
          <label key={v} className={row}>
            <input type="checkbox" className="size-5 accent-[#ffcc00]" checked={!filters.excludedVerdicts.includes(v)} aria-label={VERDICT_LABEL[v]} onChange={() => onChange({ ...filters, excludedVerdicts: toggle(filters.excludedVerdicts, v) })} />
            <span className="flex-1">{VERDICT_LABEL[v]}</span>
            <span aria-hidden className="font-mono text-[12px] text-canvas-muted">{verdictCount(v)}</span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-2">
        <label htmlFor="min-activation" className={`${label} flex items-center justify-between`}>
          <span>Minimum activation</span><span className="font-mono text-[13px] text-gold">{filters.minActivation}</span>
        </label>
        <input id="min-activation" type="range" min={0} max={100} step={5} value={filters.minActivation} onChange={(e) => onChange({ ...filters, minActivation: Number(e.target.value) })} className="h-11 w-full accent-[#ffcc00] lg:h-6" />
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className={`${label} mb-1`}>Data source</legend>
        {(["all", "fresh", "stale"] as const).map((s) => (
          <label key={s} className={row}>
            <input type="radio" name="insights-source" className="size-5 accent-[#ffcc00]" checked={filters.source === s} onChange={() => onChange({ ...filters, source: s })} />
            <span className="flex-1">{SOURCE_LABEL[s]}</span>
          </label>
        ))}
      </fieldset>
      <button type="button" disabled={n === 0} onClick={() => onChange(defaultFilters())} className="min-h-11 self-start px-2 text-[13px] font-semibold text-gold underline-offset-[0.18em] hover:underline disabled:text-canvas-muted disabled:no-underline">
        Reset filters
      </button>
    </div>
  );
}

type Props = { cities: ScoredCity[]; filters: InsightsFilters; onChange: (f: InsightsFilters) => void };

/** Left rail on desktop, "Filters (n)" button + bottom sheet on mobile. `cities` is the unfiltered run. */
export function FiltersPanel(props: Props) {
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const n = activeFilterCount(props.filters);
  if (isDesktop) {
    return (
      <aside aria-label="Filters" className="rounded-[14px] bg-paper p-4">
        <h2 className={`${label} mb-4 flex items-center justify-between`}>Filters & scope{n > 0 && <span className="text-gold">{n} applied</span>}</h2>
        <FiltersBody {...props} />
      </aside>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-[10px] bg-paper-raised px-4 text-[14px] font-semibold text-canvas-text hover:bg-[#3a3932] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
        <SlidersHorizontal size={16} aria-hidden />Filters ({n})
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Filters"><FiltersBody {...props} /></Sheet>
    </>
  );
}
