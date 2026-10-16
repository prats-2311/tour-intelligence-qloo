import { SampleBanner } from "@/components/qloo/SampleBanner";
import type { ProvenanceRow } from "@/lib/qloo/tourBook";

const TH = "px-2 py-2 text-left font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-canvas-muted";

export function ProvenanceAppendix({ rows, sample = false }: { rows: ProvenanceRow[]; sample?: boolean }) {
  const title = `Provenance · ${rows.length} Qloo ${rows.length === 1 ? "request" : "requests"}`;
  return (
    <section id="chapter-provenance" aria-labelledby="provenance-title" className="book-chapter flex min-w-0 flex-col gap-4 px-4 lg:px-0">
      {sample && <SampleBanner compact />}
      <h2 id="provenance-title" className="font-title text-[32px] leading-[1.1] text-canvas-text">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-[13px] text-canvas-muted">No Qloo requests were recorded for this book.</p>
      ) : (
        <>
        <p className="text-[13px] text-canvas-muted md:hidden">Table scrolls sideways</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] border-collapse">
            <thead>
              <tr className="border-b border-canvas-line">
                <th scope="col" className={TH}>#</th><th scope="col" className={TH}>Tool</th><th scope="col" className={TH}>Inputs</th>
                <th scope="col" className={TH}>Status</th><th scope="col" className={TH}>Cached</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.cacheKey} className="h-11 border-b border-canvas-line align-middle text-[13px] text-canvas-text lg:h-10">
                  <td className="px-2 font-mono tabular-nums">{r.n}</td>
                  <td className="px-2">
                    <span className="block">{r.tool}</span>
                    <span className="block font-mono text-[11px] text-canvas-muted" title={r.cacheKey}>{r.hash}</span>
                  </td>
                  <td className="max-w-[160px] break-words px-2 text-canvas-muted">{r.inputs || "—"}</td>
                  <td className="px-2">{r.status}</td>
                  <td className="px-2">{r.cached ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </section>
  );
}
