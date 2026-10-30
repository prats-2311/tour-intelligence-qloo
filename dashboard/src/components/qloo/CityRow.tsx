import { motion, useReducedMotion } from "framer-motion";
import { LOCATION_UNRESOLVED_NOTE, LOCATION_UNRESOLVED_SHORT, FLOORED_SEED_NOTE, MAJOR_MARKET_LABEL, majorMarketNote, showsCappedNote } from "@/lib/qloo/labels";
import { ROUTING_LABEL, ROUTING_LABEL_NOTE, ROUTING_LOW_HEAT_NOTE } from "@/lib/qloo/routing";
import type { Score, ScoredCity } from "@/lib/qloo/types";
import { DataWarningBadge, warningLabel } from "./DataWarningBadge";
import { CloseCallChip } from "./CloseCallChip";
import { VerdictChip } from "./VerdictChip";
import { CityStatusChip } from "@/components/collab/Status";

/** Column template shared with the desktop header row in TourBoard. */
export const ROW_COLS_LG = "lg:grid-cols-[minmax(0,1fr)_96px_140px_32px]";

function MiniBar({ label, score, color, testId }: { label: string; score: Score; color: string; testId: string }) {
  const v = score.value === null || !Number.isFinite(score.value) ? null : Math.min(100, Math.max(0, Math.round(score.value)));
  const a11y =
    v === null
      ? { role: "img" as const, "aria-label": `${label}: not enough data` }
      : { role: "meter" as const, "aria-label": `${label} ${v} of 100`, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": v, "aria-valuetext": `${v} of 100` };
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="w-[52px] shrink-0 whitespace-nowrap text-[11px] text-canvas-muted lg:hidden" aria-hidden>{label}</span>
      <span {...a11y} className="relative h-[5px] min-w-0 flex-1 rounded-[3px] bg-[rgba(240,238,230,0.08)] lg:h-[4px]">
        {v !== null && <span data-testid={testId} className="absolute inset-y-0 left-0 rounded-[3px]" style={{ width: `${v}%`, background: color }} />}
      </span>
      <span data-testid="row-bar-value" className="min-w-6 shrink-0 text-right font-mono text-[12px] font-bold leading-none text-canvas-text tabular" aria-hidden>{v === null ? "—" : v}</span>
    </span>
  );
}

