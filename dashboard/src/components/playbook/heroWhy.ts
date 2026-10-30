import { applyDoNotBook } from "@/lib/qloo/doNotBook";
import { firstOkItem } from "@/lib/qloo/playbookFacts";
import type { CardKind, PlaybookCard } from "@/lib/qloo/types";
import { tiedFlags } from "@/lib/qloo/numberKey";
import { coBillLine, fit, pct } from "./format";

/** One muted line under a hero tile, and the playbook card it points at (`data-tour="card-<kind>"`, `id="card-<kind>"`). */
export interface HeroWhy { text: string; card: CardKind }
export type HeroWhys = Partial<Record<"top_zone" | "best_room" | "support", HeroWhy>>;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** Shown (not do-not-book) numeric values of one field on the first ok card of a kind: the pool the tile's item is ranked in. */
const pool = (cards: PlaybookCard[], kind: CardKind, key: string): number[] => {
  const c = cards.find((x) => x.kind === kind && x.status === "ok");
  return c ? applyDoNotBook(c).card.items.map((it) => num(it[key])).filter((v): v is number => v !== null) : [];
};
const rankIn = (v: number, all: number[]): number => 1 + all.filter((x) => x > v).length;

/**
 * Why Qloo picked each hero tile, from the playbook cards already loaded: the same item the tile names (first shown item), the card's
 * own formatters, nothing guessed. A tile whose data is missing gets no line.
 */
export function heroWhys(cards: PlaybookCard[]): HeroWhys {
  const out: HeroWhys = {};
  const zone = firstOkItem(cards, "promo_zones");
  const share = num(zone?.share);
  if (share !== null) out.top_zone = { text: `${pct(share)} of in-city fan heat (#${rankIn(share, pool(cards, "promo_zones", "share"))} of ${pool(cards, "promo_zones", "share").length} zones)`, card: "promo_zones" };
  const room = firstOkItem(cards, "venue_fit");
  const affinity = num(room?.affinity);
  if (affinity !== null) { const rooms = pool(cards, "venue_fit", "affinity"); out.best_room = { text: `venue fit ${fit(affinity)}, ${tiedFlags(rooms)[rooms.indexOf(affinity)] ? "tied " : ""}#${rankIn(affinity, rooms)} of ${rooms.length} rooms`, card: "venue_fit" }; }
  const act = firstOkItem(cards, "co_billing");
  const s = num(act?.sharedTaste), a = num(act?.localAffinity);
  if (s !== null && a !== null) { const l = coBillLine(s, a); out.support = { text: l.charAt(0).toLowerCase() + l.slice(1), card: "co_billing" }; }
  return out;
}

/** Scrolls to a playbook card by its anchor id, top edge just under the sticky tab bar (`scroll-margin-top` on `[data-card]`, see index.css); the page overrides this when the card may be on another tab. */
export function scrollToCard(kind: CardKind): void {
  const el = document.getElementById(`card-${kind}`);
  if (!el) return;
  const calm = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView?.({ behavior: calm ? "auto" : "smooth", block: "start", inline: "nearest" });
}
