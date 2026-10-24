import { haversineKm, type City } from "./cities.js";
import type { HeatPoint } from "./heat.js";

/** The harness sends a city only as a fuzzy location query, so Qloo can resolve it to the wrong place (Ciudad Juarez -> Mexico City). */
export const LOCATION_MIN_POINTS = 3;
export const LOCATION_MAX_MEDIAN_KM = 50;
/** Most query strings tried per city (each is one qloo_where_popular call, cached). */
export const MAX_LOCATION_ATTEMPTS = 3;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** True iff Qloo returned enough in-city heat points and their median distance from the city is within the threshold. Pure. */
export function locationResolved(city: { lat: number; lon: number }, points: HeatPoint[]): boolean {
  if (points.length < LOCATION_MIN_POINTS) return false;
  return median(points.map((p) => haversineKm(city, p))) <= LOCATION_MAX_MEDIAN_KM;
}

const regionNames = (() => {
  try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch { return undefined; }
})();

function countryName(code: string): string | undefined {
  try {
    const n = regionNames?.of(code);
    return n && n !== code && !/^unknown region$/i.test(n) ? n : undefined;
  } catch { return undefined; }
}

const COUNTRY_ALIASES: Record<string, string> = { usa: "US", uk: "GB" };
let codeByName: Map<string, string> | undefined;

/** ISO-2 for a brief region that is a country (English name, accent- and case-insensitive); undefined for a state, a city or anything else. */
export function countryCodeFor(region: string): string | undefined {
  if (!codeByName) {
    codeByName = new Map();
    const A = "A".charCodeAt(0);
    for (let i = 0; i < 26; i += 1) for (let j = 0; j < 26; j += 1) {
      const code = String.fromCharCode(A + i, A + j);
      const n = countryName(code);
      if (n) codeByName.set(fold(n), code);
    }
  }
  const key = fold(region);
  return COUNTRY_ALIASES[key] ?? codeByName.get(key);
}

/**
 * Query strings to try, in order. The first is the original "<name>, <ISO-2>" and must stay byte-identical so cached boards keep serving;
 * the second spells the country out. The bare name is never offered (too ambiguous).
 */
export function locationQueries(city: { name: string; country: string }): string[] {
  const legacy = `${city.name}, ${city.country}`;
  const country = countryName(city.country);
  const out = [legacy];
  if (country) out.push(`${city.name}, ${country}`);
  return [...new Set(out)].slice(0, MAX_LOCATION_ATTEMPTS);
}

export const fold = (v: string): string => v.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().trim().replace(/\s+/g, " ");

/**
 * The city a playbook request means, so its location can always be checked. By id when given; otherwise by accent- and case-insensitive
 * name with the country as ISO-2 or English name. Several matches: the one nearest the given coordinates, else the most populous.
 */
export function findCity(cities: City[], q: { id?: string; name: string; country: string; lat?: number; lon?: number }): City | undefined {
  if (q.id) {
    const byId = cities.find((c) => c.id === q.id);
    if (byId) return byId;
  }
  const name = fold(q.name), country = fold(q.country);
  const matches = cities.filter((c) => fold(c.name) === name && (fold(c.country) === country || fold(countryName(c.country) ?? "\0") === country));
  if (matches.length <= 1) return matches[0];
  if (typeof q.lat === "number" && typeof q.lon === "number") {
    const here = { lat: q.lat, lon: q.lon };
    return [...matches].sort((a, b) => haversineKm(a, here) - haversineKm(b, here))[0];
  }
  return [...matches].sort((a, b) => b.population - a.population)[0];
}
