import type { ComponentName, ScoredCity } from "@/lib/qloo/types";
import { DataWarningBadge } from "./DataWarningBadge";
import { VerdictChip } from "./VerdictChip";

const WEIGHTS: Array<{ key: ComponentName; label: string; weight: string }> = [
  { key: "sponsor_fit", label: "Sponsor fit", weight: "0.30" },
  { key: "local_hooks", label: "Local hooks", weight: "0.25" },
  { key: "fan_concentration", label: "Fan concentration", weight: "0.25" },
  { key: "venue_fit", label: "Venue fit", weight: "0.20" },
];

export function WhyThisScore({ city }: { city: ScoredCity }) {
  const w = city.winnability.value;
  const comps = city.activation.components;
  const refs = [...city.fanHeat.refs, ...city.activation.refs, ...city.winnability.refs];
  return (
    <div className="flex flex-col gap-4 text-[14px] text-canvas-text">
      <div className="flex items-center gap-3">
        <VerdictChip verdict={city.verdict} size="md" />
        <span className="font-mono text-[24px] font-bold tabular">{w === null ? "—" : Math.round(w)}</span>
        <span className="text-[13px] text-canvas-muted">{w === null ? "Not enough data to score" : "winnability"}</span>
      </div>
      <p className="font-mono text-[13px] text-canvas-muted">winnability = 0.5 × fan heat + 0.5 × activation</p>
      <table className="w-full text-left text-[13px]">
        <thead className="text-canvas-muted">
          <tr><th className="py-1 font-medium">Component</th><th className="py-1 text-right font-medium">Weight</th><th className="py-1 text-right font-medium">Value</th></tr>
        </thead>
        <tbody>
          {WEIGHTS.map(({ key, label, weight }) => {
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
      <div>
        <h3 className="mb-1 text-[13px] font-medium text-canvas-muted">Evidence</h3>
        {refs.length === 0 ? (
          <p className="text-[13px] text-canvas-muted">No evidence references.</p>
        ) : (
          <ul className="flex flex-col gap-0.5 font-mono text-[12px] text-canvas-muted">
            {refs.map((r, i) => <li key={`${r.cacheKey}-${i}`}>{r.tool} · {r.cacheKey.slice(0, 8)}</li>)}
          </ul>
        )}
      </div>
      <DataWarningBadge warnings={city.warnings} />
      <p className="text-[12px] text-canvas-muted">Affinity signal from aggregate taste data — not a ticket forecast or a claim about individuals.</p>
    </div>
  );
}
