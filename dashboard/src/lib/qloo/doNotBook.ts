import type { CardClaims, PlaybookCard } from "./types";

/** Acts we will not book. Applied at display time only: recordings, proof data and the gateway are untouched. */
export const DO_NOT_BOOK: readonly string[] = ["Ariel Pink"];

export const HIDDEN_NOTE = (n: number): string => `${n} act${n === 1 ? "" : "s"} hidden by our do-not-book list`;

const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const FOLDED = DO_NOT_BOOK.map(fold);

/** Accent- and case-folded exact name match. */
export const isDoNotBook = (name: unknown): boolean => typeof name === "string" && FOLDED.includes(fold(name));

/** True when free text (a narrative claim) names a listed act. */
export const mentionsDoNotBook = (text: string): boolean => { const t = fold(text); return FOLDED.some((n) => t.includes(n)); };

const isArtistItem = (it: Record<string, unknown>): boolean =>
  [it.category, it.type, it.subtype].some((v) => typeof v === "string" && v.toLowerCase().includes("artist"));

/** Whether this item of a card of this kind is a listed act. Brands, places and films are never hidden. */
export function isHiddenItem(kind: PlaybookCard["kind"], it: Record<string, unknown>): boolean {
  if (!isDoNotBook(it.name)) return false;
  return kind === "co_billing" || kind === "talent" || (kind === "local_moment" && isArtistItem(it));
}

/** The card with listed acts removed, and how many were. The same object when none were. */
export function applyDoNotBook(card: PlaybookCard): { card: PlaybookCard; hidden: number } {
  const items = card.items.filter((it) => !isHiddenItem(card.kind, it));
  const hidden = card.items.length - items.length;
  return hidden === 0 ? { card, hidden: 0 } : { card: { ...card, items }, hidden };
}

const claimMentions = (c: { text: string; entities: Array<{ name: string }> }): boolean => mentionsDoNotBook(c.text) || c.entities.some((e) => isDoNotBook(e.name));

/** Claims (verified and removed) that name a listed act are not shown. */
export function visibleClaims(claims: CardClaims | undefined): CardClaims | undefined {
  if (!claims) return claims;
  return { verified: claims.verified.filter((c) => !claimMentions(c)), removed: claims.removed.filter((r) => !claimMentions(r.claim)) };
}
