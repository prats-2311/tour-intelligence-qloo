import { useId, useState, type ReactNode } from "react";

export interface ChartTable { head: string[]; rows: Array<Array<string | number>> }

/**
 * Shared frame for an Insights chart: a text title, an optional caption, the plot, and the same data as a table.
 * The table is always in the page (visually hidden), and "Show as table" swaps the plot for it on screen.
 */
export function ChartFrame({ title, caption, table, children, className = "", empty }: { title: string; caption?: ReactNode; table: ChartTable; children: ReactNode; className?: string; /** When set, shown instead of the plot and table. */ empty?: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  const id = useId();
  return (
    <section aria-labelledby={`${id}-t`} className={`flex min-w-0 flex-col gap-3 rounded-[14px] bg-paper p-3 lg:p-4 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id={`${id}-t`} className="font-title text-[20px] leading-tight text-canvas-text">{title}</h2>
        {!empty && (
          <button type="button" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)} className="inline-flex min-h-11 items-center rounded-[8px] bg-paper-raised px-3 text-[13px] font-semibold text-canvas-text hover:bg-[#3a3932] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
            {asTable ? "Show as chart" : "Show as table"}
          </button>
        )}
      </div>
      {caption && <p className="text-[12px] leading-[1.45] text-canvas-muted">{caption}</p>}
      {empty ?? (
        <>
          {!asTable && children}
          <div className={asTable ? "overflow-x-auto" : "sr-only"}>
            <table className="w-full min-w-0 border-collapse text-left text-[13px] text-canvas-text">
              <caption className="sr-only">{title}</caption>
              <thead><tr>{table.head.map((h) => <th key={h} scope="col" className="whitespace-nowrap border-b border-canvas-line px-2 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-canvas-muted">{h}</th>)}</tr></thead>
              <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row" className="border-b border-canvas-line px-2 py-1.5 font-normal">{c}</th> : <td key={j} className="border-b border-canvas-line px-2 py-1.5 tabular">{c}</td>))}</tr>)}</tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
