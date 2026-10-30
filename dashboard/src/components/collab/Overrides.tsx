import { useState, type ReactNode } from "react";
import { FIELD_LABEL, LIMITS, timeAgo, type Field } from "@/lib/collab/types";
import { useWorkspace } from "@/lib/collab/workspaceContext";
import { WhyLine } from "@/components/playbook/WhyLine";
import type { HeroWhy } from "@/components/playbook/heroWhy";
import type { CardKind } from "@/lib/qloo/types";
import { collabInput } from "./ui";

const link = "inline-flex min-h-11 min-w-11 items-center justify-center text-[12px] font-medium text-canvas-muted underline-offset-4 hover:text-canvas-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

/**
 * The value inside a hero tile when the team can override Qloo's suggestion. The team value is shown first and Qloo's own
 * answer stays underneath, so the evidence is never lost. `editable` false (the Tour Book) only shows an existing override.
 */
export function OverrideValue({ cityId, field, qloo, editable, why, onGoToCard, children }: { cityId: string; field: Field; qloo: string; editable: boolean; why?: HeroWhy; onGoToCard?: (kind: CardKind) => void; children: ReactNode }) {
  const w = useWorkspace();
  const o = w.enabled ? w.snapshot?.overrides[cityId]?.[field] : undefined;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  if (!w.enabled) return <>{children}{why && <WhyLine why={why} onGo={onGoToCard} className="mt-0.5 block" />}</>;
  const save = async () => {
    const v = text.trim();
    if (!v) return;
    setEditing(false);
    const r = reason.trim();
    await w.write("override", { cityId, field, value: v, original: qloo, ...(r ? { reason: r } : {}) });
  };
  if (editing) {
    return (
      <form className="flex flex-col gap-1" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={LIMITS.value} aria-label={`Team value for ${FIELD_LABEL[field]}`} className={collabInput} />
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={LIMITS.reason} placeholder="Why? (optional)" aria-label="Why? (optional)" className={collabInput} />
        <div className="flex items-center gap-3">
          <button type="submit" disabled={!text.trim()} className="inline-flex min-h-11 items-center text-[13px] font-semibold text-gold disabled:opacity-50">Save</button>
          <button type="button" onClick={() => setEditing(false)} className={link}>Cancel</button>
        </div>
      </form>
    );
  }
  return (
    <>
      {o ? (
        <span data-tour="override-team" className="block">
          <span data-testid="team-value" className="break-words">{o.value}</span>
          <span data-testid="team-line" className="mt-0.5 block text-[12px] font-normal text-canvas-muted">Team value · {o.name}{o.reason ? ` — ${o.reason}` : ""} · {timeAgo(o.at)}{o.demo ? " · Demo teammate" : ""}</span>
          <span data-testid="qloo-suggested" className="block text-[12px] font-normal text-canvas-muted">Qloo suggested: {qloo !== "—" ? qloo : o.original || "—"}{why && <> — <WhyLine why={why} onGo={onGoToCard} /></>}</span>
        </span>
      ) : <>{children}{why && <WhyLine why={why} onGo={onGoToCard} className="mt-0.5 block" />}</>}
      {editable && (
        <span className="flex items-center gap-3">
          <button type="button" onClick={() => { setText(o?.value ?? ""); setReason(o?.reason ?? ""); setEditing(true); }} aria-label={`Edit ${FIELD_LABEL[field]}`} className={link}>Edit</button>
          {o && <button type="button" onClick={() => void w.write("override_clear", { cityId, field })} className={link}>Revert to Qloo</button>}
        </span>
      )}
    </>
  );
}
