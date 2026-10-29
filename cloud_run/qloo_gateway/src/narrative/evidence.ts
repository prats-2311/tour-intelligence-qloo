import type { EvidenceItem } from "../claims/verify.js";
import type { PlaybookCard } from "../types.js";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

const ZONE_LABEL = "promo zone: affinity (0-1), share = fraction of the city's fan heat, then the same share as a whole-number percent; state only the percent";
const LIFT_LABEL = "artistRank = where this artist's fans rank it (1 = top), cityRank = where the city overall ranks it (null = not in the city's top 20); ranks are positions, not scores or percentages, and the difference between them is not a number to quote";
const CO_BILL_LABEL = "co-bill: sharedTaste (0-1 score, not audience overlap), the city score (0-1: how much the city likes them), lift = shared taste × how much the city likes them; none are percentages";

const TYPE_NAME: Record<string, string> = { movie: "film", tv_show: "TV show", place: "place", artist: "artist" };

/** One evidence item per card item, id "<kind>:<index>"; numbers are the values a claim may quote. */
export function buildEvidence(cards: PlaybookCard[]): EvidenceItem[] {
  const out: EvidenceItem[] = [];
  for (const card of cards) {
    card.items.forEach((raw, i) => {
      const it = rec(raw);
      const name = typeof it.name === "string" ? it.name : typeof it.label === "string" ? it.label : "";
      const numbers: number[] = [];
      for (const k of ["affinity", "sharedTaste", "localAffinity", "lift", "artistRank", "cityRank"]) if (finite(it[k])) numbers.push(it[k] as number);
      if (finite(it.share)) numbers.push(it.share as number, Math.round((it.share as number) * 100));
      const item: EvidenceItem = { id: `${card.kind}:${i}`, entityIds: typeof it.entityId === "string" ? [it.entityId] : [], names: name ? [name] : [], numbers };
      if (card.kind === "promo_zones") item.label = ZONE_LABEL;
      if (finite(it.rankLift) && (card.kind === "sponsors" || card.kind === "local_moment")) item.label = LIFT_LABEL;
      if (card.kind === "local_moment" && typeof it.category === "string" && TYPE_NAME[it.category]) {
        item.label = `${item.label ?? ""}${item.label ? "; " : ""}type: ${TYPE_NAME[it.category]}; any rank is within this type only (#1 among ${TYPE_NAME[it.category]}s), not overall`;
      }
      if (card.kind === "co_billing") { item.label = CO_BILL_LABEL; item.noPercent = true; }
      out.push(item);
    });
    const brands = card.summary?.brands;
    if (card.kind === "merch" && Array.isArray(brands) && brands.length > 0) out.push({ id: "merch:brands", entityIds: [], names: brands, numbers: [], label: "brands ranked by how much higher this artist's fans rank them than the city does (top first)" });
    const sharedTaste = card.summary?.sharedTaste;
    if (card.kind === "talent" && finite(sharedTaste)) out.push({ id: "talent:sharedTaste", entityIds: [], names: [], numbers: [sharedTaste], label: "shared taste (0-1 score of common taste tags between the artist and the city's mainstream acts; not audience overlap, not a percentage)", noPercent: true });
  }
  return out;
}
