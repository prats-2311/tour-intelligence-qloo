import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";

/** Collapsible model reasoning summary for one strategist turn; same look as the playbook ReasoningSummary. */
export function StrategistThinking({ summaries, defaultOpen = false }: { summaries: string[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  if (summaries.length === 0) return null;
  return (
    <div className="rounded-[14px] bg-canvas-raised px-4">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-[15px] font-semibold text-canvas-text outline-none focus-visible:ring-2 focus-visible:ring-gold/50">
        Model reasoning summary
        <ChevronDown size={18} strokeWidth={1.75} aria-hidden className={open ? "rotate-180" : ""} />
      </button>
      <div id={id} hidden={!open} className="pb-4">
        <p className="mb-1 text-[12px] text-canvas-muted">Gemini's own summary of its reasoning</p>
        <p className="whitespace-pre-wrap text-[14px] leading-[1.5] text-canvas-muted">{summaries.join("\n\n")}</p>
      </div>
    </div>
  );
}
