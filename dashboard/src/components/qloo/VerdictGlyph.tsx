import { VERDICT_SHAPE } from "@/lib/qloo/labels";
import type { Verdict } from "@/lib/qloo/types";

const COLOR: Record<Verdict, string> = {
  play: "var(--color-verdict-play)", hidden_goldmine: "var(--color-verdict-goldmine)", de_risk: "var(--color-verdict-derisk)",
  consider: "var(--color-verdict-consider)", skip: "var(--color-verdict-skip)", insufficient_data: "var(--color-verdict-skip)",
};

/** SVG mark for a verdict centred on 0,0 (r is the half-size). Used by the matrix and the legends. */
export function VerdictMark({ verdict, r = 6 }: { verdict: Verdict; r?: number }) {
  const c = COLOR[verdict];
  const shape = VERDICT_SHAPE[verdict];
  const ring = "var(--color-canvas)";
  switch (shape) {
    case "circle": return <circle data-shape={shape} r={r} fill={c} stroke={ring} strokeWidth={2} />;
    case "diamond": return <polygon data-shape={shape} points={`0,${-r - 2} ${r + 2},0 0,${r + 2} ${-r - 2},0`} fill={c} stroke={ring} strokeWidth={2} />;
    case "triangle": return <polygon data-shape={shape} points={`0,${-r - 2} ${r + 2},${r} ${-r - 2},${r}`} fill={c} stroke={ring} strokeWidth={2} />;
    case "ring": return <circle data-shape={shape} r={r} fill="none" stroke={c} strokeWidth={2.5} />;
    case "x": {
      const h = r - 1;
      return <path data-shape={shape} d={`M${-h},${-h}L${h},${h}M${h},${-h}L${-h},${h}`} fill="none" stroke={c} strokeWidth={2.5} strokeLinecap="round" />;
    }
    default: return <rect data-shape={shape} x={-r + 1} y={-r + 1} width={(r - 1) * 2} height={(r - 1) * 2} fill="none" stroke={c} strokeWidth={2} opacity={0.6} />;
  }
}

/** Small inline legend glyph (14 px box). */
export function VerdictGlyph({ verdict }: { verdict: Verdict }) {
  return (
    <svg width={14} height={14} viewBox="-7 -7 14 14" aria-hidden className="shrink-0 overflow-visible">
      <VerdictMark verdict={verdict} r={5} />
    </svg>
  );
}
