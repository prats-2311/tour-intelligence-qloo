export function ClaimsBadge({ verified, removed, onClick, label }: { verified: number; removed: number; onClick?: () => void; label?: string }) {
  const text = `${verified} verified · ${removed} removed`;
  if (!onClick || verified + removed === 0) return <span data-tour="claims-badge" className="text-[13px] font-medium tabular-nums text-canvas-muted">{text}</span>;
  return (
    <button type="button" data-tour="claims-badge" onClick={onClick} aria-label={label ?? `See the ${verified + removed} checked claims`} className="-ml-2 inline-flex min-h-11 items-center rounded-[8px] px-2 text-[13px] font-medium tabular-nums text-canvas-text decoration-canvas-muted underline-offset-4 hover:underline">
      {text}
    </button>
  );
}
