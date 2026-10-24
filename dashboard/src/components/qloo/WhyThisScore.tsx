import { CAPPED_CLOSE_CALL_NOTE, CAPPED_RULE_LABEL, CAPPED_RULE_TEXT, closeCallNote, showsCappedNote, DEFAULT_SCORING_DISPLAY, INTEGRITY_LINE, FLOORED_SEED_NOTE, LOCATION_UNRESOLVED_NOTE, MAJOR_MARKET_LABEL, VERDICT_LABEL, majorMarketNote, ruleLines, weightRows } from "@/lib/qloo/labels";
import type { ScoredCity, ScoringConfig } from "@/lib/qloo/types";
import { CloseCallChip } from "./CloseCallChip";
import { DataWarningBadge } from "./DataWarningBadge";
import { DualBars } from "./DualBars";
import { VerdictChip } from "./VerdictChip";

/** Rules, weights and the floor note come from the scoring config the gateway applied (display only — never recomputed here). */
export function WhyThisScore({ city, scoring }: { city: ScoredCity; scoring?: ScoringConfig | null }) {
  const cfg = scoring ?? DEFAULT_SCORING_DISPLAY;
  const floored = Object.values(cfg.affinityFloors).some((f) => f > 0);
  const w = city.winnability.value;
  const unplaced = city.insufficientReason === "location_unresolved";
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <VerdictChip verdict={city.verdict} size="md" />
        {city.closeCall && <CloseCallChip />}
        <span className="font-mono text-[24px] font-bold tabular">{w === null ? "—" : Math.round(w)}</span>
        <span className="text-[13px] text-canvas-muted">{w === null ? (unplaced ? LOCATION_UNRESOLVED_NOTE : "Not enough data to score") : "winnability"}</span>
      </div>
      {city.candidateSource === "major_market" && (
        <p className="text-[13px] text-canvas-muted"><span className="mr-2 inline-flex h-6 items-center rounded-[4px] border border-canvas-line px-2 text-[12px] font-medium text-canvas-text">{MAJOR_MARKET_LABEL}</span>{majorMarketNote(city.country)}</p>
      )}
      {showsCappedNote(city) && <p className="text-[13px] text-canvas-muted">{FLOORED_SEED_NOTE}</p>}
      {city.closeCall && <p className="text-[13px] text-canvas-muted">{city.fanHeatFloor ? CAPPED_CLOSE_CALL_NOTE : closeCallNote(cfg.closeCallBand)}</p>}
      <DualBars fanHeat={city.fanHeat} activation={city.activation} thresholds={cfg.thresholds} />
      <p className="font-mono text-[13px] text-canvas-muted">winnability = 0.5 × fan heat + 0.5 × activation</p>
      <table className="w-full text-left text-[13px]">
        <thead className="text-canvas-muted">
          <tr><th className="py-1 font-medium">Component</th><th className="py-1 text-right font-medium">Weight</th><th className="py-1 text-right font-medium">Value</th></tr>
        </thead>
        <tbody>
          {weightRows(cfg).map(({ key, label, weight, dropped }) => {
            const v = comps[key];
            return (
              <tr key={key} className="border-t border-canvas-line">
                <td className="py-1.5">{label}</td>
                <td className="py-1.5 text-right font-mono tabular">{weight}</td>
                {dropped ? (
                  <td className="py-1.5 text-right text-[12px] text-canvas-muted">dropped — no spread in calibration</td>
                ) : (
                  <td className="py-1.5 text-right font-mono tabular">{typeof v === "number" && Number.isFinite(v) ? v.toFixed(2) : "—"}</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[12px] text-canvas-muted">Weights are renormalised over the components that returned data.</p>
      {floored && (
        <p className="text-[13px] text-canvas-muted">
          Sponsor, hook and venue affinities are rescaled from a calibrated floor to 1 (100), because Qloo's top recommendations all score near 1. Floors: sponsor {cfg.affinityFloors.sponsor_fit} · hooks {cfg.affinityFloors.local_hooks} · venue {cfg.affinityFloors.venue_fit}.
        </p>
      )}
      <div>
        <h3 className="mb-1 text-[13px] font-medium text-canvas-muted">Verdict rules</h3>
        <ul aria-label="Verdict rules" className="flex flex-col gap-0.5 text-[13px]">
          {ruleLines(cfg.thresholds, city.fanHeatFloor === true).map(({ verdict, rule }) => (
            <li key={verdict} className={`flex flex-wrap gap-x-2 ${verdict === city.verdict ? "text-canvas-text" : "text-canvas-muted"}`}>
              <span className="font-medium">{city.fanHeatFloor && verdict === "play" ? CAPPED_RULE_LABEL : VERDICT_LABEL[verdict]}:</span><span className="tabular">{city.fanHeatFloor && verdict === "play" ? CAPPED_RULE_TEXT : rule}</span>
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
