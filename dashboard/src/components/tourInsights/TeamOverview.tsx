import { Link } from "react-router-dom";
import { STATUS_LABEL, STATUSES, type Snapshot } from "@/lib/collab/types";
import { openThreadsByCity, statusCounts } from "@/lib/qloo/tourInsights";
import type { ScoredCity } from "@/lib/qloo/types";
import { ChartFrame, FOCUS } from "./ChartFrame";

const DOT: Record<(typeof STATUSES)[number], string> = { considering: "bg-verdict-consider", confirmed: "bg-verdict-play", on_hold: "bg-gold", dropped: "bg-verdict-skip" };

/** Team workspace only: how many cities sit in each status, and which cities have open (unresolved) discussion threads. */
export function TeamOverview({ cities, snapshot, hrefFor }: { cities: ScoredCity[]; snapshot: Snapshot; hrefFor: (cityId: string) => string | null }) {
  const counts = statusCounts(cities, snapshot);
  const threads = openThreadsByCity(cities, snapshot);
  const max = Math.max(1, ...STATUSES.map((s) => counts[s]));
  return (
    <ChartFrame
      title="Team status"
      caption="Cities by the status your team set; a city with no status counts as Considering."
      table={{ head: ["Status", "Cities"], rows: STATUSES.map((s) => [STATUS_LABEL[s], counts[s]]) }}
    >
      <div className="flex flex-col gap-4">
        <div role="img" aria-label={`Cities by team status: ${STATUSES.map((s) => `${STATUS_LABEL[s]} ${counts[s]}`).join(", ")}`} className="flex flex-col gap-2">
          {STATUSES.map((s) => (
            <div key={s} aria-hidden className="grid grid-cols-[96px_1fr_28px] items-center gap-2 text-[13px]">
              <span className="text-canvas-muted">{STATUS_LABEL[s]}</span>
              <span className="h-3 rounded-full bg-canvas"><span className={`block h-full rounded-full ${DOT[s]}`} style={{ width: `${(counts[s] / max) * 100}%` }} /></span>
              <span data-testid={`status-count-${s}`} className="text-right font-mono font-bold text-canvas-text tabular">{counts[s]}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-canvas-muted">Open threads</h3>
          {threads.length === 0 ? <p className="text-[14px] text-canvas-muted">No open threads.</p> : (
            <ul className="flex flex-col">
              {threads.map((t) => {
                const href = hrefFor(t.cityId);
                const body = <>{t.name} <span className="text-canvas-muted">· {t.threads} open {t.threads === 1 ? "thread" : "threads"}</span></>;
                return <li key={t.cityId}>{href ? <Link to={href} className={`inline-flex min-h-11 items-center text-[14px] text-canvas-text underline decoration-canvas-muted underline-offset-4 ${FOCUS}`}>{body}</Link> : <span className="inline-flex min-h-11 items-center text-[14px] text-canvas-text">{body}</span>}</li>;
              })}
            </ul>
          )}
        </div>
      </div>
    </ChartFrame>
  );
}
