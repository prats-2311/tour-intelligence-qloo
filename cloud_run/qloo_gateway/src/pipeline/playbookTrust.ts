/** Pure helpers that keep the City Playbook's data trustworthy to a promoter: lift against the city, support-act scale, genre-only chips. */

export const SPONSOR_LIFT_NOTE = "Ranked by how much higher this artist's fans rank the brand than the city overall does.";
export const NO_SUPPORT_COPY = (artist: string) => `Every Qloo match is bigger than ${artist}, so no support pick here.`;
export const SIZE_UNCHECKED_COPY = "Couldn't check act size for this artist.";
export const NO_SIZE_DATA_COPY = "No support pick: Qloo had no size data for these acts.";
export const COMPARE_FAILED_COPY = (n: number) => `No support pick: the shared-taste comparison failed for ${n} ${n === 1 ? "act" : "acts"}.`;
export const HEADLINER_SIZE_UNKNOWN = "headliner popularity unavailable, support acts not size-checked";

const finite = (n: number) => Number.isFinite(n);
interface Scored { entityId: string }
export type WithRank<T> = T & { artistRank?: number; cityRank?: number | null; rankLift?: number };

/** Qloo rescales `affinity` within each response, so affinities from two responses are not comparable: lift is measured in ranks. */
export const CITY_BASELINE_TOP = 20;
export const MAINSTREAM_TOP = 10;

/**
 * Rank lift = (rank in the city baseline, or 21 when absent from its top 20) minus the rank in the artist's list (both 1-based);
 * higher means this artist's fans favour it more than the city does. Sorted by rank lift descending, ties by the artist's own rank.
 * `dropMainstream` removes titles in the city's top 10 and counts them. Without a full baseline (null, or fewer than 20 items) the list keeps Qloo's order
 * with no rank fields.
 */
export function rankLifted<T extends Scored>(items: T[], baseline: Scored[] | null, opts: { dropMainstream?: boolean } = {}): { items: WithRank<T>[]; lifted: boolean; mainstreamDropped: number } {
  const top = (baseline ?? []).slice(0, CITY_BASELINE_TOP);
  // A baseline shorter than the top 20 cannot say an item is "not in the city's top 20", so make no lift claim at all.
  if (top.length < CITY_BASELINE_TOP) return { items, lifted: false, mainstreamDropped: 0 };
  const cityRankOf = new Map<string, number>();
  top.forEach((b, i) => { if (!cityRankOf.has(b.entityId)) cityRankOf.set(b.entityId, i + 1); });
  let mainstreamDropped = 0;
  const out: WithRank<T>[] = [];
  items.forEach((it, i) => {
    const c = cityRankOf.get(it.entityId) ?? null;
    if (opts.dropMainstream && c !== null && c <= MAINSTREAM_TOP) { mainstreamDropped += 1; return; }
    out.push({ ...it, artistRank: i + 1, cityRank: c, rankLift: (c ?? CITY_BASELINE_TOP + 1) - (i + 1) });
  });
  out.sort((x, y) => y.rankLift! - x.rankLift! || x.artistRank! - y.artistRank!);
  return { items: out, lifted: true, mainstreamDropped };
}

/** Support acts must be strictly smaller (Qloo popularity) than the headliner. No popularity on a candidate means it cannot be shown. */
export function smallerThanHeadliner<T extends { popularity: number }>(items: T[], headliner: number | undefined): { kept: T[]; biggerThanHeadliner: number; popularityUnknown: number } {
  if (headliner === undefined || !finite(headliner)) return { kept: items, biggerThanHeadliner: 0, popularityUnknown: 0 };
  let biggerThanHeadliner = 0, popularityUnknown = 0;
  const kept: T[] = [];
  for (const it of items) {
    if (!finite(it.popularity)) popularityUnknown += 1;
    else if (it.popularity >= headliner) biggerThanHeadliner += 1;
    else kept.push(it);
  }
  return { kept, biggerThanHeadliner, popularityUnknown };
}

/** Shared-taste chips are music genres only: never location, keyword or qloo:* tags. */
export function genreTagNames(tags: Array<{ id?: string; name: string }>, max = 3): string[] {
  return tags.filter((t) => typeof t.id === "string" && t.id.startsWith("urn:tag:genre:")).slice(0, max).map((t) => t.name);
}

/** Why a support card is empty, said truthfully. `scaleKept` = candidates left after the size check; `failedCompares` only applies to co-billing. Empty object when the card is not empty for a size reason. */
export function emptySupportCopy(o: { artist: string; headlinerKnown: boolean; shown: number; scaleKept: number; bigger: number; unknown: number; failedCompares?: number }): Record<string, string> {
  if (o.shown > 0) return {};
  if (!o.headlinerKnown) return { emptyCopy: SIZE_UNCHECKED_COPY };
  if (o.scaleKept === 0) {
    if (o.unknown > 0) return { emptyCopy: NO_SIZE_DATA_COPY };
    if (o.bigger > 0) return { emptyCopy: NO_SUPPORT_COPY(o.artist) };
    return {};
  }
  return (o.failedCompares ?? 0) > 0 ? { emptyCopy: COMPARE_FAILED_COPY(o.failedCompares!) } : {};
}
