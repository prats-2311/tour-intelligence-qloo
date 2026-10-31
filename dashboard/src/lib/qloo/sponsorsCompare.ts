import { isNonSponsor } from "./nonSponsors";

/** "The same model, without Qloo" for sponsors (gateway GET /v1/sponsors-without-qloo). Gemini alone picks brands; each is placed on Qloo's fan ranking. */
export interface ComparePick { name: string; fanRank: number | null; cityRank: number | null; nonSponsor?: true }
export interface CompareTop { name: string; fanRank: number; cityRank: number | null }
export type SponsorsCompare =
  | { status: "ok"; model: string; brands: ComparePick[]; qlooTop: CompareTop | null; cached: boolean }
  | { status: "unavailable"; reason: string; message: string };

export const COMPARE_NOTE = "Measured on Qloo's own fan ranking: this shows how far a model's memory strays from these fans' taste, not that the ranking is right.";
export const COMPARE_LIVE_LABEL = "Live: asks Gemini once, cached after.";
export const COMPARE_TOGGLE = "Compare: the same model, without Qloo";
export const COMPARE_UNAVAILABLE_COPY = "The comparison isn't available right now.";
export const COMPARE_TIMEOUT_COPY = "This took too long. Try again.";

export const COMPARE_ERROR: SponsorsCompare = { status: "unavailable", reason: "error", message: COMPARE_UNAVAILABLE_COPY };
export const COMPARE_TIMEOUT: SponsorsCompare = { status: "unavailable", reason: "timeout", message: COMPARE_TIMEOUT_COPY };

const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const rank = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 1 ? v : null);

/** Defensive parse; anything malformed is the unavailable state. The non-sponsor display filter is applied here too, whatever the gateway marked. */
export function parseSponsorsCompare(json: unknown): SponsorsCompare {
  const o = rec(json);
  if (!o) return COMPARE_ERROR;
  if (o.status === "unavailable") return { status: "unavailable", reason: typeof o.reason === "string" ? o.reason : "error", message: typeof o.message === "string" && o.message ? o.message : COMPARE_UNAVAILABLE_COPY };
  if (o.status !== "ok" || !Array.isArray(o.brands)) return COMPARE_ERROR;
  const brands: ComparePick[] = o.brands.flatMap((raw) => {
    const b = rec(raw);
    if (!b || typeof b.name !== "string" || b.name === "") return [];
    const non = b.nonSponsor === true || isNonSponsor(b.name);
    return [{ name: b.name, fanRank: non ? null : rank(b.fanRank), cityRank: non ? null : rank(b.cityRank), ...(non ? { nonSponsor: true as const } : {}) }];
  });
  if (brands.length === 0) return COMPARE_ERROR;
  const t = rec(o.qlooTop);
  const qlooTop = t && typeof t.name === "string" && t.name !== "" && rank(t.fanRank) !== null ? { name: t.name, fanRank: rank(t.fanRank)!, cityRank: rank(t.cityRank) } : null;
  return { status: "ok", model: typeof o.model === "string" ? o.model : "", brands, qlooTop, cached: o.cached === true };
}

export const pickLine = (b: ComparePick): string => (b.nonSponsor ? "not a brand" : b.fanRank === null ? "not in these fans' top 20" : `#${b.fanRank} with these fans`);
export const qlooLine = (t: CompareTop): string => `fans rank it #${t.fanRank} · ${t.cityRank === null ? "not in the city's top 20" : `city #${t.cityRank}`}`;

const trim = (n: number): string => String(Math.round(n * 10) / 10);

/** The computed one-liner, from the picks only. Non-brands are left out of both counts. Null when there is nothing to measure. */
export function compareSummary(brands: ComparePick[]): string | null {
  const measured = brands.filter((b) => !b.nonSponsor);
  if (measured.length === 0) return null;
  const ranked = measured.filter((b) => b.fanRank !== null).map((b) => b.fanRank!);
  const out = measured.length - ranked.length;
  if (ranked.length === 0) return `${out} of ${measured.length} of Gemini's picks aren't in these fans' top 20.`;
  return `Gemini's picks average #${trim(ranked.reduce((a, c) => a + c, 0) / ranked.length)} with these fans; ${out} of ${measured.length} aren't in their top 20.`;
}
