import { requestsLine, type CallSummary } from "@/lib/qloo/callSummary";

const joinList = (xs: string[]): string => xs.join(", ");

/** Appendix after Provenance: how many Qloo calls each city's playbook made, which tools, and what they decided. */
export function CallsAppendix({ calls }: { calls: CallSummary }) {
  return (
    <section id="chapter-calls" aria-labelledby="calls-title" className="book-chapter flex min-w-0 flex-col gap-4 px-4 lg:px-0">
      <h2 id="calls-title" className="font-title text-[32px] leading-[1.1] text-canvas-text">Qloo calls behind this book</h2>
      <p data-testid="calls-total" className="text-[15px] text-canvas-text">{requestsLine(calls)}</p>
      {calls.cities.length === 0 ? (
        <p className="text-[13px] text-canvas-muted">No playbook calls were recorded for this book.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {calls.cities.map((c) => (
            <li key={c.id} data-testid="calls-city" className="flex min-w-0 flex-col gap-1">
              <h3 className="text-[15px] font-semibold text-canvas-text">{c.name} <span className="font-normal text-canvas-muted">· {c.calls} Qloo {c.calls === 1 ? "call" : "calls"}</span></h3>
              <p className="text-[13px] text-canvas-muted">Tools: {c.tools.length ? joinList(c.tools) : "none recorded"}</p>
              <p className="text-[13px] text-canvas-text">Decided: {c.decided.length ? joinList(c.decided) : "nothing recorded"}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
