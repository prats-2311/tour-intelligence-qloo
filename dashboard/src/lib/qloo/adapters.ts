import type { PlaybookCard } from "./types";

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** Finite numbers only: NaN serialises to null over the wire, strings are never coerced. */
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const firstOf = (o: Record<string, unknown>, keys: string[]): unknown => keys.map((k) => o[k]).find((v) => v !== undefined && v !== null);

export function toDemographicBars(d: unknown[]): Array<{ label: string; index: number }> {
  if (!Array.isArray(d)) return [];
  const out: Array<{ label: string; index: number }> = [];
  for (const r of d) {
    if (!isRec(r)) continue;
    const label = firstOf(r, ["label", "name", "age", "bucket"]);
    const index = num(firstOf(r, ["index", "value", "affinity"]));
    if ((typeof label === "string" || typeof label === "number") && index !== null) out.push({ label: String(label), index });
  }
  return out;
}

function points(arr: unknown[]): Array<{ date: string; value: number }> {
  const out: Array<{ date: string; value: number }> = [];
  for (const r of arr) {
    if (!isRec(r)) continue;
    const date = firstOf(r, ["date", "time", "day"]);
    const value = num(firstOf(r, ["value", "popularity", "score"]));
    if (typeof date === "string" && value !== null) out.push({ date, value });
  }
  return out;
}

export function toTrendSeries(t: unknown): Array<{ date: string; value: number }> {
  let arr: unknown[] | null = null;
  if (isRec(t) && Array.isArray(t.series)) arr = t.series;
  else if (Array.isArray(t)) {
    const first = t.find(isRec);
    arr = first && Array.isArray(first.series) ? first.series : t;
  }
  if (!arr) return [];
  return points(arr).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export type CrossCategory = "artist" | "movie" | "tv_show" | "place" | "brand";
export const CROSS_CATEGORIES: CrossCategory[] = ["artist", "movie", "tv_show", "place", "brand"];

function inferCategory(item: Record<string, unknown>): CrossCategory | null {
  const t = [item.type, item.subtype].filter((x): x is string => typeof x === "string").join(" ").toLowerCase();
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
      if (!isRec(item) || typeof item.name !== "string" || !item.name) continue;
      const category = card.kind === "sponsors" ? "brand" : inferCategory(item);
      if (category) out.push({ category, name: item.name, affinity: num(item.affinity) });
    }
  }
  return out;
}

/** Overlap is a share in [0,1]; read from envelope.results (object or first element), then shallow fallbacks. */
export function extractOverlap(envelope: unknown): number | null {
  const spots: unknown[] = [];
  if (isRec(envelope)) spots.push(envelope.results, envelope.data, envelope.summary);
  spots.push(envelope);
  for (const s of [...spots]) if (Array.isArray(s)) spots.push(s[0]);
  for (const s of spots) {
    if (!isRec(s)) continue;
    const v = num(firstOf(s, ["overlap", "similarity"]));
    if (v !== null) return v >= 0 && v <= 1 ? v : null;
  }
  return null;
}

/** Message of an error-status envelope, else null. */
export function envelopeError(envelope: unknown): string | null {
  if (!isRec(envelope) || envelope.status !== "error") return null;
  for (const k of ["summary", "error", "message"]) if (typeof envelope[k] === "string" && envelope[k]) return envelope[k] as string;
  return "Qloo returned an error for this comparison";
}
