import { isNonSponsor } from "./nonSponsors";

/** Sponsors by age group (gateway GET /v1/sponsor-segments). Age only. Indexes are signed over/under-index vs the average audience, never shares. */
export type AgeBand = "24_and_younger" | "25_to_29" | "30_to_34" | "35_to_44" | "45_to_54" | "55_and_older";
export const AGE_BANDS: readonly AgeBand[] = ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"];
export const BAND_LABEL: Record<AgeBand, string> = { "24_and_younger": "18–24", "25_to_29": "25–29", "30_to_34": "30–34", "35_to_44": "35–44", "45_to_54": "45–54", "55_and_older": "55+" };

export interface SegmentItem { name: string; entityId: string; artistRank: number; cityRank: number | null }
export interface SegmentBand {
  band: AgeBand; phrase: string; index: number;
  status: "ok" | "empty" | "unavailable";
  items: SegmentItem[];
  hiddenCount: number;
  newInTop5: number | null;
  lifted: boolean;
  sponsorCheck?: "unavailable";
}
export interface SponsorSegments {
  status: "ok" | "no_skew" | "unavailable";
  reason?: string;
  message?: string;
  indexes: Partial<Record<AgeBand, number>>;
  bands: SegmentBand[];
}

export const SEGMENT_UNAVAILABLE_COPY = "Qloo couldn't break this segment out.";
export const NO_SKEW_COPY = "No age group stands out for this artist's fans.";
export const UNDER_21_NOTE = "Includes under-21s: keep alcohol sponsors out of this segment.";

const ERROR: SponsorSegments = { status: "unavailable", reason: "error", message: SEGMENT_UNAVAILABLE_COPY, indexes: {}, bands: [] };
export const SEGMENTS_ERROR = ERROR;
export const SEGMENT_TIMEOUT_COPY = "This took too long. Try again.";
export const SEGMENTS_TIMEOUT: SponsorSegments = { status: "unavailable", reason: "timeout", message: SEGMENT_TIMEOUT_COPY, indexes: {}, bands: [] };

const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const isBand = (v: unknown): v is AgeBand => typeof v === "string" && (AGE_BANDS as readonly string[]).includes(v);

/** Defensive parse of the gateway answer; anything malformed is the unavailable state. Bands unknown to the client are dropped (the UI has no label for them). */
export function parseSponsorSegments(json: unknown): SponsorSegments {
  const o = rec(json);
  if (!o || (o.status !== "ok" && o.status !== "no_skew" && o.status !== "unavailable") || !Array.isArray(o.bands)) return ERROR;
  const indexes: SponsorSegments["indexes"] = {};
  for (const [k, v] of Object.entries(rec(o.indexes) ?? {})) if (isBand(k) && typeof v === "number" && Number.isFinite(v)) indexes[k] = v;
  const bands: SegmentBand[] = [];
  for (const raw of o.bands) {
    const b = rec(raw);
    if (!b || !isBand(b.band) || typeof b.index !== "number" || !Number.isFinite(b.index)) continue;
    const items: SegmentItem[] = Array.isArray(b.items) ? b.items.flatMap((r) => {
      const it = rec(r);
      return it && typeof it.name === "string" && it.name !== "" && typeof it.entityId === "string" && typeof it.artistRank === "number"
        ? [{ name: it.name, entityId: it.entityId, artistRank: it.artistRank, cityRank: typeof it.cityRank === "number" ? it.cityRank : null }] : [];
    }) : [];
    bands.push({
      band: b.band, phrase: typeof b.phrase === "string" ? b.phrase : "", index: b.index,
      status: b.status === "ok" || b.status === "empty" ? b.status : "unavailable", items,
      hiddenCount: typeof b.hiddenCount === "number" && b.hiddenCount > 0 ? b.hiddenCount : 0,
      newInTop5: typeof b.newInTop5 === "number" ? b.newInTop5 : null, lifted: b.lifted === true,
      ...(b.sponsorCheck === "unavailable" ? { sponsorCheck: "unavailable" as const } : {}),
    });
  }
  return { status: o.status, ...(typeof o.reason === "string" ? { reason: o.reason } : {}), ...(typeof o.message === "string" ? { message: o.message } : {}), indexes, bands };
}

const US = new Set(["us", "usa", "united states", "united states of america"]);
/** US drinking age is 21, so an 18-24 segment there includes under-21s. MX and BR (and everywhere else) get no note: the rule is about the US only. */
export const showsUnder21Note = (country: string | undefined, band: AgeBand): boolean => band === "24_and_younger" && US.has((country ?? "").trim().toLowerCase());

/** "+0.91" or "−0.37": the signed index as Qloo gives it (over/under-index vs the average audience), two decimals, never a percentage. */
export const signedIndex = (n: number): string => `${n < 0 ? "−" : "+"}${Math.abs(n).toFixed(2)}`;

export const bandHeader = (band: AgeBand, index: number): string => `Fans aged ${BAND_LABEL[band]} over-index here: ${signedIndex(index)} vs the average audience (not a share of fans).`;
export const differLine = (n: number): string => `${n} of the top 5 differ from all fans`;

/** Items the dashboard still hides on display (organisations); the gateway's own removals arrive as hiddenCount. */
export function displayItems(band: SegmentBand): { items: SegmentItem[]; hiddenOrgs: number } {
  const items = band.items.filter((it) => !isNonSponsor(it.name));
  return { items, hiddenOrgs: band.hiddenCount + (band.items.length - items.length) };
}
