import { isNonSponsor, mentionsNonSponsor } from "./nonSponsors";
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
  if (kind === "sponsors" && isNonSponsor(it.name)) return true; // organisations, not brands
  if (!isDoNotBook(it.name)) return false;
  return kind === "co_billing" || kind === "talent" || (kind === "local_moment" && isArtistItem(it));
}

/**
 * The card with listed acts and non-sponsor organisations removed. `hidden` counts the acts; `hiddenOrgs` counts the organisations, including any
 * the gateway already removed (summary.hiddenNonSponsors). The same card object when nothing was removed here.
 */
export function applyDoNotBook(card: PlaybookCard): { card: PlaybookCard; hidden: number; hiddenOrgs: number } {
  const gw = card.kind === "sponsors" && typeof card.summary?.hiddenNonSponsors === "number" && card.summary.hiddenNonSponsors > 0 ? card.summary.hiddenNonSponsors : 0;
  const orgs = card.kind === "sponsors" ? card.items.filter((it) => isNonSponsor(it.name)).length : 0;
  const items = card.items.filter((it) => !isHiddenItem(card.kind, it));
  const hidden = card.items.length - items.length - orgs;
  return orgs + hidden === 0 ? { card, hidden: 0, hiddenOrgs: gw } : { card: { ...card, items }, hidden, hiddenOrgs: orgs + gw };
}

const claimMentions = (c: { text: string; entities: Array<{ name: string }> }): boolean => mentionsDoNotBook(c.text) || mentionsNonSponsor(c.text) || c.entities.some((e) => isDoNotBook(e.name) || isNonSponsor(e.name));

/** Claims (verified and removed) that name a listed act or a non-sponsor organisation are not shown. */
export function visibleClaims(claims: CardClaims | undefined): CardClaims | undefined {
  if (!claims) return claims;
  return { verified: claims.verified.filter((c) => !claimMentions(c)), removed: claims.removed.filter((r) => !claimMentions(r.claim)) };
}

/** Verified and removed claim totals over a narrative's cards, counting only what visibleClaims leaves on display. */
export function visibleClaimTotals(cards: Partial<Record<PlaybookCard["kind"], CardClaims>>): { verified: number; removed: number } {
  let verified = 0, removed = 0;
  for (const c of Object.values(cards)) { const v = visibleClaims(c); verified += v?.verified.length ?? 0; removed += v?.removed.length ?? 0; }
  return { verified, removed };
}
