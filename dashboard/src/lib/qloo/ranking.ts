import type { ScoredCity, Verdict } from "./types";

const v = (x: { value: number | null }) => (x.value === null ? Number.NEGATIVE_INFINITY : x.value);
// -Infinity - -Infinity is NaN, so compare explicitly: equal (incl. both null) falls through to the next key.
const desc = (a: number, b: number) => (a === b ? 0 : b > a ? 1 : -1);

export function sortCities(cities: ScoredCity[], mode: "winnability" | "density"): ScoredCity[] {
  return [...cities].sort((a, b) =>
    mode === "density"
      ? desc(v(a.fanHeat), v(b.fanHeat)) || a.name.localeCompare(b.name)
      : desc(v(a.winnability), v(b.winnability)) ||
        (a.winnability.value === null ? 0 : desc(v(a.activation), v(b.activation))) ||
        a.name.localeCompare(b.name));
}

export function summarize(cities: ScoredCity[]): Record<Verdict, number> {
  const out: Record<Verdict, number> = { play: 0, hidden_goldmine: 0, de_risk: 0, consider: 0, skip: 0, insufficient_data: 0 };
  for (const c of cities) out[c.verdict] += 1;
  return out;
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

export function defaultShortlist(cities: ScoredCity[], maxStops: number): string[] {
  return cities
    .filter((c) => c.verdict === "play" || c.verdict === "hidden_goldmine")
    .sort((a, b) => (b.winnability.value ?? -1) - (a.winnability.value ?? -1) || (b.activation.value ?? -1) - (a.activation.value ?? -1))
    .slice(0, Math.max(0, maxStops))
    .map((c) => c.id);
}
