import { effectiveRegions } from "./routing";
import type { ScoredCity, StrategistContext, TourBrief } from "./types";

/**
 * The context the strategist receives for a board: artist, regions (a pasted run's are its cities' countries), and the first 20
 * scored cities with their three scores. TourBoardProvider uses this; `scripts/record-showcase.mjs` mirrors it for recording
 * (it is plain Node and cannot import TS), and `recordQuestions.test.ts` pins the two together. Change both or neither.
 */
export function buildStrategistContext(artist: { name: string; entityId: string } | undefined, brief: Pick<TourBrief, "regions" | "cities"> | undefined, cities: ScoredCity[]): StrategistContext {
  const ctx: StrategistContext = {};
  if (artist) ctx.artist = { name: artist.name, entityId: artist.entityId };
  if (brief) ctx.regions = effectiveRegions(brief, cities);
  if (cities.length > 0) {
    ctx.cities = cities.slice(0, 20).map((c) => ({
      id: c.id, name: c.name, country: c.country, verdict: c.verdict,
      fanHeat: c.fanHeat?.value ?? null, activation: c.activation?.value ?? null, winnability: c.winnability?.value ?? null,
    }));
  }
  return ctx;
}
