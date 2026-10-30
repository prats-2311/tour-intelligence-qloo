import { VerdictGlyph } from "@/components/qloo/VerdictGlyph";
import { countByCountry, INSIGHTS_VERDICT_LABEL, SHOWN_VERDICTS, verdictCounts } from "@/lib/qloo/tourInsights";
import { countryLabel } from "@/lib/qloo/labels";
import type { ScoredCity, Verdict } from "@/lib/qloo/types";
import { ChartFrame } from "./ChartFrame";

const FILL: Record<Verdict, string> = {
  play: "var(--color-verdict-play)", hidden_goldmine: "var(--color-verdict-goldmine)", de_risk: "var(--color-verdict-derisk)",
  consider: "var(--color-verdict-consider)", skip: "var(--color-verdict-skip)", insufficient_data: "var(--color-heat-2)",
};
const describe = (c: Record<Verdict, number>): string => SHOWN_VERDICTS.filter((v) => c[v] > 0).map((v) => `${INSIGHTS_VERDICT_LABEL[v]} ${c[v]}`).join(", ");

function Stack({ counts, total, testId }: { counts: Record<Verdict, number>; total: number; testId?: string }) {
  return (
    <span data-testid={testId} className="flex h-6 w-full overflow-hidden rounded-[6px] bg-canvas">
      {SHOWN_VERDICTS.filter((v) => counts[v] > 0).map((v) => (
        <span key={v} data-testid="mix-seg" data-verdict={v} data-count={counts[v]} className="flex items-center justify-center border-r-2 border-paper font-mono text-[11px] font-bold text-canvas last:border-r-0" style={{ width: `${(counts[v] / total) * 100}%`, background: FILL[v] }}>
          {counts[v]}
        </span>
      ))}
    </span>
  );
}

/** Counts by verdict (one stacked bar) and by country (one stacked bar each). Counts are of the cities the filters leave. */
export function VerdictMix({ cities }: { cities: ScoredCity[] }) {
  const all = verdictCounts(cities);
  const countries = countByCountry(cities);
  const total = cities.length;
  return (
    <ChartFrame
      title="Verdict mix"
      caption="Number of cities per verdict, overall and by country. The shape and the label carry the verdict, the colour only repeats it."
      table={{ head: ["Group", ...SHOWN_VERDICTS.map((v) => INSIGHTS_VERDICT_LABEL[v]), "Cities"], rows: [["All cities", ...SHOWN_VERDICTS.map((v) => all[v]), total], ...countries.map((c) => [countryLabel(c.country), ...SHOWN_VERDICTS.map((v) => c.verdicts[v]), c.total])] }}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold text-canvas-text">All cities ({total})</span>
          <span role="img" aria-label={`All ${total} cities: ${describe(all)}`} className="block"><Stack counts={all} total={total} testId="mix-all" /></span>
        </div>
        <ul className="flex flex-col gap-2" aria-label="Verdict mix by country">
          {countries.map((c) => (
            <li key={c.country} data-testid="mix-country" className="grid grid-cols-[88px_1fr] items-center gap-2">
              <span className="truncate text-[13px] text-canvas-muted">{countryLabel(c.country)} ({c.total})</span>
              <span role="img" aria-label={`${countryLabel(c.country)}: ${describe(c.verdicts)}`} className="block"><Stack counts={c.verdicts} total={c.total} /></span>
            </li>
          ))}
        </ul>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-canvas-muted" aria-hidden>
          {SHOWN_VERDICTS.filter((v) => all[v] > 0).map((v) => <li key={v} className="inline-flex items-center gap-1.5"><VerdictGlyph verdict={v} />{INSIGHTS_VERDICT_LABEL[v]}</li>)}
        </ul>
      </div>
    </ChartFrame>
  );
}
