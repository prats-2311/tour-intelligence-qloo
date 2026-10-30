import type { GatewayEvent, PlaybookCard } from "@/lib/qloo/types";

/** A claim that names the do-not-book act, as the gateway could emit one. */
export const ARIEL_CLAIM = { text: "Ariel Pink draws the same fans.", entities: [{ name: "Ariel Pink" }], numbers: [], evidence_refs: [] as string[] };

/**
 * Test helper: the same playbook events with the do-not-book act planted first in every act card and in every card's
 * verified and removed claims. A display path that skips the do-not-book filter then shows "Ariel Pink".
 */
export function withArielPink(events: GatewayEvent[]): GatewayEvent[] {
  return events.map((e): GatewayEvent => {
    if (e.type === "playbook") {
      const cards = e.playbook.cards.map((c): PlaybookCard => (c.status === "ok" && (c.kind === "co_billing" || c.kind === "talent" || c.kind === "local_moment") ? { ...c, items: [{ name: "Ariel Pink", category: "artist", affinity: 0.99 }, ...c.items] } : c));
      return { ...e, playbook: { ...e.playbook, cards } };
    }
    if (e.type === "narrative" && e.narrative.status === "ok") {
      const cards = Object.fromEntries(Object.entries(e.narrative.cards).map(([k, v]) => [k, v ? { ...v, verified: [...v.verified, ARIEL_CLAIM], removed: [...v.removed, { claim: ARIEL_CLAIM, reason: "no_refs" as const, detail: "" }] } : v]));
      return { ...e, narrative: { ...e.narrative, cards } };
    }
    return e;
  });
}
