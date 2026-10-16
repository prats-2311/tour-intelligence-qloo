import { VerdictChip } from "@/components/qloo/VerdictChip";
import { INTEGRITY_LINE } from "@/lib/qloo/labels";
import type { TourBook } from "@/lib/qloo/tourBook";
import type { Score } from "@/lib/qloo/types";
import { SlopeChart } from "./SlopeChart";

const num = (s: Score): string => (s.value === null || !Number.isFinite(s.value) ? "—" : String(Math.round(s.value)));
const TH = "px-3 py-2 text-right font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-canvas-muted";
const TD_NUM = "px-3 text-right font-mono text-[13px] font-medium tabular-nums text-canvas-text";

export function MarketChapter({ market }: { market: TourBook["market"] }) {
  return (
    <section id="chapter-market" aria-labelledby="market-title" className="book-chapter flex min-w-0 flex-col gap-6 px-4 lg:px-0">
      <h2 id="market-title" className="font-title text-[32px] leading-[1.1] text-canvas-text">Market selection</h2>
      <ul aria-label="Scored markets" className="flex flex-col gap-0.5 md:hidden">
        {market.rows.map((c) => {
          const on = market.shortlisted.has(c.id);
          return (
            <li key={c.id} className="relative flex min-w-0 flex-col gap-1 rounded-[10px] bg-paper px-4 py-2">
              {on && <span data-shortlisted-edge data-print-keep aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-[#ffcc00]" />}
              <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="min-w-0 truncate text-[15px] font-medium text-canvas-text">{c.name}{on && <span className="sr-only"> (shortlisted)</span>}</span>
                <span className="shrink-0"><VerdictChip verdict={c.verdict} /></span>
              </div>
              <p className="text-[13px] tabular-nums text-canvas-muted">Heat {num(c.fanHeat)} · Act {num(c.activation)} · Win {num(c.winnability)}</p>
            </li>
          );
        })}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[420px] border-collapse">
          <caption className="sr-only">Scored markets; shortlisted markets carry a gold edge</caption>
          <thead>
            <tr className="border-b border-canvas-line">
              <th scope="col" className={`${TH} sticky left-0 bg-canvas text-left lg:bg-paper`}>City</th>
              <th scope="col" className={TH}>Heat</th>
              <th scope="col" className={TH}>Activation</th>
              <th scope="col" className={TH}>Win</th>
              <th scope="col" className={`${TH} text-left`}>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {market.rows.map((c) => {
              const on = market.shortlisted.has(c.id);
              return (
                <tr key={c.id} className="h-11 border-b border-canvas-line lg:h-10">
                  <th scope="row" className="sticky left-0 bg-canvas py-0 pl-4 pr-3 text-left text-[13px] font-medium text-canvas-text lg:bg-paper">
                    {on && <span data-shortlisted-edge data-print-keep aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-[#ffcc00]" />}
                    {c.name}
                    {on && <span className="sr-only"> (shortlisted)</span>}
                  </th>
                  <td className={TD_NUM}>{num(c.fanHeat)}</td>
                  <td className={TD_NUM}>{num(c.activation)}</td>
                  <td className={TD_NUM}>{num(c.winnability)}</td>
                  <td className="px-3"><VerdictChip verdict={c.verdict} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="text-[17px] font-semibold text-canvas-text">Density-only vs winnability</h3>
        <SlopeChart rows={market.slope} />
      </div>
      <p className="text-[12px] text-canvas-muted">{INTEGRITY_LINE}</p>
    </section>
  );
}
