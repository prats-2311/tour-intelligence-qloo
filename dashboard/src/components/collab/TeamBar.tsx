import { ChevronDown, Link2, Pencil, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { Sheet } from "@/components/qloo/Sheet";
import { DEMO_BANNER, FIELD_LABEL, SHARE_NOTICE, STATUS_LABEL, timeAgo, type ActivityEvent, type Field } from "@/lib/collab/types";
import { useWorkspace } from "@/lib/collab/workspaceContext";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { NotesButton, NotesSheet } from "./Notes";
import { collabBtn, demoChip, roleChip } from "./ui";
import { shareToast } from "./useCollabWrite";

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

const MENU_ITEM = "flex min-h-11 w-full items-center gap-2 rounded-[8px] px-3 text-left text-[13px] font-medium text-canvas-text hover:bg-paper-raised focus-visible:bg-paper-raised focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold";

/** Below 1280px the secondary actions share one "Team" menu so the header row is the same width whatever is clicked. */
function TeamMenu({ tourThread, onActivity, onShare }: { tourThread?: string; onActivity: () => void; onShare: () => void }) {
  const w = useWorkspace();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const items = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  useEffect(() => { if (open) items()[0]?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  const close = (refocus = true) => { setOpen(false); if (refocus) btn.current?.focus(); };
  const pick = (fn: () => void) => () => { setOpen(false); fn(); };
  const onKey = (e: React.KeyboardEvent) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => { e.preventDefault(); list[(n + list.length) % list.length]?.focus(); };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "Tab") setOpen(false);
  };
  const n = tourThread ? w.snapshot?.threads[tourThread]?.messages.length ?? 0 : 0;
  return (
    <>
      <button ref={btn} type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); setOpen(true); } }} className={collabBtn}>
        <Users size={14} aria-hidden />Team<ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <div ref={menu} role="menu" aria-label="Team" onKeyDown={onKey} className="absolute right-0 top-full z-40 mt-1 flex w-64 flex-col gap-0.5 rounded-[10px] border border-canvas-line bg-paper p-1 shadow-lg">
          {tourThread && <button type="button" role="menuitem" onClick={pick(() => setNotes(true))} className={MENU_ITEM}>Tour notes ({n})</button>}
          <button type="button" role="menuitem" onClick={pick(onActivity)} className={MENU_ITEM}>Team activity</button>
          <button type="button" role="menuitem" onClick={pick(onShare)} className={MENU_ITEM}>Share with your team</button>
          {w.identity && <button type="button" role="menuitem" onClick={pick(w.editIdentity)} className={MENU_ITEM}>Writing as {w.identity.name} · {w.identity.role}</button>}
        </div>
      )}
      {tourThread && <NotesSheet open={notes} onClose={() => setNotes(false)} title="Notes: the whole tour" threadKey={tourThread} />}
    </>
  );
}

/** Header controls: team activity, share link and who is writing. Hidden when collaboration is off. */
export function TeamBar({ cities, tourThread }: { cities: Array<{ id: string; name: string }>; /** Thread key for whole-tour notes (the board and the book), shown as "Tour notes (N)". */ tourThread?: string }) {
  const w = useWorkspace();
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const wide = useMediaQuery("(min-width: 1280px)");
  if (!w.enabled) return null;
  const share = () => void w.share().then((r) => toast(shareToast(r, w.error)));
  return (
    <div data-testid="team-bar" className="relative flex min-w-0 flex-nowrap items-center gap-2">
      {wide ? (
        <>
          {tourThread && <NotesButton threadKey={tourThread} title="the whole tour" label="Tour notes" />}
          <button type="button" onClick={() => setOpen(true)} className={`${collabBtn} whitespace-nowrap`}><Users size={14} aria-hidden />Team activity</button>
          <button type="button" onClick={share} className={`${collabBtn} whitespace-nowrap`}><Link2 size={14} aria-hidden />Share with your team</button>
          {w.identity && (
            <button type="button" onClick={w.editIdentity} aria-label={`Writing as ${w.identity.name}, ${w.identity.role}. Change`} className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-canvas-line px-3 text-[13px] font-medium text-canvas-text hover:bg-paper-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
              <Pencil size={12} aria-hidden />{w.identity.name} · {w.identity.role}
            </button>
          )}
        </>
      ) : <TeamMenu tourThread={tourThread} onActivity={() => setOpen(true)} onShare={share} />}
      <ActivityPanel open={open} onClose={() => setOpen(false)} cities={cities} />
    </div>
  );
}
