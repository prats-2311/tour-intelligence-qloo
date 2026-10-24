import type { City } from "../geo/cities.js";
import { countryCodeFor, countryName, findCity, fold } from "../geo/location.js";

/** Most cities in a pasted routing. */
export const MAX_ROUTING_CITIES = 8;
/** Most countries looked up for regional fan heat in pasted mode. */
export const MAX_ROUTING_REGIONS = 3;

export interface RoutingEntry { name: string; country?: string }
export interface ResolvedRouting { matched: City[]; unmatched: string[] }

/**
 * Resolve a pasted routing against the city list. An explicit country (ISO-2, English name, or "USA"/"UK") is used as given. Without one,
 * the brief's regions that are countries are tried in order; with none of those, the name alone, only if exactly one city has it.
 * Duplicates collapse; names that match nothing (or are ambiguous) come back as pasted, "Name" or "Name, Country". Pure.
 */
export function resolveRouting(entries: RoutingEntry[], regions: string[], cities: City[]): ResolvedRouting {
  const matched: City[] = [];
  const unmatched: string[] = [];
  const seenIn = new Set<string>();
  const seenOut = new Set<string>();
  const regionCodes = regions.map(countryCodeFor).filter((c): c is string => !!c);
  for (const entry of entries.slice(0, MAX_ROUTING_CITIES)) {
    const name = entry.name.trim();
    const country = entry.country?.trim();
    const found = ((): City | undefined => {
      if (country) {
        const code = countryCodeFor(country);
        return findCity(cities, { name, country }) ?? (code ? findCity(cities, { name, country: code }) : undefined);
      }
      for (const code of regionCodes) {
        const hit = findCity(cities, { name, country: code });
        if (hit) return hit;
      }
      if (regionCodes.length > 0) return undefined;
      const same = cities.filter((c) => fold(c.name) === fold(name));
      return same.length === 1 ? same[0] : undefined;
    })();
    if (found) {
      if (!seenIn.has(found.id)) { seenIn.add(found.id); matched.push(found); }
    } else {
      const label = country ? `${name}, ${country}` : name;
      if (!seenOut.has(fold(label))) { seenOut.add(fold(label)); unmatched.push(label); }
    }
  }
  return { matched, unmatched };
}

/** The distinct countries of the matched cities, as the English names the heat lookup uses, in order, at most MAX_ROUTING_REGIONS. */
export function routingRegions(matched: City[]): string[] {
  const out: string[] = [];
  for (const c of matched) {
    const label = countryName(c.country) ?? c.country;
    if (!out.includes(label)) out.push(label);
    if (out.length >= MAX_ROUTING_REGIONS) break;
  }
  return out;
}
