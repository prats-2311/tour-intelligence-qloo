import type { CardKind, PlaybookCard, RemovalReason } from "@/lib/qloo/types";

export const fit = (v: unknown): string => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(2) : "—");
export const pct = (share: number): string => `${Math.round(share * 100)}%`;
export const liftLine = (o: number, a: number, lift: number): string => `${o.toFixed(2)} × ${a.toFixed(2)} = ${lift.toFixed(2)}`;

export const CARD_TITLE: Record<CardKind | "this_week", string> = {
  sponsors: "Sponsors", merch: "Merch", promo_zones: "Promo zones", local_moment: "Local moment",
  venue_fit: "Venue fit", co_billing: "Co-billing", talent: "Talent brief", this_week: "This week",
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
