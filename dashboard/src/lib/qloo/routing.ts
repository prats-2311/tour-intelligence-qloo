import type { RoutingCity } from "./types";

/** "Paste your cities": most cities the board will score from a pasted routing (the gateway enforces the same cap). */
export const MAX_PASTED_CITIES = 8;
export const ROUTING_CAP_NOTE = `Up to ${MAX_PASTED_CITIES} cities — the first ${MAX_PASTED_CITIES} will be used.`;
/** Tag on a board row the promoter pasted (candidateSource "your_routing"); styled like "Major market". */
export const ROUTING_LABEL = "Your routing";
export const ROUTING_LABEL_NOTE = "You pasted this city, so it is scored whether or not it is in Qloo's top fan hotspots.";
export const routingUnmatchedText = (names: string[]): string => `Not in our city list: ${names.join(", ")}. Check the spelling or add the country.`;

const fold = (v: string): string => v.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * One city per line, "City" or "City, Country" (split at the last comma). Trims, drops blank lines, de-duplicates
 * (accent and case insensitive), and keeps the first MAX_PASTED_CITIES. `capped` is true when more were pasted.
 */
export function parsePastedCities(text: string): { cities: RoutingCity[]; capped: boolean } {
  const seen = new Set<string>();
  const all: RoutingCity[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const i = line.lastIndexOf(",");
    const name = (i === -1 ? line : line.slice(0, i)).trim();
    const country = i === -1 ? "" : line.slice(i + 1).trim();
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
