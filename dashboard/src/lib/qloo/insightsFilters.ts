import { sortCities } from "./ranking";
import type { ScoredCity, Verdict } from "./types";

export type InsightsFilters = { countries: string[]; verdicts: Verdict[]; minActivation: number; source: "all" | "live" | "cached" };

export const ALL_VERDICTS: Verdict[] = ["play", "hidden_goldmine", "de_risk", "consider", "skip", "insufficient_data"];

export const defaultFilters = (cities: ScoredCity[]): InsightsFilters => ({
  countries: [...new Set(cities.map((c) => c.country))],
  verdicts: [...ALL_VERDICTS],
  minActivation: 0,
  source: "all",
});

export function applyFilters(cities: ScoredCity[], f: InsightsFilters): ScoredCity[] {
  return cities.filter((c) =>
    f.countries.includes(c.country) &&
    f.verdicts.includes(c.verdict) &&
    (f.minActivation === 0 || (c.activation.value ?? -1) >= f.minActivation) &&
    (f.source === "all" || (f.source === "cached") === c.warnings.some((w) => w.kind === "stale")));
}

/** Number of filter groups that differ from the defaults (drives "Filters (n)"). */
export function activeFilterCount(f: InsightsFilters, d: InsightsFilters): number {
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  return (same(f.countries, d.countries) ? 0 : 1) + (same(f.verdicts, d.verdicts) ? 0 : 1) + (f.minActivation === d.minActivation ? 0 : 1) + (f.source === d.source ? 0 : 1);
}

const VERDICT_TEXT: Record<Verdict, string> = {
  play: "Play", hidden_goldmine: "Hidden goldmine", de_risk: "De-risk", consider: "Consider", skip: "Skip", insufficient_data: "Not enough data",
};

const cell = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Boxscore rows (activation desc) as RFC 4180 CSV; null scores are empty cells. */
export function boxscoreCsv(cities: ScoredCity[]): string {
  const header = ["City", "Country", "Sponsor fit", "Local hooks", "Fan concentration", "Venue fit", "Activation", "Verdict"];
  const rows = sortCities(cities, "winnability").sort((a, b) => (b.activation.value ?? -1) - (a.activation.value ?? -1)).map((c) => {
    const k = c.activation.components;
    return [c.name, c.country, k.sponsor_fit, k.local_hooks, k.fan_concentration, k.venue_fit, c.activation.value, VERDICT_TEXT[c.verdict]];
  });
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

export function csvFilename(artist: string | undefined): string {
  const slug = (artist ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug ? `taste-insights-${slug}.csv` : "taste-insights.csv";
}
