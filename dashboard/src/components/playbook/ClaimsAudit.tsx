import type { CardClaims } from "@/lib/qloo/types";
import { visibleClaims } from "@/lib/qloo/doNotBook";
import { removalText } from "./format";

// What a verified claim carries: its names and numbers. The matched Qloo value isn't in the payload, so we say where it was found.
const checkedText = (c: CardClaims["verified"][number]): string => {
  const bits = [...c.entities.map((e) => e.name), ...c.numbers.map(String)];
  return bits.length > 0 ? `${bits.join(", ")} found in this card's Qloo results` : "Found in this card's Qloo results";
};

export function ClaimsAudit({ claims }: { claims: Array<{ card: string; verified?: CardClaims["verified"]; removed: CardClaims["removed"] }> }) {
  const groups = claims.map((g) => { const v = visibleClaims({ verified: g.verified ?? [], removed: g.removed })!; return { card: g.card, verified: v.verified, removed: v.removed }; }).filter((g) => g.verified.length + g.removed.length > 0);
  return (
    <div className="space-y-5">
      <p className="text-[13px] text-canvas-muted">Every number and name in the write-up is checked against the Qloo results this card cites. Anything that doesn't match is removed.</p>
      {groups.length === 0 && <p className="text-[13px] text-canvas-muted">No claims were checked.</p>}
      {groups.map((g) => (
        <section key={g.card}>
          <h3 className="text-[15px] font-semibold text-canvas-text">{g.card}</h3>
          <ul className="mt-2 space-y-3">
            {g.verified.map((c, i) => (
              <li key={`v-${c.text}-${i}`}>
                <p className="text-[15px] leading-[1.45] text-canvas-text">{c.text}</p>
                <p className="mt-0.5 text-[13px] font-medium text-canvas-muted">Verified: {checkedText(c)}</p>
              </li>
            ))}
            {g.removed.map((r, i) => (
              <li key={`r-${r.claim.text}-${i}`}>
                <p className="text-[15px] leading-[1.45] text-canvas-muted line-through">{r.claim.text}</p>
                <p className="mt-0.5 text-[13px] font-medium text-state-stale">Removed: {removalText(r)}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
