import { fmt } from "./BudgetBits";
import { cityResult, type CityInputs, type Currency } from "@/lib/budget/math";

/** True when the user typed anything for this city. */
export const hasBudget = (c: CityInputs | undefined): boolean => !!c && Object.entries(c).some(([k, v]) => k !== "sponsorName" && v.trim() !== "");

/** Tour Book chapter: the city's numbers from the user's own budget (browser storage, no fetch). Only values that can be worked out are shown. */
export function ChapterBudget({ cityId, inputs, currency }: { cityId: string; inputs: CityInputs; currency: Currency }) {
  const r = cityResult(inputs);
  const parts: Array<[string, string]> = [];
  if (r.cost !== null) parts.push(["Cost", `${fmt(r.cost)} ${currency}`]);
  if (r.income !== null) parts.push(["Income", `${fmt(r.income)} ${currency}`]);
  if (r.margin !== null) parts.push(["Margin", `${fmt(r.margin)} ${currency}`]);
  if (r.breakEven !== null) parts.push(["Break-even", `${fmt(r.breakEven)} tickets`]);
  return (
    <section data-testid={`chapter-budget-${cityId}`} aria-label="Budget" className="flex min-w-0 break-inside-avoid flex-col gap-1 rounded-[14px] bg-canvas-raised p-3 md:p-4">
      <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-canvas-muted">Budget</h3>
      {parts.length > 0 ? <p className="text-[15px] tabular-nums text-canvas-text">{parts.map(([k, v]) => `${k} ${v}`).join(" · ")}</p> : <p className="text-[13px] text-canvas-muted">Numbers entered, not enough yet to work out a result.</p>}
      <p className="text-[12px] text-canvas-muted">From your own figures on the Tour budget page.</p>
    </section>
  );
}
