import { useState } from "react";
import { Link } from "react-router-dom";
import { VerdictMark } from "@/components/qloo/VerdictGlyph";
import { VERDICT_SHAPE } from "@/lib/qloo/labels";
import { buildQuadrant, INSIGHTS_VERDICT_LABEL, verdictLines } from "@/lib/qloo/tourInsights";
import type { ScoredCity, Thresholds } from "@/lib/qloo/types";
import { ChartFrame, FOCUS } from "./ChartFrame";

const W = 600, H = 400, L = 34, R = 14, T = 14, B = 28; // plot box inside the 600 x 400 viewBox
const px = (fan: number): number => L + (Math.min(100, Math.max(0, fan)) / 100) * (W - L - R);
const py = (act: number): number => H - B - (Math.min(100, Math.max(0, act)) / 100) * (H - T - B);
const LABELLED = 5;
const rnd = (v: number): number => Math.round(v);

/** Fan heat (x) against activation (y). Guide lines sit at the verdict thresholds of the run (`thresholds`), the shape is the verdict. */
export function QuadrantChart({ cities, thresholds, hrefFor }: { cities: ScoredCity[]; thresholds: Thresholds; hrefFor: (cityId: string) => string | null }) {
  const { points, skipped } = buildQuadrant(cities, thresholds);
  const lines = verdictLines(thresholds);
  const [active, setActive] = useState<string | null>(null);
  const top = new Set([...points].sort((a, b) => (b.winnability ?? -1) - (a.winnability ?? -1) || a.name.localeCompare(b.name)).slice(0, LABELLED).map((p) => p.id));
  const labelled = [...points].filter((p) => top.has(p.id)).sort((a, b) => (b.winnability ?? -1) - (a.winnability ?? -1));
  const tipPoint = points.find((p) => p.id === active);
  const summary = `Scatter chart of ${points.length} ${points.length === 1 ? "city" : "cities"}: fan heat across, activation up. Guide lines mark the verdict thresholds (fan ${lines.vertical.map((l) => l.at).join(" and ")}; activation ${lines.horizontal.map((l) => l.at).join(", ")}). ${points.map((p) => `${p.name} ${rnd(p.x)}, ${rnd(p.y)}`).join("; ")}.`;
  return (
    <ChartFrame
      title="Fan heat vs activation"
      caption="Each point is a city. The dashed guide lines are the verdict thresholds the scoring used for this run. Select a point to open its playbook."
      table={{ head: ["City", "Verdict", "Fan heat", "Activation"], rows: points.map((p) => [p.name, INSIGHTS_VERDICT_LABEL[p.verdict], rnd(p.x), rnd(p.y)]) }}
    >
      <div className="flex flex-col gap-1">
        <span className="text-[12px] text-canvas-muted">Activation (0 to 100)</span>
        <div className="relative w-full">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="block h-auto w-full">
            <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="var(--color-canvas)" rx={6} />
            {lines.vertical.map((g) => (
              <g key={`v${g.at}`} data-testid="guide-v" data-at={g.at}>
                <line x1={px(g.at)} x2={px(g.at)} y1={T} y2={H - B} stroke="var(--color-heat-3)" strokeDasharray="4 4" />
                <text x={px(g.at) + 3} y={H - B - 4} fontSize={11} fill="var(--color-canvas-muted)">{g.at}</text>
              </g>
            ))}
            {lines.horizontal.map((g) => (
              <g key={`h${g.at}`} data-testid="guide-h" data-at={g.at}>
                <line x1={L} x2={W - R} y1={py(g.at)} y2={py(g.at)} stroke="var(--color-heat-3)" strokeDasharray="4 4" />
                <text x={L + 4} y={py(g.at) - 3} fontSize={11} fill="var(--color-canvas-muted)">{g.at}</text>
              </g>
            ))}
            {[0, 50, 100].map((t) => <text key={t} x={px(t)} y={H - 10} fontSize={11} textAnchor="middle" fill="var(--color-canvas-muted)">{t}</text>)}
            {points.map((p) => (
              <g key={p.id} data-testid="quad-point" data-city={p.name} data-x={p.x} data-y={p.y} data-shape={VERDICT_SHAPE[p.verdict]} transform={`translate(${px(p.x)} ${py(p.y)})`}>
                <VerdictMark verdict={p.verdict} r={6} />
              </g>
            ))}
            {labelled.map((p) => <text key={p.id} data-testid="quad-label" x={p.x > 65 ? px(p.x) - 10 : px(p.x) + 10} textAnchor={p.x > 65 ? "end" : "start"} y={py(p.y) + 4} fontSize={12} fontWeight={600} fill="var(--color-canvas-text)" stroke="var(--color-canvas)" strokeWidth={3} paintOrder="stroke">{p.name}</text>)}
          </svg>
          {/* Focusable hit areas over the plot: the svg is one image for screen readers, these give keyboard and pointer access. */}
          <div className="absolute inset-0">
            {points.map((p) => {
              const href = hrefFor(p.id);
              const label = `${p.name}, ${INSIGHTS_VERDICT_LABEL[p.verdict]}, fan heat ${rnd(p.x)}, activation ${rnd(p.y)}`;
              const style = { left: `${(px(p.x) / W) * 100}%`, top: `${(py(p.y) / H) * 100}%` };
              const common = {
                "aria-label": label, style, onMouseEnter: () => setActive(p.id), onMouseLeave: () => setActive(null), onFocus: () => setActive(p.id), onBlur: () => setActive(null),
                onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Escape") setActive(null); },
                className: `absolute size-11 -translate-x-1/2 -translate-y-1/2 rounded-full ${FOCUS}`,
              };
              return href ? <Link key={p.id} to={href} {...common} /> : <button key={p.id} type="button" {...common} />;
            })}
            {tipPoint && (
              <div role="tooltip" className="pointer-events-none absolute z-10 flex min-w-[150px] -translate-x-1/2 -translate-y-[calc(100%+14px)] flex-col gap-0.5 rounded-[8px] bg-paper-raised px-2.5 py-2 text-[12px] leading-[1.35] text-canvas-text shadow-[0_0_0_1px_var(--color-canvas-line)]" style={{ left: `${Math.min(88, Math.max(12, (px(tipPoint.x) / W) * 100))}%`, top: `${(py(tipPoint.y) / H) * 100}%` }}>
                <strong className="text-[13px]">{tipPoint.name}</strong>
                <span>{INSIGHTS_VERDICT_LABEL[tipPoint.verdict]}</span>
                <span>Fan heat {rnd(tipPoint.x)}</span>
                <span>Activation {rnd(tipPoint.y)}</span>
                {tipPoint.winnability !== null && <span>Winnability {rnd(tipPoint.winnability)}</span>}
              </div>
            )}
          </div>
        </div>
        <span className="self-center text-[12px] text-canvas-muted">Fan heat (0 to 100)</span>
        {skipped > 0 && <p className="text-[12px] text-canvas-muted">{skipped} {skipped === 1 ? "city" : "cities"} not plotted (a score is missing).</p>}
      </div>
    </ChartFrame>
  );
}
