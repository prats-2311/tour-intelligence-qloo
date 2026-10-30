import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { LIMITS } from "@/lib/collab/types";
import { useWorkspace } from "@/lib/collab/workspaceContext";

export const SAVE_WARNING = "This copies the answer into notes everyone with the link can see. Document excerpts in it become visible to them.";

/** The note text: file ids become file names (teammates cannot resolve ids), cut to the note limit with an ellipsis. */
export function noteText(answer: string, names: Record<string, string>): string {
  const t = answer.replace(/\[doc:([A-Za-z0-9_-]{1,40}) p\.(\d{1,4})\]/g, (_m, id: string, p: string) => `(${names[id] ?? "Your file"}, p. ${p})`).trim();
  return t.length > LIMITS.text ? `${t.slice(0, LIMITS.text - 1)}…` : t;
}

/** "Save to team notes" under an answer: only when a team workspace exists, and only after an explicit confirm. */
export function SaveToNotes({ answer, names, threadKey }: { answer: string; names: Record<string, string>; threadKey: string }) {
  const w = useWorkspace();
  const { toast } = useToast();
  const [step, setStep] = useState<"idle" | "confirm" | "saving" | "failed">("idle");
  if (!w.enabled || !w.ws) return null;
  const btn = "min-h-11 rounded-[10px] px-3 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-gold/50 disabled:opacity-50";
  const save = async () => {
    setStep("saving");
    const ok = await w.write("message", { key: threadKey, text: noteText(answer, names) });
    if (ok) toast({ message: "Saved to team notes.", tone: "success" });
    setStep(ok ? "idle" : "failed");
  };
  if (step === "idle" || step === "failed") {
    return (
      <div className="flex flex-col items-start gap-1">
        <button type="button" onClick={() => setStep("confirm")} className={`${btn} text-canvas-muted underline hover:text-canvas-text`}>Save to team notes</button>
        {step === "failed" && <p role="alert" className="text-[13px] text-state-error">Could not save the answer to notes. Try again.</p>}
      </div>
    );
  }
  return (
    <div role="group" aria-label="Confirm saving to team notes" className="flex flex-col gap-2 rounded-[10px] bg-canvas-raised p-3">
      <p className="text-[13px] text-canvas-text">{SAVE_WARNING}</p>
      <div className="flex gap-2">
        <button type="button" disabled={step === "saving"} onClick={() => void save()} className={`${btn} btn-gold`}>Save to notes</button>
        <button type="button" disabled={step === "saving"} onClick={() => setStep("idle")} className={`${btn} text-canvas-text underline`}>Cancel</button>
      </div>
    </div>
  );
}
