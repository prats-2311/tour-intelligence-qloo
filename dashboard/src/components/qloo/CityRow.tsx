import { motion, useReducedMotion } from "framer-motion";
import type { ScoredCity } from "@/lib/qloo/types";
import { DataWarningBadge } from "./DataWarningBadge";
import { DualBars } from "./DualBars";
import { VERDICT_LABEL, VerdictChip } from "./VerdictChip";

export function CityRow({ city, selected, dimActivation, onOpen }: { city: ScoredCity; selected?: boolean; dimActivation?: boolean; onOpen: (id: string) => void }) {
  const reduce = useReducedMotion();
  const w = city.winnability.value;
  const num = (s: { value: number | null }) => (s.value === null ? "not enough data" : String(Math.round(s.value)));
  const label = `${city.name}, ${city.country}: ${VERDICT_LABEL[city.verdict]}, winnability ${w === null ? "not available" : Math.round(w)}, fan heat ${num(city.fanHeat)}, activation ${num(city.activation)}. Open score breakdown`;
  return (
    <motion.li
      id={`city-row-${city.id}`}
      data-testid="city-row"
      data-city-id={city.id}
      layout={reduce ? false : "position"}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 38 }}
      className={`list-none first:rounded-t-[14px] last:rounded-b-[14px] ${selected ? "bg-paper-raised" : "bg-paper hover:bg-paper-raised"}`}
    >
      <button
        type="button"
        onClick={() => onOpen(city.id)}
        aria-label={label}
        className="flex min-h-[88px] w-full min-w-0 items-center justify-between gap-3 rounded-[inherit] px-3 py-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold lg:min-h-[72px] lg:py-2"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="font-title min-w-0 truncate text-[17px] leading-tight text-canvas-text">{city.name}</span>
            <span className="shrink-0 text-[12px] font-medium text-canvas-muted">{city.country}</span>
          </span>
          <span className={`block max-w-[240px] ${dimActivation ? "[&_[data-testid=bar-activation]]:opacity-30" : ""}`}>
            <DualBars fanHeat={city.fanHeat} activation={city.activation} />
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <VerdictChip verdict={city.verdict} />
          <span className="font-mono text-[24px] font-bold leading-none text-canvas-text tabular" aria-hidden>{w === null ? "—" : Math.round(w)}</span>
          <DataWarningBadge warnings={city.warnings} />
        </span>
      </button>
    </motion.li>
  );
}
