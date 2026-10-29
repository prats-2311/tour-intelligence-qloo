import { isHiddenItem } from "./doNotBook";
import type { PlaybookCard } from "./types";

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** Finite numbers only: NaN serialises to null over the wire, strings are never coerced. */
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export interface DemographicBar { group: "age" | "gender"; label: string; index: number }

const AGE_LABELS: Array<[key: string, label: string]> = [
  ["24_and_younger", "24 and under"], ["25_to_29", "25–29"], ["30_to_34", "30–34"], ["35_to_44", "35–44"], ["45_to_54", "45–54"], ["55_and_older", "55+"],
];
const GENDER_LABELS: Array<[key: string, label: string]> = [["male", "Men"], ["female", "Women"]];

/** F4: results[0].query.age / .gender are maps of signed over/under-index values (-1..1). Missing maps give fewer bars. */
export function toDemographicBars(results: unknown): DemographicBar[] {
  const first = Array.isArray(results) ? results.find((r) => isRec(r) && isRec(r.query)) : undefined;
  const query = isRec(first) && isRec(first.query) ? first.query : undefined;
  if (!query) return [];
  const out: DemographicBar[] = [];
  for (const [group, labels] of [["age", AGE_LABELS], ["gender", GENDER_LABELS]] as const) {
    const map = query[group];
    if (!isRec(map)) continue;
    for (const [key, label] of labels) {
      const index = num(map[key]);
      if (index !== null) out.push({ group, label, index });
    }
  }
  return out;
}

/** F3: the gateway sends trends as an array of {date, value}; empty is a normal answer. */
export function toTrendSeries(t: unknown): Array<{ date: string; value: number }> {
  if (!Array.isArray(t)) return [];
  const out: Array<{ date: string; value: number }> = [];
  for (const r of t) {
    if (!isRec(r)) continue;
    const value = num(r.value);
    if (typeof r.date === "string" && r.date !== "" && value !== null) out.push({ date: r.date, value });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export type CrossCategory = "artist" | "movie" | "tv_show" | "place" | "brand";
export const CROSS_CATEGORIES: CrossCategory[] = ["artist", "movie", "tv_show", "place", "brand"];

function inferCategory(item: Record<string, unknown>): CrossCategory | null {
  const t = [item.category, item.type, item.subtype].filter((x): x is string => typeof x === "string").join(" ").toLowerCase();
  if (t.includes("artist")) return "artist";
  if (t.includes("movie")) return "movie";
  if (t.includes("tv_show")) return "tv_show";
  if (t.includes("place")) return "place";
  return null;
}

export function playbookCrossDomain(cards: PlaybookCard[]): Array<{ category: CrossCategory; name: string; affinity: number | null }> {
  const out: Array<{ category: CrossCategory; name: string; affinity: number | null }> = [];
  for (const card of cards ?? []) {
    if (card.kind !== "local_moment" && card.kind !== "sponsors") continue;
    for (const item of card.items ?? []) {
      if (!isRec(item) || typeof item.name !== "string" || !item.name || isHiddenItem(card.kind, item)) continue;
      const category = card.kind === "sponsors" ? "brand" : inferCategory(item);
      if (category) out.push({ category, name: item.name, affinity: num(item.affinity) });
    }
  }
  return out;
}

const TOP_TAGS = 5;

/**
 * F1: compare_audiences has no scalar overlap. Shared taste = mean of the top-5 `results.tags[].query.score` (0..1);
 * null when no usable tag is returned. Tags are the top 3 names, highest score first.
 */
export function extractSharedTaste(envelope: unknown): { value: number | null; tags: string[] } {
  const raw = isRec(envelope) && isRec(envelope.results) ? envelope.results.tags : undefined;
  const scored = (Array.isArray(raw) ? raw : []).flatMap((t) => {
    const score = isRec(t) && isRec(t.query) ? num(t.query.score) : null;
    return isRec(t) && typeof t.name === "string" && score !== null && score >= 0 && score <= 1 ? [{ name: t.name, score }] : [];
  }).sort((a, b) => b.score - a.score).slice(0, TOP_TAGS);
  if (scored.length === 0) return { value: null, tags: [] };
  return { value: scored.reduce((sum, t) => sum + t.score, 0) / scored.length, tags: scored.slice(0, 3).map((t) => t.name) };
}

/** Message of an error-status envelope, else null. */
export function envelopeError(envelope: unknown): string | null {
  if (!isRec(envelope) || envelope.status !== "error") return null;
  for (const k of ["summary", "error", "message"]) if (typeof envelope[k] === "string" && envelope[k]) return envelope[k] as string;
  return "Qloo returned an error for this comparison";
}
