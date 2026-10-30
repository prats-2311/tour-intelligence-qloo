import { Link2, Pencil, Users } from "lucide-react";
import { useState } from "react";
import { Sheet } from "@/components/qloo/Sheet";
import { DEMO_BANNER, FIELD_LABEL, SHARE_NOTICE, STATUS_LABEL, timeAgo, type ActivityEvent, type Field } from "@/lib/collab/types";
import { useWorkspace } from "@/lib/collab/workspaceContext";
import { NotesButton } from "./Notes";
import { collabBtn, demoChip, roleChip } from "./ui";

const ACTIVITY_LIMIT = 50;

function sentence(e: ActivityEvent, cityName: (id?: string) => string): string {
  const where = (k?: string) => (k === "tour:board" ? "the Tour Board" : k === "tour:book" ? "the Tour Book" : k?.startsWith("card:") ? `${k.split(":")[2]!.replace(/_/g, " ")} card in ${cityName(k.split(":")[1])}` : `${cityName(k?.replace(/^city:/, ""))}`);
  switch (e.type) {
    case "status": return `set ${cityName(e.cityId)} to ${STATUS_LABEL[e.text as keyof typeof STATUS_LABEL] ?? e.text}`;
    case "message": return `wrote on ${where(e.key)}: "${e.text ?? ""}"`;
    case "resolve": return `resolved the thread on ${where(e.key)}`;
    case "reopen": return `reopened the thread on ${where(e.key)}`;
    case "override": return `set ${FIELD_LABEL[e.key as Field] ?? e.key} for ${cityName(e.cityId)} to "${e.text ?? ""}"`;
    case "override_clear": return `went back to Qloo's ${FIELD_LABEL[e.key as Field] ?? e.key} for ${cityName(e.cityId)}`;
    case "lead": return `added a sponsor lead in ${cityName(e.cityId)}: "${e.text ?? ""}"`;
    case "lead_remove": return `removed a sponsor lead in ${cityName(e.cityId)}`;
  }
}

export function ActivityPanel({ open, onClose, cities }: { open: boolean; onClose: () => void; cities: Array<{ id: string; name: string }> }) {
  const w = useWorkspace();
  const name = (id?: string) => cities.find((c) => c.id === id)?.name ?? "a city";
  const events = (w.snapshot?.activity ?? []).slice(0, ACTIVITY_LIMIT);
  return (
    <Sheet open={open} onClose={onClose} title="Team activity">
      {events.some((e) => e.demo) && <p data-testid="demo-banner" className="mb-3 rounded-[8px] bg-paper-raised px-3 py-2 text-[13px] text-canvas-text">{DEMO_BANNER}</p>}
      {events.length === 0 ? <p className="text-[14px] text-canvas-muted">Nothing yet. Status changes, notes and edits show up here.</p> : (
        <ol aria-label="Team activity" className="flex flex-col gap-2">
          {events.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 rounded-[10px] bg-paper p-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[14px] font-semibold text-canvas-text">{e.name}</span>
                <span className={roleChip}>{e.role}</span>
                {e.demo && <span className={demoChip}>Demo teammate</span>}
                <span className="text-[12px] text-canvas-muted">{timeAgo(e.at)}</span>
              </div>
              <p className="break-words text-[14px] text-canvas-text">{sentence(e, name)}</p>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-[12px] text-canvas-muted">Showing the last {ACTIVITY_LIMIT} events. {SHARE_NOTICE}</p>
    </Sheet>
  );
}

/** Header controls: team activity, share link and who is writing. Hidden when collaboration is off. */
export function TeamBar({ cities, tourThread }: { cities: Array<{ id: string; name: string }>; /** Thread key for whole-tour notes (the board and the book), shown as "Tour notes (N)". */ tourThread?: string }) {
  const w = useWorkspace();
  const [open, setOpen] = useState(false);
  const [shared, setShared] = useState<{ url: string | null; copied: boolean } | null>(null);
  if (!w.enabled) return null;
  return (
    <div data-testid="team-bar" className="flex min-w-0 flex-wrap items-center gap-2">
      {tourThread && <NotesButton threadKey={tourThread} title="the whole tour" label="Tour notes" />}
      <button type="button" onClick={() => setOpen(true)} className={collabBtn}><Users size={14} aria-hidden />Team activity</button>
      <button type="button" onClick={() => void w.share().then(setShared)} className={collabBtn}><Link2 size={14} aria-hidden />Share with your team</button>
      {w.identity && (
        <button type="button" onClick={w.editIdentity} aria-label={`Writing as ${w.identity.name}, ${w.identity.role}. Change`} className="inline-flex min-h-11 items-center gap-1.5 rounded-[8px] border border-canvas-line px-3 text-[13px] font-medium text-canvas-text hover:bg-paper-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
          <Pencil size={12} aria-hidden />{w.identity.name} · {w.identity.role}
        </button>
      )}
      {shared && (
        <p role="status" className="basis-full text-[12px] text-canvas-muted">
          {shared.copied ? "Link copied. " : shared.url ? "Copy this link: " : ""}
          {shared.url && !shared.copied && <input readOnly value={shared.url} onFocus={(e) => e.currentTarget.select()} aria-label="Workspace link" className="w-full rounded-[6px] border border-canvas-line bg-canvas px-2 py-1 text-[12px] text-canvas-text" />}
          {shared.url ? SHARE_NOTICE : w.error ?? ""}
        </p>
      )}
      <ActivityPanel open={open} onClose={() => setOpen(false)} cities={cities} />
    </div>
  );
}
