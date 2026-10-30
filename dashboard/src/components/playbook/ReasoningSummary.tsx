import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { mentionsDoNotBook } from "@/lib/qloo/doNotBook";
import { mentionsNonSponsor } from "@/lib/qloo/nonSponsors";
import type { Narrative } from "@/lib/qloo/types";

export function ReasoningSummary({ narrative }: { narrative?: Narrative }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!narrative || narrative.status !== "ok" || !narrative.thoughtSummary) return null;
  // The model's raw reasoning can name a listed act or a non-sponsor organisation from the Qloo results. It is free text we cannot redact
  // reliably, so (like a claim that names one) it is not shown at all, not even collapsed.
  if (mentionsDoNotBook(narrative.thoughtSummary) || mentionsNonSponsor(narrative.thoughtSummary)) return null;
  return (
    <div className="rounded-[14px] bg-canvas-raised px-4">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-[15px] font-semibold text-canvas-text">
        Model reasoning summary
        <ChevronDown size={18} strokeWidth={1.75} aria-hidden className={open ? "rotate-180" : ""} />
      </button>
      <div id={id} hidden={!open} className="pb-4">
        <p className="whitespace-pre-wrap text-[14px] leading-[1.5] text-canvas-muted">{narrative.thoughtSummary}</p>
        <p className="mt-2 text-[13px] text-canvas-muted">Model: {narrative.model}</p>
      </div>
    </div>
  );
}
