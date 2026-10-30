import { useState } from "react";
import { LIMITS, timeAgo } from "@/lib/collab/types";
import { useWorkspace } from "@/lib/collab/workspaceContext";
import { collabInput, demoChip } from "./ui";

/** Free-text sponsor leads the team adds beside Qloo's ranked list. `readOnly` (the Tour Book) lists them without controls. */
export function SponsorLeads({ cityId, readOnly = false }: { cityId: string; readOnly?: boolean }) {
  const w = useWorkspace();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const leads = w.snapshot?.leads[cityId] ?? [];
  if (!w.enabled || (readOnly && leads.length === 0)) return null;
  const add = async () => {
    const t = text.trim();
    if (!t) return;
    setAdding(false);
    setText("");
    await w.write("lead", { cityId, text: t });
  };
  return (
    <div data-testid="sponsor-leads" className="mt-3 flex min-w-0 flex-col gap-1 border-t border-canvas-line pt-2">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Sponsor leads · Added by the team</p>
      {leads.length > 0 && (
        <ul className="flex flex-col">
          {leads.map((l) => (
            <li key={l.id} className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 py-1 text-[15px] text-canvas-text">
              <span className="min-w-0 break-words">{l.text} <span className="text-[12px] text-canvas-muted">{l.name} · {timeAgo(l.at)}</span>{l.demo && <span className={`${demoChip} ml-1.5`}>Demo teammate</span>}</span>
              {!readOnly && <button type="button" onClick={() => void w.write("lead_remove", { cityId, id: l.id })} aria-label={`Remove lead ${l.text}`} className="inline-flex min-h-11 items-center text-[12px] text-canvas-muted underline-offset-4 hover:text-canvas-text hover:underline">Remove</button>}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (adding ? (
        <form className="flex flex-col gap-1" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={LIMITS.lead} aria-label="Sponsor lead" placeholder="Brand and who to talk to" className={collabInput} />
          <div className="flex items-center gap-3">
            <button type="submit" disabled={!text.trim()} className="inline-flex min-h-11 items-center text-[13px] font-semibold text-gold disabled:opacity-50">Save lead</button>
            <button type="button" onClick={() => { setAdding(false); setText(""); }} className="inline-flex min-h-11 items-center text-[12px] text-canvas-muted hover:text-canvas-text">Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex min-h-11 w-fit items-center text-[13px] font-medium text-canvas-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">+ Add a lead</button>
      ))}
    </div>
  );
}
