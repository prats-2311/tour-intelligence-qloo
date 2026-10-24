import type { TourBook } from "@/lib/qloo/tourBook";

type Row = TourBook["market"]["slope"][number];

export const ordinal = (n: number): string => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
};

const joinNames = (xs: string[]): string => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

const W = 340, PAD_Y = 28, STEP = 26, LEFT = 118, RIGHT = W - 118;
const GOLD = "#ffcc00";

// Two columns of ranks (density-only, winnability). Highlighted climbers are gold 2 px; context lines are 1 px Stone.
export function SlopeChart({ rows, unplaced = [] }: { rows: Row[]; unplaced?: string[] }) {
  const n = Math.max(rows.length, 1);
  const h = PAD_Y + n * STEP + 8;
  const y = (rank: number) => PAD_Y + (rank - 1) * STEP + STEP / 2;
  const moves = rows.filter((r) => r.highlight).sort((a, b) => a.winRank - b.winRank).map((r) => `${r.name} ${ordinal(r.densityRank)} → ${ordinal(r.winRank)}`);
  const label = `Density-only rank against winnability rank for ${rows.length} markets.${moves.length ? ` Highlighted moves: ${moves.join(", ")}.` : " No market moves up."}`;
  const ordered = [...rows].sort((a, b) => Number(a.highlight) - Number(b.highlight));
  const byDensity = [...rows].sort((a, b) => a.densityRank - b.densityRank);
  const byWin = [...rows].sort((a, b) => a.winRank - b.winRank);
  return (
    <figure className="slope-chart m-0">
      <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${h}`} className="block h-auto w-full max-w-[420px]">
        <text x={LEFT} y={14} textAnchor="end" className="fill-canvas-muted" fontSize={11}>Density-only</text>
        <text x={RIGHT} y={14} textAnchor="start" className="fill-canvas-muted" fontSize={11}>Winnability</text>
        {ordered.map((r) => (
          <line
            key={r.id}
            data-highlight={r.highlight ? "true" : undefined}
            x1={LEFT + 6} y1={y(r.densityRank)} x2={RIGHT - 6} y2={y(r.winRank)}
            stroke={r.highlight ? GOLD : "#736e60"} strokeWidth={r.highlight ? 2 : 1} strokeLinecap="round"
          />
        ))}
        {byDensity.map((r) => (
          <text key={`l-${r.id}`} x={LEFT} y={y(r.densityRank) + 4} textAnchor="end" className="fill-canvas-text" fontSize={11} fontWeight={r.highlight ? 600 : 400}>{`${r.name} ${r.densityRank}`}</text>
        ))}
        {byWin.map((r) => (
          <text key={`r-${r.id}`} x={RIGHT} y={y(r.winRank) + 4} textAnchor="start" className="fill-canvas-text" fontSize={11} fontWeight={r.highlight ? 600 : 400}>{`${r.winRank} ${r.name}`}</text>
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-canvas-muted">
        {rows.some((r) => r.highlight) && <span className="inline-flex items-center gap-1.5"><span aria-hidden data-print-keep className="inline-block h-0.5 w-5" style={{ backgroundColor: GOLD }} />Hidden goldmine that climbs</span>}
        {rows.some((r) => !r.highlight) && <span className="inline-flex items-center gap-1.5"><span aria-hidden data-print-keep className="inline-block h-px w-5 bg-[#736e60]" />Other markets</span>}
        {unplaced.length > 0 && <span className="basis-full">{`Not scored: Qloo couldn't place ${joinNames(unplaced)}`}</span>}
      </figcaption>
    </figure>
  );
}
