export function AdvanceSheet({ rows }: { rows: Array<{ label: string; value: string; tour?: string }> }) {
  return (
    <dl className="grid grid-cols-2 gap-2">
      {rows.map((r) => (
        <div key={r.label} data-tour={r.tour} className="min-w-0 rounded-[14px] bg-canvas-raised p-3 md:p-4">
          <dt /* taste-skill-ignore: DESIGN 3.1 advance-sheet field label */ className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-canvas-muted">{r.label}</dt>
          <dd title={r.value} className="mt-1 truncate text-[15px] font-semibold text-canvas-text">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
