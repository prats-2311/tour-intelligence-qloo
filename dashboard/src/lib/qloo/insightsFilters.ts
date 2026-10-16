import { VERDICT_LABEL } from "./labels";
import { sortCities } from "./ranking";
import type { ScoredCity, Verdict } from "./types";

/** Exclusion model: anything not excluded is shown, so cities/countries arriving mid-stream are included by default. */
export type InsightsFilters = { excludedCountries: string[]; excludedVerdicts: Verdict[]; minActivation: number; source: "all" | "fresh" | "stale" };

export const ALL_VERDICTS: Verdict[] = ["play", "hidden_goldmine", "de_risk", "consider", "skip", "insufficient_data"];

export const defaultFilters = (): InsightsFilters => ({ excludedCountries: [], excludedVerdicts: [], minActivation: 0, source: "all" });

export function applyFilters(cities: ScoredCity[], f: InsightsFilters): ScoredCity[] {
  return cities.filter((c) =>
    !f.excludedCountries.includes(c.country) &&
    !f.excludedVerdicts.includes(c.verdict) &&
    (f.minActivation === 0 || (c.activation.value ?? -1) >= f.minActivation) &&
    (f.source === "all" || (f.source === "stale") === c.warnings.some((w) => w.kind === "stale")));
}

/** Number of filter groups that differ from the defaults (drives "Filters (n)"). */
export function activeFilterCount(f: InsightsFilters): number {
  return (f.excludedCountries.length > 0 ? 1 : 0) + (f.excludedVerdicts.length > 0 ? 1 : 0) + (f.minActivation > 0 ? 1 : 0) + (f.source !== "all" ? 1 : 0);
}

/** Activation high to low, null activation last. Shared by the boxscore and the CSV. */
export const byActivation = (a: ScoredCity, b: ScoredCity): number => (b.activation.value ?? -1) - (a.activation.value ?? -1);

const cell = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined) return "";
  // Text cells that a spreadsheet could read as a formula get a leading apostrophe.
  const s = typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Boxscore rows (activation desc) as RFC 4180 CSV; null scores are empty cells. */
export function boxscoreCsv(cities: ScoredCity[]): string {
  const header = ["City", "Country", "Sponsor fit", "Local hooks", "Fan concentration", "Venue fit", "Activation", "Verdict"];
  const rows = sortCities(cities, "winnability").sort(byActivation).map((c) => {
    const k = c.activation.components;
    return [c.name, c.country, k.sponsor_fit, k.local_hooks, k.fan_concentration, k.venue_fit, c.activation.value, VERDICT_LABEL[c.verdict]];
  });
  return "\uFEFF" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

export function csvFilename(artist: string | undefined): string {
  const slug = (artist ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug ? `taste-insights-${slug}.csv` : "taste-insights.csv";
}
