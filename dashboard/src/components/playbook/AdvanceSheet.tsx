export function AdvanceSheet({ rows }: { rows: Array<{ label: string; value: string; tour?: string; onClick?: () => void; aria?: string }> }) {
  return (
    <dl className="grid grid-cols-2 gap-2">
      {rows.map((r) => (
        <div key={r.label} data-tour={r.tour} className="min-w-0 rounded-[14px] bg-canvas-raised p-3 md:p-4">
          <dt /* taste-skill-ignore: DESIGN 3.1 advance-sheet field label */ className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-canvas-muted">{r.label}</dt>
          <dd title={r.value} className="mt-1 break-words text-[15px] font-semibold text-canvas-text">
            {r.onClick ? <button type="button" onClick={r.onClick} aria-label={r.aria} className="text-left underline-offset-4 hover:underline">{r.value}</button> : r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
