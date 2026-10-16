import type { EvidenceItem } from "../claims/verify.js";
import type { PlaybookCard } from "../types.js";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

const ZONE_LABEL = "promo zone: affinity (0-1), share = fraction of the city's fan heat, then the same share as a whole-number percent; state only the percent";
const CO_BILL_LABEL = "co-bill: sharedTaste (0-1 score, not audience overlap), localAffinity (0-1), lift = shared taste × local affinity; none are percentages";

/** One evidence item per card item, id "<kind>:<index>"; numbers are the values a claim may quote. */
export function buildEvidence(cards: PlaybookCard[]): EvidenceItem[] {
  const out: EvidenceItem[] = [];
  for (const card of cards) {
    card.items.forEach((raw, i) => {
      const it = rec(raw);
      const name = typeof it.name === "string" ? it.name : typeof it.label === "string" ? it.label : "";
      const numbers: number[] = [];
      for (const k of ["affinity", "sharedTaste", "localAffinity", "lift"]) if (finite(it[k])) numbers.push(it[k] as number);
      if (finite(it.share)) numbers.push(it.share as number, Math.round((it.share as number) * 100));
      const item: EvidenceItem = { id: `${card.kind}:${i}`, entityIds: typeof it.entityId === "string" ? [it.entityId] : [], names: name ? [name] : [], numbers };
      if (card.kind === "promo_zones") item.label = ZONE_LABEL;
      if (card.kind === "co_billing") { item.label = CO_BILL_LABEL; item.noPercent = true; }
      out.push(item);
    });
    const sharedTaste = card.summary?.sharedTaste;
    if (card.kind === "talent" && finite(sharedTaste)) out.push({ id: "talent:sharedTaste", entityIds: [], names: [], numbers: [sharedTaste], label: "shared taste (0-1 score of common taste tags between the artist and the city's mainstream acts; not audience overlap, not a percentage)", noPercent: true });
  }
  return out;
}
