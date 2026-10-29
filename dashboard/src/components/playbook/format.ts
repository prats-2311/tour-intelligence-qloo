import type { CardKind, PlaybookCard, RemovalReason } from "@/lib/qloo/types";

export const fit = (v: unknown): string => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(2) : "—");
/** Where fans and the city overall rank an item: "Fans #3 · city #12" or "Fans #3 · not in the city's top 20". */
export const rankLine = (artistRank: number, cityRank: number | null): string => `Fans #${artistRank} · ${cityRank === null ? "not in the city's top 20" : `city #${cityRank}`}`;
export const fanRankLine = (artistRank: number): string => `Fans rank it #${artistRank}`;
export const SPONSORS_NOT_MAINSTREAM_NOTE = "None of these brands is in the city's top 20, so they set this audience apart.";
/** One deal line for the top sponsor: the lift in words (never an exact "N places higher") plus a suggested ask. Null when there is no lift. */
export const dealLine = (brand: string, artistRank: number, cityRank: number | null, city: string, venue?: string): string | null => {
  const lift = cityRank === null ? `${brand} is #${artistRank} with fans and not in ${city}'s top 20.` : cityRank > artistRank ? `Fans rank ${brand} #${artistRank}; ${city} ranks it #${cityRank}.` : null;
  return lift === null ? null : `${lift} Suggested ask: presale access or a co-branded night ${venue ? `at ${venue}` : "on the tour stop"}.`;
};
/** Plain-words co-billing line; the formula lives in the tooltip. */
export const coBillLine = (sharedTaste: number, localAffinity: number): string => `Fans share taste ${Math.round(sharedTaste * 100)}% · the city likes them ${Math.round(localAffinity * 100)}%`;
export const pct = (share: number): string => `${Math.round(share * 100)}%`;
export const liftLine = (sharedTaste: number, a: number, lift: number): string => `${sharedTaste.toFixed(2)} × ${a.toFixed(2)} = ${lift.toFixed(2)}`;

export const CARD_TITLE: Record<CardKind | "this_week", string> = {
  sponsors: "Sponsors", merch: "Merch", promo_zones: "Promo zones", local_moment: "Local moment",
  venue_fit: "Venue fit", co_billing: "Co-billing", talent: "Local acts", this_week: "This week",
};

const UNIT: Partial<Record<CardKind, string>> = { sponsors: "BRANDS", venue_fit: "VENUES", co_billing: "ACTS", local_moment: "PICKS" };

export const metaLine = (code: string, kind: CardKind | "this_week", card?: PlaybookCard): string => {
  const base = `${code} · ${CARD_TITLE[kind].toUpperCase()}`;
  const unit = kind !== "this_week" ? UNIT[kind] : undefined;
  return card && unit && card.items.length > 0 ? `${base} · ${card.items.length} ${unit}` : base;
};

export const removalText = (r: { reason: RemovalReason; detail: string }): string => {
  switch (r.reason) {
    case "unsupported_number": return `Number ${r.detail} not in evidence`;
    case "unsupported_entity": return `Entity '${r.detail}' not in any referenced result`;
    case "dangling_ref": return `Cites missing evidence ${r.detail}`;
    case "no_refs": return "Cites no evidence";
    case "no_checkable_content": return "Nothing checkable (no names or numbers)";
  }
};

const CITY_CODES: Record<string, string> = {
  Guadalajara: "GDL", "Mexico City": "CDMX", "São Paulo": "SP", Curitiba: "CWB", "Rio de Janeiro": "RIO", "Los Angeles": "LA",
};
export const cityCode = (name: string): string =>
  CITY_CODES[name] ?? name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
