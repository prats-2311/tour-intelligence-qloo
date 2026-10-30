import { OverrideValue } from "@/components/collab/Overrides";
import { fieldOf } from "@/lib/collab/types";

/** `cityId` turns on team overrides for the Top zone, Best room and Support tiles; `editable` (the playbook, not the book) shows the Edit control. */
export function AdvanceSheet({ rows, cityId, editable = false }: { rows: Array<{ label: string; value: string; tour?: string; onClick?: () => void; aria?: string }>; cityId?: string; editable?: boolean }) {
  return (
    <dl className="grid grid-cols-2 gap-2">
      {rows.map((r) => {
        const field = cityId ? fieldOf(r.label) : undefined;
        const value = r.onClick ? <button type="button" onClick={r.onClick} aria-label={r.aria ? `${r.value}. ${r.aria}` : undefined} className="text-left underline-offset-4 hover:underline">{r.value}</button> : r.value;
        return (
          <div key={r.label} data-tour={r.tour} className="min-w-0 rounded-[14px] bg-canvas-raised p-3 md:p-4">
            <dt /* taste-skill-ignore: DESIGN 3.1 advance-sheet field label */ className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-canvas-muted">{r.label}</dt>
            <dd title={r.value} className="mt-1 break-words text-[15px] font-semibold text-canvas-text">
              {field && cityId ? <OverrideValue cityId={cityId} field={field} qloo={r.value} editable={editable}>{value}</OverrideValue> : value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
