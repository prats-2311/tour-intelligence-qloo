import { useState } from "react";
import { compareKey, loadCompare, useCompare } from "@/lib/qloo/compareStore";
import type { SegmentRequest } from "@/lib/qloo/segmentStore";
import { COMPARE_LIVE_LABEL, COMPARE_NOTE, COMPARE_TIMEOUT_COPY, COMPARE_TOGGLE, COMPARE_UNAVAILABLE_COPY, compareSummary, pickLine, qlooLine } from "@/lib/qloo/sponsorsCompare";
import { Caption, Row, Rows } from "./rows";

const BTN = "inline-flex min-h-11 items-center rounded-full bg-paper-raised px-3 text-[13px] font-medium text-canvas-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

/**
 * "Compare: the same model, without Qloo". Collapsed on load; nothing is fetched until it is opened. Gemini alone picks five brands
 * and each is placed on Qloo's own fan ranking, so this measures how far the model's memory strays from these fans' taste, not whether Qloo is right.
 */
export function SponsorsCompare({ request }: { request: SegmentRequest }) {
  const key = compareKey(request.artistId, request.city);
  const state = useCompare(key);
  const [open, setOpen] = useState(false);
  const ask = () => { void loadCompare(request); };
  const toggle = () => { const next = !open; setOpen(next); if (next) ask(); };
  const data = state.status === "done" ? state.data : null;
  const timedOut = data?.status === "unavailable" && data.reason === "timeout";
  return (
    <div data-testid="sponsors-compare" data-tour="sponsors-compare" className="mt-3 border-t border-canvas-line pt-2" data-noprint>
      <button type="button" aria-expanded={open} onClick={toggle} className={BTN}>{COMPARE_TOGGLE}</button>
      <Caption>{COMPARE_LIVE_LABEL}</Caption>
      {open && (
        <div className="mt-2">
          {state.status === "loading" && <div data-testid="compare-skeleton" aria-busy="true" aria-label="Loading the comparison" className="flex flex-col gap-2"><div className="skeleton h-4 w-3/4 rounded-md" /><div className="skeleton h-11 w-full rounded-md" /><div className="skeleton h-11 w-full rounded-md" /></div>}
          {timedOut && (
            <div data-testid="compare-timeout" role="alert" className="flex flex-wrap items-center gap-2 text-[13px] text-canvas-muted">
              <span>{COMPARE_TIMEOUT_COPY}</span>
              <button type="button" onClick={ask} className={BTN}>Try again</button>
            </div>
          )}
          {data?.status === "unavailable" && !timedOut && <p data-testid="compare-unavailable" className="text-[13px] text-canvas-muted">{COMPARE_UNAVAILABLE_COPY}</p>}
          {data?.status === "ok" && (
            <div data-testid="compare-result" className="flex flex-col gap-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <section data-testid="compare-qloo" aria-label="Qloo">
                  <h4 className="text-[13px] font-medium uppercase tracking-wide text-canvas-muted">Qloo</h4>
                  {data.qlooTop
                    ? <Rows><Row name={data.qlooTop.name} aside={qlooLine(data.qlooTop)} /></Rows>
                    : <p className="mt-2 text-[13px] text-canvas-muted">No Qloo pick to show.</p>}
                </section>
                <section data-testid="compare-gemini" aria-label="Gemini alone">
                  <h4 className="text-[13px] font-medium uppercase tracking-wide text-canvas-muted">Gemini alone</h4>
                  <Rows>{data.brands.map((b, i) => <Row key={`${b.name}-${i}`} name={b.name} aside={pickLine(b)} />)}</Rows>
                </section>
              </div>
              {compareSummary(data.brands) && <p data-testid="compare-summary" className="text-[14px] font-medium text-canvas-text">{compareSummary(data.brands)}</p>}
              <p data-testid="compare-note" className="text-[13px] text-canvas-muted">{COMPARE_NOTE}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
