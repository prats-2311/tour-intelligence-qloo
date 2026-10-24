import { SampleBanner } from "@/components/qloo/SampleBanner";
import { statusPlain } from "@/lib/qloo/labels";
import { provenanceLine, type CallSummary } from "@/lib/qloo/callSummary";
import type { ProvenanceRow } from "@/lib/qloo/tourBook";

const TH = "px-2 py-2 text-left font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-canvas-muted";

export function ProvenanceAppendix({ rows, calls, sample = false, showcase = false }: { rows: ProvenanceRow[]; calls?: CallSummary; sample?: boolean; showcase?: boolean }) {
  const title = calls ? "Provenance" : `Provenance · ${rows.length} Qloo ${rows.length === 1 ? "request" : "requests"}`;
  return (
    <section id="chapter-provenance" aria-labelledby="provenance-title" className="book-chapter flex min-w-0 flex-col gap-4 px-4 lg:px-0">
      {sample && <SampleBanner compact source={showcase ? "showcase" : "sample"} />}
      <h2 id="provenance-title" className="font-title text-[32px] leading-[1.1] text-canvas-text">{title}</h2>
      {calls && <p data-testid="provenance-calls" className="text-[15px] text-canvas-text">{provenanceLine(calls)}</p>}
      {calls && rows.length > 0 && <p className="text-[13px] text-canvas-muted">The table lists each distinct request once ({rows.length}); a repeated request is counted above but shown once.</p>}
      {rows.length === 0 ? (
        <p className="text-[13px] text-canvas-muted">No Qloo requests were recorded for this book.</p>
      ) : (
        <>
        <p className="text-[13px] text-canvas-muted md:hidden">Table scrolls sideways</p>
        <div tabIndex={0} role="region" aria-label="Qloo requests table" className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-gold">
          <table className="w-full min-w-[460px] border-collapse">
            <thead>
              <tr className="border-b border-canvas-line">
                <th scope="col" className={TH}>#</th><th scope="col" className={TH}>Request</th><th scope="col" className={TH}>Inputs</th>
                <th scope="col" className={TH}>Result</th><th scope="col" className={TH}>Cached</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.cacheKey} className="h-11 border-b border-canvas-line align-middle text-[13px] text-canvas-text lg:h-10">
                  <td className="px-2 font-mono tabular-nums">{r.n}</td>
                  <td className="px-2">
                    <span className="block">{r.name}</span>
                  </td>
                  <td className="max-w-[160px] break-words px-2 text-canvas-muted">{r.inputs || "—"}</td>
                  <td className="px-2"><span className="block">{statusPlain(r.status)}</span><span className="block text-[12px] text-canvas-muted">{r.resultCount} {r.resultCount === 1 ? "result" : "results"}</span></td>
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
