export function ClaimsBadge({ verified, removed, onClick }: { verified: number; removed: number; onClick?: () => void }) {
  const text = `${verified} verified · ${removed} removed`;
  if (removed === 0 || !onClick) return <span data-tour="claims-badge" className="text-[13px] font-medium tabular-nums text-canvas-muted">{text}</span>;
  return (
    <button type="button" data-tour="claims-badge" onClick={onClick} className="-ml-2 inline-flex min-h-11 items-center rounded-[8px] px-2 text-[13px] font-medium tabular-nums text-canvas-text underline decoration-canvas-muted underline-offset-4 hover:decoration-canvas-text">
      {text}
    </button>
  );
}
