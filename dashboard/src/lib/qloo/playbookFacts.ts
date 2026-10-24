import type { PlaybookCard } from "./types";

/**
 * The first item's name on a playbook card, only when the card is ok and the item has a name. One rule for every place that quotes
 * a card (the playbook's Support tile, the Tour Book's advance sheet, the landing story): an empty card renders "no results", so
 * whatever items it carries must never be quoted.
 */
export function firstOkName(cards: PlaybookCard[], kind: PlaybookCard["kind"], key = "name"): string | null {
  const v = cards.find((c) => c.kind === kind && c.status === "ok")?.items[0]?.[key];
  return typeof v === "string" && v ? v : null;
}
