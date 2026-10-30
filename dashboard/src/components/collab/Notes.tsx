import { Check, MessageSquare } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Sheet } from "@/components/qloo/Sheet";
import { DEMO_BANNER, LIMITS, ROLES, SHARE_NOTICE, timeAgo, type Message } from "@/lib/collab/types";
import { useWorkspace } from "@/lib/collab/workspaceContext";
import { collabBtn, collabInput, demoChip, roleChip } from "./ui";

const MENTION = new RegExp(`(@(?:${ROLES.join("|")}))`, "g");

/** Plain text only: React escapes it. "@Role" mentions get a light highlight; nothing is parsed as HTML. */
export function NoteText({ text }: { text: string }): ReactNode {
  return <>{text.split(MENTION).map((part, i) => (i % 2 === 1 ? <span key={i} className="font-medium text-gold">{part}</span> : part))}</>;
}

function MessageItem({ m }: { m: Message }) {
  return (
    <li className="flex flex-col gap-1 rounded-[10px] bg-paper p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[14px] font-semibold text-canvas-text">{m.name}</span>
        <span className={roleChip}>{m.role}</span>
        {m.demo && <span className={demoChip}>Demo teammate</span>}
        <span className="text-[12px] text-canvas-muted">{timeAgo(m.at)}</span>
      </div>
      <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.45] text-canvas-text"><NoteText text={m.text} /></p>
    </li>
  );
}

/** A side sheet with one thread: messages, a box to add one, and resolve or reopen. */
export function NotesSheet({ open, onClose, title, threadKey }: { open: boolean; onClose: () => void; title: string; threadKey: string }) {
  const w = useWorkspace();
  const thread = w.snapshot?.threads[threadKey];
  const messages = thread?.messages ?? [];
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    const ok = await w.write("message", { key: threadKey, text: t });
    setBusy(false);
    if (ok) setText("");
  };
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="flex flex-1 flex-col gap-3">
        {messages.some((m) => m.demo) && <p data-testid="demo-banner" className="rounded-[8px] bg-paper-raised px-3 py-2 text-[13px] text-canvas-text">{DEMO_BANNER}</p>}
        {thread?.resolved && (
          <p className="rounded-[8px] bg-paper-raised px-3 py-2 text-[13px] text-canvas-text">
            Resolved{thread.resolvedBy ? ` by ${thread.resolvedBy.name}` : ""}{thread.resolvedAt ? ` · ${timeAgo(thread.resolvedAt)}` : ""}
          </p>
        )}
        {messages.length === 0 ? <p className="text-[14px] text-canvas-muted">No notes yet. Start the thread below.</p> : <ul aria-label="Notes" className="flex flex-col gap-2">{messages.map((m) => <MessageItem key={m.id} m={m} />)}</ul>}
        {/* Sticky inside the sheet's scroll area: on a phone the thread can be long, and the box must stay in view. */}
        <div data-testid="notes-composer" className="sticky bottom-0 z-10 -mx-4 mt-auto flex flex-col gap-2 border-t border-canvas-line bg-paper px-4 pb-3 pt-3 md:-mx-6 md:px-6">
          <textarea
            value={text} onChange={(e) => setText(e.target.value)} maxLength={LIMITS.text} rows={3} aria-label="Add a note"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }}
            placeholder="Write a note. Type @Promoter or @Manager to flag a role." className={collabInput}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12px] tabular-nums text-canvas-muted">{text.length}/{LIMITS.text}</span>
            <div className="flex flex-wrap items-center gap-2">
              {messages.length > 0 && (
                <button type="button" onClick={() => void w.write("resolve", { key: threadKey, resolved: !thread?.resolved })} className={collabBtn}>
                  {thread?.resolved ? "Reopen" : <><Check size={14} aria-hidden />Mark resolved</>}
                </button>
              )}
              <button type="button" disabled={!text.trim() || busy} onClick={() => void send()} className="btn-gold inline-flex min-h-11 items-center rounded-[8px] px-4 text-[13px] font-semibold disabled:opacity-50">Add note</button>
            </div>
          </div>
          {w.error && <p role="alert" className="text-[13px] text-state-error">{w.error}</p>}
          {!w.identity ? null : <p className="text-[12px] text-canvas-muted">Writing as {w.identity.name} ({w.identity.role}).</p>}
          <p className="text-[12px] text-canvas-muted">{SHARE_NOTICE}</p>
        </div>
      </div>
    </Sheet>
  );
}

/** "Notes (N)" on a card or in the city header; hidden when collaboration is off. */
export function NotesButton({ threadKey, title, label, tour }: { threadKey: string; title: string; label?: string; /** `data-tour` value, for the guided tour. */ tour?: string }) {
  const w = useWorkspace();
  const [open, setOpen] = useState(false);
  if (!w.enabled) return null;
  const t = w.snapshot?.threads[threadKey];
  const n = t?.messages.length ?? 0;
  return (
    <>
      <button type="button" data-tour={tour} onClick={() => setOpen(true)} aria-label={`${label ?? "Notes"} for ${title}: ${n} ${n === 1 ? "note" : "notes"}${t?.resolved ? ", resolved" : ""}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-[4px] px-1 text-[12px] font-medium tabular-nums text-canvas-muted hover:text-canvas-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
        {t?.resolved ? <Check size={13} aria-hidden /> : <MessageSquare size={13} aria-hidden />}
        {label ?? "Notes"} ({n})
      </button>
      <NotesSheet open={open} onClose={() => setOpen(false)} title={`Notes: ${title}`} threadKey={threadKey} />
    </>
  );
}
