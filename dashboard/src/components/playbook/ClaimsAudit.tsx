import type { CardClaims } from "@/lib/qloo/types";
import { visibleClaims } from "@/lib/qloo/doNotBook";
import { removalText } from "./format";

export function ClaimsAudit({ claims }: { claims: Array<{ card: string; removed: CardClaims["removed"] }> }) {
  const groups = claims.map((g) => ({ ...g, removed: visibleClaims({ verified: [], removed: g.removed })!.removed })).filter((g) => g.removed.length > 0);
  if (groups.length === 0) return <p className="text-[13px] text-canvas-muted">No claims were removed.</p>;
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.card}>
          <h3 className="text-[15px] font-semibold text-canvas-text">{g.card}</h3>
          <ul className="mt-2 space-y-3">
            {g.removed.map((r, i) => (
              <li key={`${r.claim.text}-${i}`}>
                <p className="text-[15px] leading-[1.45] text-canvas-muted line-through">{r.claim.text}</p>
                <p className="mt-0.5 text-[13px] font-medium text-state-stale">{removalText(r)}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