/** `openable: false` (a showcase city with no recorded playbook) renders a plain row: no button, no open affordance. */
export function CityRow({ city, selected, dimActivation, onOpen, openable = true }: { city: ScoredCity; selected?: boolean; dimActivation?: boolean; onOpen: (id: string) => void; openable?: boolean }) {
  const reduce = useReducedMotion();
  const w = city.winnability.value;
  const num = (s: { value: number | null }) => (s.value === null ? "not enough data" : String(Math.round(s.value)));
  const warn = warningLabel(city.warnings);
  const major = city.candidateSource === "major_market";
  const pasted = city.candidateSource === "your_routing";
  const unplaced = city.insufficientReason === "location_unresolved";
  const capped = showsCappedNote(city);
  const lowHeat = pasted && city.fanHeatFloor === true && city.verdict === "skip";
  const hasNotes = major || pasted || city.closeCall === true || !!warn || unplaced || capped || lowHeat;
  // The button's name is its visible content (WCAG 2.5.3 label-in-name); the numbers that content leaves out go in the description.
  const describedBy = `city-row-desc-${city.id}`;
  const description = `Winnability ${w === null ? "not available" : Math.round(w)}, fan heat ${num(city.fanHeat)}, activation ${num(city.activation)}. ${major ? `${majorMarketNote(city.country)} ` : ""}${pasted ? `${ROUTING_LABEL_NOTE} ` : ""}${capped ? `${FLOORED_SEED_NOTE} ` : ""}${lowHeat ? `${ROUTING_LOW_HEAT_NOTE} ` : ""}${unplaced ? `${LOCATION_UNRESOLVED_NOTE} ` : ""}${openable ? "Open score breakdown" : ""}`;
  const rowBody = (
    <>
        <span className="col-start-1 row-start-1 flex min-w-0 flex-col gap-0.5">
          <span data-testid="city-name" className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1">
            <span data-testid="city-name-text" className="font-title max-w-full break-words text-[16px] leading-tight text-canvas-text">{city.name}</span>
            <span className="shrink-0 text-[12px] font-medium text-canvas-muted">{city.country}</span>
            <CityStatusChip cityId={city.id} />
          </span>
          {hasNotes && (
            <span data-testid="row-notes" className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              {major && <span title={majorMarketNote(city.country)} className="inline-flex h-6 items-center whitespace-nowrap rounded-[4px] border border-canvas-line px-2 text-[12px] font-medium text-canvas-text">{MAJOR_MARKET_LABEL}</span>}
              {pasted && <span title={ROUTING_LABEL_NOTE} className="inline-flex h-6 items-center whitespace-nowrap rounded-[4px] border border-canvas-line px-2 text-[12px] font-medium text-canvas-text">{ROUTING_LABEL}</span>}
              {city.closeCall && <CloseCallChip />}
              {warn && <DataWarningBadge warnings={city.warnings} />}
              {unplaced && <span className="text-[12px] text-canvas-muted">{LOCATION_UNRESOLVED_SHORT}</span>}
              {capped && <span className="basis-full text-[12px] leading-snug text-canvas-muted">{FLOORED_SEED_NOTE}</span>}
              {lowHeat && <span className="basis-full text-[12px] leading-snug text-canvas-muted">{ROUTING_LOW_HEAT_NOTE}</span>}
            </span>
          )}
        </span>
        <span className={`col-span-3 col-start-1 row-start-2 grid min-w-0 grid-cols-2 gap-3 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:grid-cols-1 lg:gap-1.5 ${dimActivation ? "[&_[data-testid=bar-activation]]:opacity-30" : ""}`}>
          <MiniBar label="Fan heat" score={city.fanHeat} color="var(--color-bone)" testId="bar-fanheat" />
          <MiniBar label="Activation" score={city.activation} color="var(--color-gold)" testId="bar-activation" />
        </span>
        <span data-testid="row-chip" className="col-start-2 row-start-1 justify-self-end lg:col-start-3"><VerdictChip verdict={city.verdict} /></span>
        <span data-testid="row-score" className="col-start-3 row-start-1 min-w-8 text-right lg:col-start-4 font-mono text-[20px] font-bold leading-none text-canvas-text tabular lg:text-[18px]" aria-hidden>{w === null ? "—" : Math.round(w)}</span>
    </>
  );
  return (
    <motion.li
      id={`city-row-${city.id}`}
      data-testid="city-row"
      data-city-id={city.id}
      data-tour={`city-${city.id}`}
      data-city-name={city.name}
      layout={reduce ? false : "position"}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 38 }}
      className={`list-none first:rounded-t-[14px] last:rounded-b-[14px] ${selected ? "bg-paper-raised" : openable ? "bg-paper hover:bg-paper-raised" : "bg-paper"}`}
    >
      <span id={describedBy} className="sr-only">{description}</span>
      {openable ? (
        <button
          type="button"
          onClick={() => onOpen(city.id)}
          aria-describedby={describedBy}
          className={`grid min-h-[64px] w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1.5 rounded-[inherit] px-3 py-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold lg:min-h-[48px] lg:gap-y-0 lg:py-1 ${ROW_COLS_LG}`}
        >
          {rowBody}
        </button>
      ) : (
        <div data-static-row className={`grid min-h-[64px] w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1.5 rounded-[inherit] px-3 py-2 text-left lg:min-h-[48px] lg:gap-y-0 lg:py-1 ${ROW_COLS_LG}`}>
          {rowBody}
        </div>
      )}
    </motion.li>
  );
}
