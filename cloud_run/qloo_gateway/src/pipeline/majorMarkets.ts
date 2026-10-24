import { largestCityOf, type City } from "../geo/cities.js";
import { countryCodeFor } from "../geo/location.js";

/** Most major-market seeds on one board (each costs a location lookup plus about 6 Qloo calls). */
export const MAX_MAJOR_MARKETS = 3;

/**
 * The most populous city of each brief region that is a country (a state or a city region gets none), one per country, in brief order,
 * at most MAX_MAJOR_MARKETS. Generic: never chosen per artist.
 */
export function majorMarkets(regions: string[], cities: City[]): City[] {
  const out: City[] = [];
  for (const region of regions) {
    if (out.length >= MAX_MAJOR_MARKETS) break;
    const iso = countryCodeFor(region);
    const city = iso ? largestCityOf(cities, iso) : undefined;
    if (city && !out.some((c) => c.id === city.id)) out.push(city);
  }
  return out;
}
