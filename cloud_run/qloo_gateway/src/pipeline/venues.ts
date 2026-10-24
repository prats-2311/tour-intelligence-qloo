import { fold } from "../geo/location.js";

/** Music-venue place categories (live_music_venue first). night_club is deliberately absent: it returns strip clubs and the adult exclude_tags had no effect. */
export const VENUE_CATEGORY_TAGS = [
  "urn:tag:category:place:live_music_venue",
  "urn:tag:category:place:concert_hall",
  "urn:tag:category:place:amphitheater",
  "urn:tag:category:place:performing_arts_theater",
] as const;

/** Most same-city venues sent to qloo_rank. */
export const VENUE_RANK_MAX = 10;

export const venueArgs = (artistId: string, where: string) =>
  ({ target_type: "place", signals: [artistId], filter_location: where, include_tags: [...VENUE_CATEGORY_TAGS], include_tags_operator: "union", limit: 20 });

export const noVenuesCopy = (city: string) => `Qloo lists no music venues in ${city} for this artist`;

/** Folded name without a trailing "city" word, so Qloo's "New York" equals the list's "New York City" (the country code must match too). */
const key = (name: string): string => { const f = fold(name); const k = f.replace(/ city$/, ""); return k === "" ? f : k; };

interface Placed { geocode?: { city?: string; countryCode?: string } }

/**
 * Keep a place only if Qloo's geocode puts it in this city and country (accent- and case-insensitive; the resolved query's city
 * name also counts). Qloo's order is kept; places without a geocode are dropped, never guessed. At most VENUE_RANK_MAX.
 */
export function sameCityVenues<T extends Placed>(places: T[], city: { name: string; country: string }, locationQuery: string): T[] {
  const names = new Set([key(city.name), key(locationQuery.split(",")[0] ?? "")].filter((n) => n !== ""));
  const country = fold(city.country);
  return places.filter((p) => p.geocode?.city !== undefined && p.geocode.countryCode !== undefined
    && fold(p.geocode.countryCode) === country && names.has(key(p.geocode.city))).slice(0, VENUE_RANK_MAX);
}
