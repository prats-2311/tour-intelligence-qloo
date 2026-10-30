import { CARD_TITLE } from "@/components/playbook/format";
import { STATUS_LABEL, timeAgo } from "@/lib/collab/types";
import { useWorkspace } from "@/lib/collab/workspaceContext";
import { NoteText } from "./Notes";
import { SponsorLeads } from "./SponsorLeads";

/** Tour Book chapter: the team's status, sponsor leads and decisions (the last note of each resolved thread). Prints with the chapter. */
export function ChapterTeam({ cityId }: { cityId: string }) {
  const w = useWorkspace();
  const snap = w.enabled ? w.snapshot : null;
  if (!snap) return null;
  const status = snap.statuses[cityId];
  const decisions = Object.entries(snap.threads)
    .filter(([k, t]) => t.resolved && t.messages.length > 0 && (k === `city:${cityId}` || k.startsWith(`card:${cityId}:`)))
    .map(([k, t]) => ({ key: k, where: k.startsWith("card:") ? CARD_TITLE[k.split(":")[2] as keyof typeof CARD_TITLE] ?? k.split(":")[2]!.replace(/_/g, " ") : "City", last: t.messages[t.messages.length - 1]! }));
  const leads = snap.leads[cityId] ?? [];
  if (!status && decisions.length === 0 && leads.length === 0) return null;
  return (
    <section data-testid="chapter-team" data-tour="chapter-team" aria-label="Team" className="flex min-w-0 break-inside-avoid flex-col gap-2 rounded-[14px] bg-canvas-raised p-3 md:p-4">
      <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-canvas-muted">Team</h3>
      {status && <p className="text-[15px] font-semibold text-canvas-text">{STATUS_LABEL[status.status]} <span className="text-[13px] font-normal text-canvas-muted">by {status.name} ({status.role}) · {timeAgo(status.at)}{status.demo ? " · Demo teammate" : ""}</span></p>}
      {decisions.length > 0 && (
        <div className="flex flex-col gap-1">
          <h4 className="text-[13px] font-semibold text-canvas-text">Decisions</h4>
          <ul className="flex flex-col gap-1">
            {decisions.map((d) => (
              <li key={d.key} className="text-[14px] leading-[1.45] text-canvas-text">
                <span className="text-canvas-muted">{d.where}: </span><NoteText text={d.last.text} /> <span className="text-[12px] text-canvas-muted">{d.last.name} ({d.last.role}){d.last.demo ? " · Demo teammate" : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <SponsorLeads cityId={cityId} readOnly />
    </section>
  );
}
