import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { computeMoves, reasonFor, unplacedCities, type Move } from "@/lib/qloo/moves";
import type { ScoredCity, ScoringConfig } from "@/lib/qloo/types";

export const MOVES_HEADING = "Where fan heat and winnability disagree";
export const MOVES_SUBLINE = "Fan heat says where the fans are. Winnability adds how winnable the city is. These cities move most between the two.";
export const MOVES_PLACEHOLDER = "Ranking moves appear when the board finishes.";
export const MOVES_AGREE = "Fan heat and winnability agree on this board.";
const TOP = 3;
// Row and list heights are fixed so the placeholder and the finished list occupy the same space (no layout shift).
const ROW_H = "h-[116px] lg:h-[98px]";
const LIST_H = "min-h-[352px] lg:min-h-[298px]";

function Row({ move, reason, selected, onSelect }: { move: Move; reason: string; selected: boolean; onSelect: (id: string) => void }) {
  const { city, fanRank, winRank, delta } = move;
  const up = delta > 0;
  const Icon = delta === 0 ? Minus : up ? ArrowUp : ArrowDown;
  const word = delta === 0 ? "holds" : `${up ? "up" : "down"} ${Math.abs(delta)}`;
  return (
    <li data-testid="move-row" className={`list-none overflow-hidden rounded-[10px] ${selected ? "bg-paper-raised" : "bg-paper hover:bg-paper-raised"}`}>
      <button type="button" aria-pressed={selected} onClick={() => onSelect(city.id)} className={`flex w-full min-w-0 flex-col justify-center gap-1 px-3 py-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold ${ROW_H}`}>
        <span className="flex min-w-0 items-baseline gap-x-1.5">
          <span className="font-title min-w-0 truncate text-[16px] leading-tight text-canvas-text">{city.name}</span>
          <span className="shrink-0 text-[12px] font-medium text-canvas-muted">{city.country}</span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 self-center font-mono text-[13px] font-bold text-canvas-text tabular">
            <Icon size={14} aria-hidden />
            {delta !== 0 && <span aria-hidden>{Math.abs(delta)}</span>}
            <span className="sr-only">{word}</span>
          </span>
        </span>
        <span className="text-[13px] leading-tight text-canvas-text">
          {delta === 0 ? `holds #${fanRank}` : `#${fanRank} on fan heat → #${winRank} on winnability`}
        </span>
        <span className="line-clamp-3 text-[12px] lg:line-clamp-2 leading-[1.4] text-canvas-muted">{reason}</span>
      </button>
    </li>
  );
}

/** Leads the Decide screen: the cities whose rank on fan heat differs most from their rank on winnability. Descriptive only. */
export function MovesSection({ cities, scoring, done, selectedId, onSelect }: { cities: ScoredCity[]; scoring?: ScoringConfig | null; done: boolean; selectedId?: string | null; onSelect: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const moves = useMemo(() => (done ? computeMoves(cities) : []), [cities, done]);
  const unplaced = useMemo(() => unplacedCities(cities), [cities]);
  const agree = done && moves.every((m) => m.delta === 0);
  const shown = all ? moves : moves.slice(0, TOP);
  const canExpand = done && !agree && moves.length > TOP;
  return (
    <section aria-labelledby="moves-heading" data-testid="moves-section" className="flex min-w-0 flex-col gap-2">
      <h2 id="moves-heading" className="font-title text-[18px] leading-tight text-canvas-text">{MOVES_HEADING}</h2>
      <p className="min-h-[2.1rem] text-[12px] leading-[1.4] text-canvas-muted lg:min-h-[1.1rem] lg:text-[13px]">{MOVES_SUBLINE}</p>
      <div className={all ? "" : LIST_H}>
        {!done ? (
          <p role="status" className="text-[13px] text-canvas-muted">{MOVES_PLACEHOLDER}</p>
        ) : agree ? (
          <p className="text-[13px] text-canvas-text">{MOVES_AGREE}</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {shown.map((m) => <Row key={m.city.id} move={m} reason={reasonFor(m, cities, scoring)} selected={m.city.id === selectedId} onSelect={onSelect} />)}
          </ul>
        )}
      </div>
      {done && unplaced.length > 0 && (
        <p className="min-h-[2.1rem] text-[12px] leading-[1.4] text-canvas-muted lg:min-h-[1.1rem]">{`Not ranked: ${unplaced.map((c) => c.name).join(", ")} (Qloo couldn't place them precisely).`}</p>
      )}
      <div className="min-h-11">
        {canExpand && (
          <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all} className="inline-flex min-h-11 items-center px-1 text-[13px] font-medium text-canvas-text underline-offset-[0.18em] hover:underline">
            {all ? "Show fewer" : "Show all moves"}
          </button>
        )}
      </div>
    </section>
  );
}
