import { Link } from "react-router-dom";
import { VerdictGlyph } from "@/components/qloo/VerdictGlyph";
import { cityScoreRows, INSIGHTS_VERDICT_LABEL } from "@/lib/qloo/tourInsights";
import type { ScoredCity } from "@/lib/qloo/types";
import { ChartFrame, FOCUS } from "./ChartFrame";

const METRICS = [
  { key: "fanHeat", id: "bar-fan", label: "Fan heat", color: "var(--color-bone)" },
  { key: "activation", id: "bar-act", label: "Activation", color: "var(--color-gold)" },
  { key: "winnability", id: "bar-win", label: "Winnability", color: "var(--color-heat-3)" },
] as const;

const clamp = (v: number): number => Math.min(100, Math.max(0, Math.round(v)));
const text = (v: number | null): string => (v === null ? "not enough data" : String(clamp(v)));

/** Horizontal grouped bars per city (fan heat, activation, winnability). A row opens that city's playbook when `hrefFor` gives one. */
export function CityScoresChart({ cities, hrefFor }: { cities: ScoredCity[]; hrefFor: (cityId: string) => string | null }) {
  const rows = cityScoreRows(cities);
  return (
    <ChartFrame
      title="City scores"
      caption="Score, 0 to 100. Each city shows fan heat, activation and winnability; the shape is its verdict. Select a row to open its playbook."
      table={{ head: ["City", "Verdict", "Fan heat", "Activation", "Winnability"], rows: rows.map((r) => [r.name, INSIGHTS_VERDICT_LABEL[r.verdict], text(r.fanHeat), text(r.activation), text(r.winnability)]) }}
    >
      <ul className="flex flex-col gap-1" aria-label="Scores by city">
        {rows.map((r) => {
          const href = hrefFor(r.id);
          const inner = (
            <>
              <span className="flex min-w-0 items-center gap-2 sm:w-[170px] sm:shrink-0">
                <VerdictGlyph verdict={r.verdict} />
                <span className="min-w-0 truncate text-[14px] text-canvas-text">{r.name}</span>
                <span className="sr-only">, {INSIGHTS_VERDICT_LABEL[r.verdict]}</span>
              </span>
              <span role="img" aria-label={`${r.name}: fan heat ${text(r.fanHeat)}, activation ${text(r.activation)}, winnability ${text(r.winnability)}`} className="flex min-w-0 flex-1 flex-col gap-[3px]">
                {METRICS.map((m) => {
                  const v = r[m.key];
                  return (
                    <span key={m.key} aria-hidden className="flex items-center gap-2">
                      <span className="relative h-[6px] min-w-0 flex-1 rounded-[3px] bg-[rgba(240,238,230,0.08)]">
                        {v !== null && <span data-testid={m.id} className="absolute inset-y-0 left-0 rounded-[3px]" style={{ width: `${clamp(v)}%`, background: m.color }} />}
                      </span>
                      <span className="w-[88px] shrink-0 whitespace-nowrap font-mono text-[11px] text-canvas-muted tabular">{m.label} {v === null ? "—" : clamp(v)}</span>
                    </span>
                  );
                })}
              </span>
            </>
          );
          const cls = "flex min-h-11 flex-col gap-1 rounded-[8px] px-2 py-1.5 sm:flex-row sm:items-center sm:gap-3";
          return (
            <li key={r.id} data-testid="city-score-row">
              {href ? <Link to={href} className={`${cls} hover:bg-paper-raised ${FOCUS}`}>{inner}</Link> : <div className={cls}>{inner}</div>}
            </li>
          );
        })}
      </ul>
    </ChartFrame>
  );
}
