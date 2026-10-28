import { countryLabel } from "./labels";
import type { RoutingCity, ScoredCity, TourBrief } from "./types";

/** "Paste your cities": most cities the board will score from a pasted routing (the gateway enforces the same cap). */
export const MAX_PASTED_CITIES = 8;
export const ROUTING_CAP_NOTE = `Up to ${MAX_PASTED_CITIES} cities — the first ${MAX_PASTED_CITIES} will be used.`;
/** Tag on a board row the promoter pasted (candidateSource "your_routing"); styled like "Major market". */
export const ROUTING_LABEL = "Your routing";
export const ROUTING_LOW_HEAT_NOTE = "Low fan heat here, by Qloo's data.";
export const ROUTING_LABEL_NOTE = "You pasted this city, so it is scored whether or not it is in Qloo's top fan hotspots.";
export const routingUnmatchedText = (names: string[]): string => `Not in our city list: ${names.join(", ")}. Check the spelling or add the country.`;

const fold = (v: string): string => v.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

const codeNames = (() => {
  const out = new Set<string>();
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "region" });
    const A = "A".charCodeAt(0);
    for (let i = 0; i < 26; i += 1) for (let j = 0; j < 26; j += 1) {
      const code = String.fromCharCode(A + i, A + j);
      const n = dn.of(code);
      if (n && n !== code && !/^unknown region$/i.test(n)) { out.add(code.toLowerCase()); out.add(fold(n)); }
    }
  } catch { /* no Intl region names: only the aliases below are recognised */ }
  out.add("usa"); out.add("uk");
  return out;
})();
/** True for an ISO-2 code or an English country name (accent and case insensitive), plus USA and UK. */
export const isCountryToken = (s: string): boolean => codeNames.has(fold(s));

/**
 * One city per line, "City" or "City, Country" (the part after the last comma is the country only when it is a country name or ISO-2 code). Trims, drops blank lines, de-duplicates
 * (accent and case insensitive), and keeps the first MAX_PASTED_CITIES. `capped` is true when more were pasted.
 */
export function parsePastedCities(text: string): { cities: RoutingCity[]; capped: boolean } {
  const seen = new Set<string>();
  const all: RoutingCity[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // The part after the last comma is a country only if it is one; otherwise it belongs to the name ("Washington, D.C.").
    const i = line.lastIndexOf(",");
    const tail = i === -1 ? "" : line.slice(i + 1).trim();
    const hasCountry = tail !== "" && isCountryToken(tail);
    const name = (hasCountry ? line.slice(0, i) : line).trim();
    const country = hasCountry ? tail : "";
    if (!name) continue;
    const key = `${fold(name)}|${fold(country)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(country ? { name, country } : { name });
  }
  return { cities: all.slice(0, MAX_PASTED_CITIES), capped: all.length > MAX_PASTED_CITIES };
}

/** "Portland, US; Austin, US" for the record command and notes. */
export const routingLabel = (c: RoutingCity): string => (c.country ? `${c.name}, ${c.country}` : c.name);

/** Distinct English country names of the cities (ISO-2 in, names out), in order. */
export const distinctCountries = (cities: Array<Pick<ScoredCity, "country">>): string[] => [...new Set(cities.map((c) => countryLabel(c.country)))];

/** Regions to show and send as context: a pasted run has none of its own, so they are the countries of its scored cities. */
export const effectiveRegions = (brief: Pick<TourBrief, "regions" | "cities">, cities: Array<Pick<ScoredCity, "country">>): string[] =>
  brief.cities?.length ? distinctCountries(cities) : brief.regions;
