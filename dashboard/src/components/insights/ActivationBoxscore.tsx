import { VerdictChip } from "@/components/qloo/VerdictChip";
import { sortCities } from "@/lib/qloo/ranking";
import type { ComponentName, ScoredCity } from "@/lib/qloo/types";

const COLS: Array<{ key: ComponentName; label: string; weight: string }> = [
  { key: "sponsor_fit", label: "Sponsor", weight: "0.30" },
  { key: "local_hooks", label: "Hooks", weight: "0.25" },
  { key: "fan_concentration", label: "Concentration", weight: "0.25" },
  { key: "venue_fit", label: "Venue", weight: "0.20" },
];

const th = "px-3 py-2 text-right align-bottom font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-canvas-muted";

function Num({ v, bar, digits }: { v: number | null | undefined; bar: string; digits: 0 | 2 }) {
  if (v === null || v === undefined) return <span className="font-mono text-[13px] text-canvas-muted" aria-label="not available">—</span>;
  const pct = Math.min(100, Math.max(0, digits === 2 ? v * 100 : v));
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span aria-hidden className="relative hidden h-[4px] w-10 rounded-[2px] bg-[rgba(240,238,230,0.08)] sm:block">
        <span className="absolute inset-y-0 left-0 rounded-[2px]" style={{ width: `${pct}%`, background: bar }} />
      </span>
      <span className="min-w-8 font-mono text-[13px] font-medium text-canvas-text tabular">{digits === 2 ? v.toFixed(2) : Math.round(v)}</span>
    </span>
  );
}

export function ActivationBoxscore({ cities, selectedId, onSelect }: { cities: ScoredCity[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const rows = sortCities(cities, "winnability").sort((a, b) => (b.activation.value ?? -1) - (a.activation.value ?? -1));
  return (
    <section aria-label="Activation boxscore" className="rounded-[14px] bg-paper p-3 lg:p-4">
      <h2 className="font-title text-[20px] leading-tight text-canvas-text">Activation breakdown</h2>
      <p className="mb-3 mt-1 text-[12px] text-canvas-muted">Sorted by activation, high to low. Weights: sponsor 0.30 · hooks 0.25 · concentration 0.25 · venue 0.20.</p>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Activation boxscore table, scrolls horizontally">
        <table className="w-full min-w-[680px] border-collapse">
          <thead>
            <tr className="border-b border-canvas-line">
              <th scope="col" className={`${th} sticky left-0 z-10 bg-paper text-left`}>City</th>
              {COLS.map((c) => <th key={c.key} scope="col" className={th}>{c.label}<br /><span className="normal-case">({c.weight})</span></th>)}
              <th scope="col" className={`${th} text-gold`}>Activation</th>
              <th scope="col" className={th}>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-[13px] text-canvas-muted">No markets match the filters.</td></tr>}
            {rows.map((c) => {
              const on = c.id === selectedId;
              const bg = on ? "bg-paper-raised" : "bg-paper";
              return (
                <tr key={c.id} data-testid="boxscore-row" data-city-id={c.id} className={`h-11 border-b border-canvas-line last:border-b-0 hover:bg-paper-raised lg:h-10 [&>*]:align-middle ${bg}`}>
                  <th scope="row" className={`sticky left-0 z-10 px-3 text-left font-normal ${bg}`}>
                    <button type="button" aria-pressed={on} onClick={() => onSelect(c.id)} className="flex min-h-11 items-center gap-1.5 whitespace-nowrap text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold lg:min-h-9">
                      <span className="font-title text-[15px] text-canvas-text">{c.name}</span>
                      <span className="text-[12px] text-canvas-muted">{c.country}</span>
                    </button>
                  </th>
                  {COLS.map((k) => <td key={k.key} className="px-3 text-right"><Num v={c.activation.components[k.key]} bar="var(--color-bone)" digits={2} /></td>)}
                  <td className="px-3 text-right"><Num v={c.activation.value} bar="var(--color-gold)" digits={0} /></td>
                  <td className="px-3 text-right"><VerdictChip verdict={c.verdict} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
