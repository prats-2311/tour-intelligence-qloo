import { SAMPLE_BRIEF, SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { showcaseAvailable, showcaseBrief, showcaseCities, showcaseParam } from "@/lib/qloo/showcase";
import type { ScoredCity } from "@/lib/qloo/types";

type Input = { stateArtist?: string; stateCities: Array<Pick<ScoredCity, "id" | "name">>; search: string; cityId: string | null };

/** Artist and city names for the breadcrumbs: the run in the board state first; with no run, the recording (?showcase / a bare route) or the invented sample (?sample). */
export function resolveTourNames({ stateArtist, stateCities, search, cityId }: Input): { artist: string | null; cityName: string | null } {
  const q = new URLSearchParams(search);
  const variant = showcaseParam(q.get("showcase")) === "routing" ? "routing" : "main";
  const sample = q.has("sample") && !q.has("showcase");
  const fallbackCities: Array<Pick<ScoredCity, "id" | "name">> = sample ? SAMPLE_CITIES : showcaseAvailable() ? showcaseCities(undefined, variant) : SAMPLE_CITIES;
  const fallbackArtist = sample ? SAMPLE_BRIEF.artist : showcaseAvailable() ? showcaseBrief(variant).artist : null;
  const artist = stateArtist || fallbackArtist || null;
  const cityName = cityId ? (stateCities.find((c) => c.id === cityId) ?? fallbackCities.find((c) => c.id === cityId))?.name ?? null : null;
  return { artist, cityName };
}
