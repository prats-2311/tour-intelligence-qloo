/** Pure helpers that keep the City Playbook's data trustworthy to a promoter: lift against the city, support-act scale, genre-only chips. */

export const SPONSOR_LIFT_NOTE = "Ranked by how much more this artist's fans like the brand than the city overall.";
export const NO_SUPPORT_COPY = (artist: string) => `Every Qloo match is bigger than ${artist}, so no support pick here.`;
export const HEADLINER_SIZE_UNKNOWN = "headliner popularity unavailable, support acts not size-checked";

interface Scored { entityId: string; affinity: number }
export type WithLift<T> = T & { lift?: number; baselineAffinity?: number; baselineMissing?: boolean };

const finite = (n: number) => Number.isFinite(n);

/**
 * Lift = the artist's affinity minus the city baseline's affinity for the same entity. An entity missing from the baseline list takes
 * the baseline list's minimum affinity (and is flagged). Sorted by lift descending, ties by affinity; entities with no affinity go last.
 * Without a usable baseline the list is returned in Qloo's order with no lift fields.
 */
export function liftRanked<T extends Scored>(items: T[], baseline: Scored[] | null): { items: WithLift<T>[]; lifted: boolean } {
  const known = (baseline ?? []).filter((b) => finite(b.affinity));
  if (known.length === 0) return { items, lifted: false };
  const byId = new Map(known.map((b) => [b.entityId, b.affinity]));
  const floor = Math.min(...known.map((b) => b.affinity));
  const out = items.map((it): WithLift<T> => {
    if (!finite(it.affinity)) return it;
    const own = byId.get(it.entityId);
    const baselineAffinity = own ?? floor;
    return { ...it, lift: it.affinity - baselineAffinity, baselineAffinity, baselineMissing: own === undefined };
  });
  const lift = (x: WithLift<T>) => x.lift ?? Number.NEGATIVE_INFINITY;
  const aff = (x: WithLift<T>) => (finite(x.affinity) ? x.affinity : Number.NEGATIVE_INFINITY);
  return { items: out.map((x, i) => ({ x, i })).sort((a, b) => lift(b.x) - lift(a.x) || aff(b.x) - aff(a.x) || a.i - b.i).map((e) => e.x), lifted: true };
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
