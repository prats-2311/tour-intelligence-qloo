import { STATUS_LABEL, STATUSES, timeAgo, type CityStatus } from "@/lib/collab/types";
import { useWorkspace } from "@/lib/collab/workspaceContext";

const TONE: Record<CityStatus, string> = {
  considering: "text-canvas-text",
  confirmed: "text-verdict-play-text",
  on_hold: "text-gold",
  dropped: "text-canvas-muted",
};
const DOT: Record<CityStatus, string> = { considering: "bg-verdict-consider", confirmed: "bg-verdict-play", on_hold: "bg-gold", dropped: "bg-verdict-skip" };

/** Chip for a Tour Board row. Plain spans (the row is a button), with who and when in the tooltip and the screen reader text. */
export function CityStatusChip({ cityId }: { cityId: string }) {
  const w = useWorkspace();
  const s = w.enabled ? w.snapshot?.statuses[cityId] : undefined;
  if (!s) return null;
  const by = `${STATUS_LABEL[s.status]} by ${s.name} (${s.role}), ${timeAgo(s.at)}${s.demo ? ". Demo teammate" : ""}`;
  return (
    <span data-testid="status-chip" data-tour="status-chip" title={by} className={`inline-flex h-6 shrink-0 items-center gap-1.5 self-center whitespace-nowrap rounded-[4px] border border-canvas-line px-2 text-[12px] font-medium ${TONE[s.status]}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${DOT[s.status]}`} />
      {STATUS_LABEL[s.status]}
      <span className="sr-only">. {by}</span>
    </span>
  );
}

/** Status picker for the playbook header, with who set it and when. */
export function StatusPicker({ cityId }: { cityId: string }) {
  const w = useWorkspace();
  if (!w.enabled) return null;
  const s = w.snapshot?.statuses[cityId];
  const cur: CityStatus = s?.status ?? "considering";
  return (
    <div data-testid="status-picker" className="flex min-w-0 flex-col gap-1">
      <label className="flex items-center gap-2 text-[13px] font-medium text-canvas-muted">
        Status
        <select value={cur} onChange={(e) => void w.write("status", { cityId, status: e.target.value })} className="min-h-11 rounded-[8px] border border-canvas-line bg-paper-raised px-2 text-[14px] font-semibold text-canvas-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
          {STATUSES.map((x) => <option key={x} value={x}>{STATUS_LABEL[x]}</option>)}
        </select>
      </label>
      {s && <p className="text-[12px] text-canvas-muted">{STATUS_LABEL[s.status]} by {s.name} · {timeAgo(s.at)}{s.demo ? " · Demo teammate" : ""}</p>}
    </div>
  );
}
