import { ACTIVATION_WEIGHTS, INTEGRITY_LINE, VERDICT_LABEL } from "@/lib/qloo/labels";
import type { ScoredCity, Verdict } from "@/lib/qloo/types";
import { DataWarningBadge } from "./DataWarningBadge";
import { DualBars } from "./DualBars";
import { VerdictChip } from "./VerdictChip";

/** The gateway's verdict rules, shown for transparency (display only — never recomputed here). */
const RULES: Array<{ verdict: Verdict; rule: string }> = [
  { verdict: "play", rule: "fan ≥70 & activation ≥60" },
  { verdict: "hidden_goldmine", rule: "45≤fan<70 & activation ≥75" },
  { verdict: "de_risk", rule: "fan ≥70 & activation <45" },
  { verdict: "consider", rule: "winnability ≥55" },
  { verdict: "skip", rule: "otherwise" },
  { verdict: "insufficient_data", rule: "when inputs are missing" },
];

export function WhyThisScore({ city }: { city: ScoredCity }) {
  const w = city.winnability.value;
  const comps = city.activation.components;
  const seen = new Set<string>();
  const refs = [...city.fanHeat.refs, ...city.activation.refs, ...city.winnability.refs].filter((r) => {
    const k = `${r.tool}|${r.cacheKey}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return (
    <div className="flex flex-col gap-4 text-[14px] text-canvas-text">
      <div className="flex items-center gap-3">
        <VerdictChip verdict={city.verdict} size="md" />
        <span className="font-mono text-[24px] font-bold tabular">{w === null ? "—" : Math.round(w)}</span>
        <span className="text-[13px] text-canvas-muted">{w === null ? "Not enough data to score" : "winnability"}</span>
      </div>
      <DualBars fanHeat={city.fanHeat} activation={city.activation} />
      <p className="font-mono text-[13px] text-canvas-muted">winnability = 0.5 × fan heat + 0.5 × activation</p>
      <table className="w-full text-left text-[13px]">
        <thead className="text-canvas-muted">
          <tr><th className="py-1 font-medium">Component</th><th className="py-1 text-right font-medium">Weight</th><th className="py-1 text-right font-medium">Value</th></tr>
        </thead>
        <tbody>
          {ACTIVATION_WEIGHTS.map(({ key, label, weight }) => {
            const v = comps[key];
            return (
              <tr key={key} className="border-t border-canvas-line">
                <td className="py-1.5">{label}</td>
                <td className="py-1.5 text-right font-mono tabular">{weight}</td>
                <td className="py-1.5 text-right font-mono tabular">{typeof v === "number" && Number.isFinite(v) ? v.toFixed(2) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[12px] text-canvas-muted">Weights are renormalised over the components that returned data.</p>
      <div>
        <h3 className="mb-1 text-[13px] font-medium text-canvas-muted">Verdict rules</h3>
        <ul aria-label="Verdict rules" className="flex flex-col gap-0.5 text-[13px]">
          {RULES.map(({ verdict, rule }) => (
            <li key={verdict} className={`flex flex-wrap gap-x-2 ${verdict === city.verdict ? "text-canvas-text" : "text-canvas-muted"}`}>
              <span className="font-medium">{VERDICT_LABEL[verdict]}:</span><span className="tabular">{rule}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-1 text-[13px] font-medium text-canvas-muted">Evidence</h3>
        {refs.length === 0 ? (
          <p className="text-[13px] text-canvas-muted">No evidence references.</p>
        ) : (
          <ul className="flex flex-col gap-0.5 font-mono text-[12px] text-canvas-muted">
            {refs.map((r) => <li key={`${r.tool}|${r.cacheKey}`}>{r.tool} · {r.cacheKey.slice(0, 8)}</li>)}
          </ul>
        )}
      </div>
      {city.warnings.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[13px] font-medium text-canvas-muted">Data notes</h3>
          <DataWarningBadge warnings={city.warnings} />
          <ul className="flex flex-col gap-0.5 text-[13px] text-canvas-text">
            {city.warnings.map((w, i) => <li key={`${w.tool}|${w.kind}|${i}`}>{w.message ?? `${w.tool}: ${w.kind}`}</li>)}
          </ul>
        </div>
      )}
      <p className="text-[12px] text-canvas-muted">{INTEGRITY_LINE}</p>
    </div>
  );
}
