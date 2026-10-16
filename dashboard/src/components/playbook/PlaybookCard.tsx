import type { ReactNode } from "react";
import type { CardClaims } from "@/lib/qloo/types";
import { ClaimsBadge } from "./ClaimsBadge";

// DESIGN 4.2 CueCard for the playbook: perforated city-accent rail, no border, no shadow.
export function PlaybookCard({ accent, meta, title, claims, narrativeStatus, refsCount, onAudit, hasEvidence, children }: {
  accent: string; meta: string; title: string; claims?: CardClaims;
  narrativeStatus: "ok" | "unavailable" | "pending"; refsCount: number; onAudit?: () => void; hasEvidence: boolean; children: ReactNode;
}) {
  const verified = claims?.verified ?? [];
  const removed = claims?.removed.length ?? 0;
  return (
    <article className="overflow-hidden rounded-[18px] bg-paper">
      <div
        aria-hidden /* taste-skill-ignore: DESIGN 4.2 perforated rail */
        className="h-2.5"
        style={{
          backgroundColor: accent,
          backgroundImage: "radial-gradient(circle, var(--color-paper) 2.75px, transparent 3.25px)", // taste-skill-ignore: DESIGN 4.2 perforation holes
          backgroundSize: "14px 100%",
          backgroundRepeat: "repeat-x",
          backgroundPosition: "7px center",
        }}
      />
      <div className="p-4 md:p-5">
        <p /* taste-skill-ignore: DESIGN 4.2 CueCard meta line */ className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted tabular-nums">{meta}</p>
        <h3 className="font-title mt-1 text-[20px] leading-tight text-canvas-text">{title}</h3>
        {narrativeStatus === "pending" && <div className="skeleton mt-3 h-4 w-4/5 rounded-[4px]" aria-hidden />}
        {narrativeStatus === "ok" && verified.length > 0 && (
          <ul className="mt-3 space-y-2 text-[15px] leading-[1.45] text-canvas-text">
            {verified.map((c, i) => <li key={`${i}-${c.text}`}>{c.text}</li>)}
          </ul>
        )}
        {narrativeStatus === "ok" && claims && hasEvidence && verified.length === 0 && (
          <p className="mt-3 text-[13px] text-canvas-muted">Narrative removed: no claim passed verification.</p>
        )}
        <div className="mt-4">{children}</div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3">
          {narrativeStatus === "ok" && claims ? <ClaimsBadge verified={verified.length} removed={removed} onClick={removed > 0 ? onAudit : undefined} /> : <span />}
          {refsCount > 0 && (
            <span className="inline-flex h-6 items-center rounded-[4px] bg-paper-raised px-2 text-[12px] font-medium tabular-nums text-canvas-muted">
              Qloo · {refsCount} {refsCount === 1 ? "request" : "requests"}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
