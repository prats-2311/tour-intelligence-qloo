import { VerdictGlyph } from "@/components/qloo/VerdictGlyph";
import { STATUS_LABEL, STATUSES, type CityStatus } from "@/lib/collab/types";
import { countryLabel } from "@/lib/qloo/labels";
import { defaultTourFilters, hasActiveFilters, INSIGHTS_VERDICT_LABEL, SORT_KEYS, SORT_LABEL, type SortKey, type TourFilters } from "@/lib/qloo/tourInsights";
import type { ScoredCity, Verdict } from "@/lib/qloo/types";
import { FOCUS } from "./ChartFrame";

const FILTER_VERDICTS: Verdict[] = ["play", "hidden_goldmine", "de_risk", "consider", "skip"];
const chip = (on: boolean) => `inline-flex min-h-11 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-semibold ${FOCUS} ${on ? "bg-bone text-canvas" : "bg-paper-raised text-canvas-text hover:bg-[#3a3932]"}`;
const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** The shared Insights filters. Stateless: the page owns them (and mirrors them in the URL). */
export function FiltersBar({ filters, onChange, cities, showStatus, shown }: { filters: TourFilters; onChange: (f: TourFilters) => void; cities: ScoredCity[]; showStatus: boolean; shown: number }) {
  const countries = [...new Set(cities.map((c) => c.country))].sort((a, b) => countryLabel(a).localeCompare(countryLabel(b)));
  const group = "flex flex-wrap items-center gap-2";
  const legend = "font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-canvas-muted";
  return (
    <section aria-label="Filters" data-tour="charts-filters" className="flex min-w-0 flex-col gap-3 rounded-[14px] bg-paper p-3 lg:p-4">
      <div role="group" aria-label="Country" className="flex flex-col gap-1.5">
        <span className={legend}>Country</span>
        <div className={group}>
          {countries.map((c) => <button key={c} type="button" aria-pressed={filters.countries.includes(c)} onClick={() => onChange({ ...filters, countries: toggle(filters.countries, c) })} className={chip(filters.countries.includes(c))}>{countryLabel(c)}</button>)}
        </div>
      </div>
      <div role="group" aria-label="Verdict" className="flex flex-col gap-1.5">
        <span className={legend}>Verdict</span>
        <div className={group}>
          {FILTER_VERDICTS.map((v) => <button key={v} type="button" aria-pressed={filters.verdicts.includes(v)} onClick={() => onChange({ ...filters, verdicts: toggle(filters.verdicts, v) })} className={chip(filters.verdicts.includes(v))}><VerdictGlyph verdict={v} />{INSIGHTS_VERDICT_LABEL[v]}</button>)}
        </div>
      </div>
      {showStatus && (
        <div role="group" aria-label="Team status" className="flex flex-col gap-1.5">
          <span className={legend}>Team status</span>
          <div className={group}>
            {STATUSES.map((s: CityStatus) => <button key={s} type="button" aria-pressed={filters.statuses.includes(s)} onClick={() => onChange({ ...filters, statuses: toggle(filters.statuses, s) })} className={chip(filters.statuses.includes(s))}>{STATUS_LABEL[s]}</button>)}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-[13px] text-canvas-text">
          <span>Minimum winnability: <span className="font-mono tabular">{filters.minWinnability}</span></span>
          <input type="range" min={0} max={100} step={5} value={filters.minWinnability} onChange={(e) => onChange({ ...filters, minWinnability: Number(e.target.value) })} className={`h-11 w-full accent-[var(--color-gold)] ${FOCUS}`} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-canvas-text">
          <span>Sort by</span>
          <select value={filters.sort} onChange={(e) => onChange({ ...filters, sort: e.target.value as SortKey })} className={`min-h-11 rounded-[8px] border border-canvas-line bg-paper-raised px-2 text-[14px] font-semibold ${FOCUS}`}>
            {SORT_KEYS.map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => onChange(defaultTourFilters())} disabled={!hasActiveFilters(filters) && filters.sort === "winnability"} className={`inline-flex min-h-11 items-center rounded-[8px] bg-paper-raised px-3 text-[13px] font-semibold text-canvas-text hover:bg-[#3a3932] disabled:opacity-50 ${FOCUS}`}>Reset filters</button>
      </div>
      <p role="status" className="text-[12px] text-canvas-muted">Showing {shown} of {cities.length} {cities.length === 1 ? "city" : "cities"}</p>
    </section>
  );
}
