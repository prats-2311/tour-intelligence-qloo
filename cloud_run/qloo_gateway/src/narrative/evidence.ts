import type { EvidenceItem } from "../claims/verify.js";
import type { PlaybookCard } from "../types.js";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

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
      out.push({ id: `${card.kind}:${i}`, entityIds: typeof it.entityId === "string" ? [it.entityId] : [], names: name ? [name] : [], numbers });
    });
    const sharedTaste = card.summary?.sharedTaste;
    if (card.kind === "talent" && finite(sharedTaste)) out.push({ id: "talent:sharedTaste", entityIds: [], names: [], numbers: [sharedTaste] });
  }
  return out;
}
