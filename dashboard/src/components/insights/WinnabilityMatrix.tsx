import { useId, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { VerdictChip } from "@/components/qloo/VerdictChip";
import { VerdictGlyph, VerdictMark } from "@/components/qloo/VerdictGlyph";
import { DEFAULT_SCORING_DISPLAY, VERDICT_LABEL } from "@/lib/qloo/labels";
import { linear, matrixPoints, nearestPoint, placeLabels, verdictRegions } from "@/lib/qloo/geometry";
import type { ScoredCity, Thresholds, Verdict } from "@/lib/qloo/types";

const W = 480, H = 320, PAD = 36;
const LEGEND: Verdict[] = ["play", "hidden_goldmine", "de_risk", "consider", "skip", "insufficient_data"];

/** Shape carries the verdict, not colour alone: same VERDICT_SHAPE map as the Tour Board map markers. */
function Mark({ verdict, selected }: { verdict: Verdict; selected: boolean }) {
  return <>{selected && <circle r={13} fill="none" stroke="var(--color-gold)" strokeWidth={2} />}<VerdictMark verdict={verdict} /></>;
}

function summary(cities: ScoredCity[], plotted: number): string {
  const names = (v: Verdict) => cities.filter((c) => c.verdict === v && c.fanHeat.value !== null && c.activation.value !== null)
    .map((c) => `${c.name} (heat ${Math.round(c.fanHeat.value!)}, activation ${Math.round(c.activation.value!)})`);
  const parts = (["hidden_goldmine", "play"] as const).map((v) => names(v).length > 0 ? `${VERDICT_LABEL[v]}: ${names(v).join(", ")}` : null).filter(Boolean);
  const skipped = cities.length - plotted;
  return `Winnability matrix, fan heat on the x axis against activation on the y axis. ${plotted} ${plotted === 1 ? "market" : "markets"} plotted${skipped > 0 ? `, ${skipped} without activation data not plotted` : ""}. ${parts.join(". ")}${parts.length ? "." : ""}`;
}

export function WinnabilityMatrix({ cities, thresholds = DEFAULT_SCORING_DISPLAY.thresholds, selectedId, onSelect, calls, onReset }: { cities: ScoredCity[]; thresholds?: Thresholds; selectedId: string | null; onSelect: (id: string) => void; calls: number; onReset: () => void }) {
  const [view, setView] = useState<"matrix" | "table">("matrix");
  const capId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const pts = matrixPoints(cities, { w: W, h: H, pad: PAD });
  const sx = linear([0, 100], [PAD, W - PAD]);
  const sy = linear([0, 100], [H - PAD, PAD]);
  const regions = verdictRegions(thresholds);
  const zone = (id: string, [x0, x1]: [number, number], [y0, y1]: [number, number], fill: string) =>
    <rect data-testid={`region-${id}`} x={sx(x0)} y={sy(y1)} width={sx(x1) - sx(x0)} height={sy(y0) - sy(y1)} fill={fill} />;
  const [hoverId, setHoverId] = useState<string | null>(null);
  // Label the plays and goldmines first, highest winnability first; whatever does not fit is named on hover, focus or selection.
  const labelOrder = [...pts].filter((p) => p.verdict === "play" || p.verdict === "hidden_goldmine").sort((a, b) => a.y - b.y);
  const labels = placeLabels(labelOrder, { w: W, h: H });
  // Pointer hits resolve to the nearest point within 22 CSS px, so close neighbours never shadow each other.
  const pickNearest = (e: MouseEvent) => {
    const box = svgRef.current?.getBoundingClientRect();
    const scale = box && box.width > 0 ? box.width / W : 1;
    const x = (e.clientX - (box?.left ?? 0)) / scale;
    const y = (e.clientY - (box?.top ?? 0)) / scale;
    const id = nearestPoint(pts, x, y, 22 / scale);
    if (id) onSelect(id);
  };
  const keyActivate = (id: string) => (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(id); } };
  const tab = (on: boolean) => `h-11 min-w-14 rounded-[6px] px-3 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${on ? "bg-paper-raised text-canvas-text" : "text-canvas-muted hover:text-canvas-text"}`;
  const zoneText = { fontSize: 10, fill: "var(--color-canvas-muted)", letterSpacing: "0.08em" } as const;

  return (
    <section aria-label="Winnability matrix" className="flex min-w-0 flex-col gap-3 rounded-[14px] bg-paper p-3 lg:p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-title text-[20px] leading-tight text-canvas-text">Winnability matrix</h2>
          <p className="mt-1 text-[12px] text-canvas-muted">X: fan heat · Y: activation readiness</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-[6px] bg-canvas-raised px-2 py-1 font-mono text-[11px] text-canvas-muted">Qloo · {calls} requests</span>
          <div className="flex rounded-[8px] bg-canvas p-0.5" role="group" aria-label="Matrix view">
            <button type="button" aria-pressed={view === "matrix"} onClick={() => setView("matrix")} className={tab(view === "matrix")}>Matrix</button>
            <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")} className={tab(view === "table")}>Table</button>
          </div>
        </div>
      </header>

      {cities.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[10px] bg-canvas px-4 py-10 text-center">
          <p className="text-[14px] text-canvas-text">No markets match the filters</p>
          <button type="button" onClick={onReset} className="min-h-11 rounded-[8px] bg-paper-raised px-4 text-[13px] font-semibold text-canvas-text hover:bg-[#3a3932]">Reset filters</button>
        </div>
      ) : view === "matrix" ? (
        <figure role="group" aria-labelledby={capId} className="m-0">
        <figcaption id={capId} className="sr-only">{summary(cities, pts.length)}</figcaption>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded-[10px] bg-canvas">
          {zone("hidden_goldmine", regions.hidden_goldmine.fan, regions.hidden_goldmine.act, "rgba(255,204,0,0.10)")}
          {zone("play", regions.play.fan, regions.play.act, "rgba(15,157,138,0.10)")}
          {zone("de_risk", regions.de_risk.fan, regions.de_risk.act, "rgba(232,96,111,0.10)")}
          {[0, 50, 100].map((t) => (
            <g key={t}>
              <line x1={sx(t)} x2={sx(t)} y1={sy(0)} y2={sy(100)} stroke="rgba(240,238,230,0.06)" />
              <line x1={sx(0)} x2={sx(100)} y1={sy(t)} y2={sy(t)} stroke="rgba(240,238,230,0.06)" />
              <text x={sx(t)} y={H - PAD + 14} textAnchor="middle" fontSize={11} fill="var(--color-canvas-muted)">{t}</text>
              <text x={PAD - 6} y={sy(t) + 4} textAnchor="end" fontSize={11} fill="var(--color-canvas-muted)">{t}</text>
            </g>
          ))}
          <text x={sx(regions.hidden_goldmine.fan[0]) + 4} y={sy(100) + 12} {...zoneText}>GOLDMINE</text>
          <text x={sx(100) - 4} y={sy(100) + 12} textAnchor="end" {...zoneText}>PLAY</text>
          <text x={sx(100) - 4} y={sy(0) - 6} textAnchor="end" {...zoneText}>DE-RISK</text>
          <text x={sx(0) + 4} y={sy(0) - 6} {...zoneText}>CONSIDER / SKIP</text>
          <text x={W / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="var(--color-canvas-muted)">Fan heat →</text>
          <text transform={`translate(10 ${H / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fill="var(--color-canvas-muted)">Activation →</text>
          <rect data-testid="matrix-overlay" x={0} y={0} width={W} height={H} fill="transparent" onClick={pickNearest} />
          {pts.map((p) => {
            const on = p.id === selectedId;
            const placed = labels.get(p.id);
            const showName = !!placed || on || hoverId === p.id;
            const l = placed ?? { dx: p.x > W - PAD - 70 ? -12 : 12, dy: 4, anchor: p.x > W - PAD - 70 ? "end" as const : "start" as const };
            return (
              <g
                key={p.id}
                data-testid="matrix-point"
                data-city-id={p.id}
                role="button"
                tabIndex={0}
                aria-pressed={on}
                aria-label={`${p.name}: ${VERDICT_LABEL[p.verdict]}`}
                transform={`translate(${p.x} ${p.y})`}
                className="cursor-pointer focus-visible:outline-2 focus-visible:outline-gold"
                onClick={() => onSelect(p.id)}
                onKeyDown={keyActivate(p.id)}
                onMouseEnter={() => setHoverId(p.id)}
                onMouseLeave={() => setHoverId((h) => (h === p.id ? null : h))}
                onFocus={() => setHoverId(p.id)}
                onBlur={() => setHoverId((h) => (h === p.id ? null : h))}
              >
                <title>{`${p.name}: ${VERDICT_LABEL[p.verdict]}`}</title>
                <Mark verdict={p.verdict} selected={on} />
                {showName && (
                  <text data-testid="matrix-label" x={l.dx} y={l.dy} textAnchor={l.anchor} fontSize={12} fontWeight={600} fill="var(--color-canvas-text)" stroke="var(--color-canvas)" strokeWidth={3} paintOrder="stroke">{p.name}</text>
                )}
              </g>
            );
          })}
        </svg>
        </figure>
      ) : (
        <div data-testid="matrix-table" tabIndex={0} role="region" aria-label="Market scores table, scrolls horizontally" className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-gold">
          <table className="w-full min-w-[360px] border-collapse text-[13px]">
            <caption className="sr-only">Fan heat and activation by market</caption>
            <thead>
              <tr className="border-b border-canvas-line font-mono text-[11px] uppercase tracking-[0.08em] text-canvas-muted">
                <th scope="col" className="py-2 text-left font-medium">City</th>
                <th scope="col" className="py-2 text-right font-medium">Fan heat</th>
                <th scope="col" className="py-2 text-right font-medium">Activation</th>
                <th scope="col" className="py-2 text-right font-medium">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {cities.map((c) => (
                <tr key={c.id} className="h-11 border-b border-canvas-line last:border-b-0 lg:h-10">
                  <th scope="row" className="text-left font-normal text-canvas-text">{c.name}</th>
                  <td className="text-right font-mono tabular text-canvas-text">{c.fanHeat.value === null ? "—" : Math.round(c.fanHeat.value)}</td>
                  <td className="text-right font-mono tabular text-canvas-text">{c.activation.value === null ? "—" : Math.round(c.activation.value)}</td>
                  <td className="text-right"><VerdictChip verdict={c.verdict} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-canvas-text" aria-label="Legend">
        {LEGEND.map((v) => <li key={v} className="inline-flex items-center gap-1.5"><VerdictGlyph verdict={v} />{VERDICT_LABEL[v]}</li>)}
      </ul>
    </section>
  );
}
