import { Ban, Check, CircleAlert, Loader } from "lucide-react";
import { useState } from "react";
import type { ToolChip } from "@/lib/qloo/strategistReducer";

export function toolLabel(name: string): string {
  if (name === "get_city_playbook") return "Playbook";
  if (name.startsWith("qloo_")) return `Qloo · ${name.slice(5).replace(/_/g, " ")}`;
  const plain = name.replace(/_/g, " ");
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

function StatusIcon({ status, streaming }: { status: ToolChip["status"]; streaming: boolean }) {
  if (!status && !streaming) return <CircleAlert size={14} aria-hidden className="text-state-stale" />;
  if (!status) return <Loader size={14} aria-hidden className="animate-spin motion-reduce:animate-none" />;
  if (status === "ok") return <Check size={14} aria-hidden className="text-verdict-play-text" />;
  if (status === "rejected") return <Ban size={14} aria-hidden className="text-state-error" />;
  return <CircleAlert size={14} aria-hidden className="text-state-stale" />;
}

function Chip({ chip, streaming }: { chip: ToolChip; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="inline-flex min-h-11 max-w-full flex-wrap items-center gap-x-1.5 rounded-lg py-1 bg-canvas-raised px-3 text-[13px] font-semibold text-canvas-text outline-none focus-visible:ring-2 focus-visible:ring-gold/50">
        <StatusIcon status={chip.status} streaming={streaming} />
        {toolLabel(chip.name)}
        {chip.status && <span className="font-normal text-canvas-muted">{chip.status.replace(/_/g, " ")}</span>}
        {chip.status && chip.summary && <span className="break-words text-left font-normal text-canvas-muted">{chip.summary}</span>}
        {chip.cached && <span className="font-normal text-canvas-muted">From cache</span>}
        {!chip.status && !streaming && <span className="font-normal text-canvas-muted">No result</span>}
      </button>
      {open && (
        <div className="mt-1 rounded-[10px] bg-canvas-raised px-3 py-2 text-[12px] leading-[1.5] text-canvas-muted">
          <pre className="mt-1 whitespace-pre-wrap break-words text-[12px] text-canvas-muted">{JSON.stringify(chip.args, null, 2)}</pre>
        </div>
      )}
    </li>
  );
}

export function ToolChips({ tools, streaming }: { tools: ToolChip[]; streaming: boolean }) {
  if (tools.length === 0) return null;
  return (
    <ul aria-label="Tools used" className="flex flex-wrap items-start gap-2">
      {tools.map((c) => <Chip key={c.id} chip={c} streaming={streaming} />)}
    </ul>
  );
}
