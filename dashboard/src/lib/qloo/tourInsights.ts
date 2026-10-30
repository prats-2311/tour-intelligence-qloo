import { STATUSES, type CityStatus, type Snapshot } from "@/lib/collab/types";
import { isDoNotBook, isHiddenItem } from "./doNotBook";
import { VERDICT_LABEL } from "./labels";
import { ALL_VERDICTS } from "./insightsFilters";
import { mergeZonesByLabel, zoneDisplayLabel } from "./zones";
import type { PlaybookCard, ScoredCity, Thresholds, Verdict } from "./types";

/** Verdict labels as the Insights page words them ("Under the radar" is the Hidden goldmine verdict, as on the landing legend). */
export const INSIGHTS_VERDICT_LABEL: Record<Verdict, string> = { ...VERDICT_LABEL, hidden_goldmine: "Under the radar" };

export type SortKey = "winnability" | "fanHeat" | "activation" | "name";
export const SORT_KEYS: readonly SortKey[] = ["winnability", "fanHeat", "activation", "name"];
export const SORT_LABEL: Record<SortKey, string> = { winnability: "Winnability", fanHeat: "Fan heat", activation: "Activation", name: "Name" };

export interface TourFilters { countries: string[]; verdicts: Verdict[]; statuses: CityStatus[]; minWinnability: number; sort: SortKey }
export const defaultTourFilters = (): TourFilters => ({ countries: [], verdicts: [], statuses: [], minWinnability: 0, sort: "winnability" });

const list = (v: string | null): string[] => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** Filters from the URL query; anything unknown is dropped, the slider is clamped to 0-100. */
export function parseTourFilters(p: URLSearchParams): TourFilters {
  const min = Number(p.get("minWin"));
  const sort = p.get("sort");
  return {
    countries: list(p.get("country")).map((c) => c.toUpperCase()),
    verdicts: list(p.get("verdict")).filter((v): v is Verdict => (ALL_VERDICTS as string[]).includes(v)),
    statuses: list(p.get("team")).filter((v): v is CityStatus => (STATUSES as readonly string[]).includes(v)),
    minWinnability: Number.isFinite(min) ? Math.min(100, Math.max(0, Math.round(min))) : 0,
    sort: SORT_KEYS.includes(sort as SortKey) ? (sort as SortKey) : "winnability",
  };
}

/** The query with the filters written in (defaults omitted); every other param (showcase, sample, ws, city) is kept. */
export function writeTourFilters(base: URLSearchParams, f: TourFilters): URLSearchParams {
  const q = new URLSearchParams(base);
  const set = (k: string, v: string | null) => (v ? q.set(k, v) : q.delete(k));
  set("country", f.countries.join(",") || null);
  set("verdict", f.verdicts.join(",") || null);
  set("team", f.statuses.join(",") || null);
  set("minWin", f.minWinnability > 0 ? String(f.minWinnability) : null);
  set("sort", f.sort !== "winnability" ? f.sort : null);
  return q;
}

/** True when a filter (not the sort order) narrows the cities. */
export const hasActiveFilters = (f: TourFilters): boolean => f.countries.length > 0 || f.verdicts.length > 0 || f.statuses.length > 0 || f.minWinnability > 0;

const val = (x: { value: number | null }): number => (x.value === null || !Number.isFinite(x.value) ? Number.NEGATIVE_INFINITY : x.value);
const desc = (a: number, b: number): number => (a === b ? 0 : b > a ? 1 : -1);

/** Filter, then sort. A city with no team status counts as Considering (as the playbook status picker shows it). */
export function applyTourFilters(cities: ScoredCity[], f: TourFilters, statusOf: (cityId: string) => CityStatus | null): ScoredCity[] {
  const kept = cities.filter((c) =>
    (f.countries.length === 0 || f.countries.includes(c.country)) &&
    (f.verdicts.length === 0 || f.verdicts.includes(c.verdict)) &&
    (f.statuses.length === 0 || f.statuses.includes(statusOf(c.id) ?? "considering")) &&
    (f.minWinnability === 0 || (c.winnability.value !== null && c.winnability.value >= f.minWinnability)));
  const key = (c: ScoredCity): number => val(f.sort === "fanHeat" ? c.fanHeat : f.sort === "activation" ? c.activation : c.winnability);
  return kept.sort((a, b) => (f.sort === "name" ? a.name.localeCompare(b.name) : desc(key(a), key(b)) || a.name.localeCompare(b.name)));
}

/** The most winnable city (the default for the city pickers). */
export function topCityId(cities: ScoredCity[]): string | null {
  return [...cities].sort((a, b) => desc(val(a.winnability), val(b.winnability)) || a.name.localeCompare(b.name))[0]?.id ?? null;
}

export interface CityScoreRow { id: string; name: string; country: string; verdict: Verdict; fanHeat: number | null; activation: number | null; winnability: number | null }
const nv = (x: { value: number | null }): number | null => (x.value === null || !Number.isFinite(x.value) ? null : x.value);
export const cityScoreRows = (cities: ScoredCity[]): CityScoreRow[] =>
  cities.map((c) => ({ id: c.id, name: c.name, country: c.country, verdict: c.verdict, fanHeat: nv(c.fanHeat), activation: nv(c.activation), winnability: nv(c.winnability) }));

export interface QuadrantPoint { id: string; name: string; verdict: Verdict; x: number; y: number; winnability: number | null }
/** x = fan heat, y = activation; a city missing either score has no position and is counted in `skipped`. */
export function buildQuadrant(cities: ScoredCity[], _t: Thresholds): { points: QuadrantPoint[]; skipped: number } {
  const points = cities.flatMap((c) => {
    const x = nv(c.fanHeat), y = nv(c.activation);
    return x === null || y === null ? [] : [{ id: c.id, name: c.name, verdict: c.verdict, x, y, winnability: nv(c.winnability) }];
  });
  return { points, skipped: cities.length - points.length };
}

export interface GuideLine { at: number; label: string }
/** The guide lines drawn on the scatter, every value read from the run's verdict thresholds (the same ones "Why this score?" lists). */
export function verdictLines(t: Thresholds): { vertical: GuideLine[]; horizontal: GuideLine[] } {
  return {
    vertical: [{ at: t.goldmineFanMin, label: `fan ${t.goldmineFanMin}` }, { at: t.playFan, label: `fan ${t.playFan}` }],
    horizontal: [{ at: t.deRiskAct, label: `activation ${t.deRiskAct}` }, { at: t.playAct, label: `activation ${t.playAct}` }, { at: t.goldmineAct, label: `activation ${t.goldmineAct}` }],
  };
}

export const SHOWN_VERDICTS: Verdict[] = ["play", "hidden_goldmine", "de_risk", "consider", "skip", "insufficient_data"];
export const verdictCounts = (cities: ScoredCity[]): Record<Verdict, number> => {
  const out = Object.fromEntries(SHOWN_VERDICTS.map((v) => [v, 0])) as Record<Verdict, number>;
  for (const c of cities) out[c.verdict] += 1;
  return out;
};
export interface CountryMix { country: string; total: number; verdicts: Record<Verdict, number> }
export function countByCountry(cities: ScoredCity[]): CountryMix[] {
  const m = new Map<string, ScoredCity[]>();
  for (const c of cities) m.set(c.country, [...(m.get(c.country) ?? []), c]);
  return [...m.entries()].map(([country, cs]) => ({ country, total: cs.length, verdicts: verdictCounts(cs) })).sort((a, b) => b.total - a.total || a.country.localeCompare(b.country));
}

export const SPONSOR_LIFT_CAPTION = "Lift is rank-based: a brand fans rank high that the city's own chart ranks lower (or leaves out of its top 20) is a stronger local pitch. Ranks come from the recorded playbook; no amounts are estimated.";
export const ZONE_SHARE_LABEL = "share of in-city fan heat";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
export interface SponsorLiftRow { name: string; fanRank: number; cityRank: number | null; cityText: string }
/** Top 10 sponsors by fan rank. Hidden items (non-sponsor organisations, the do-not-book list) are removed first; brands without a fan rank have no place on a rank chart. */
export function sponsorLiftRows(card: PlaybookCard | undefined): SponsorLiftRow[] {
  if (!card || card.status !== "ok") return [];
  return card.items
    .filter((it) => !isHiddenItem("sponsors", it) && !isDoNotBook(it.name))
    .flatMap((it) => { const fanRank = num(it.artistRank); return fanRank === null || !str(it.name) ? [] : [{ name: str(it.name), fanRank, cityRank: num(it.cityRank) }]; })
    .sort((a, b) => a.fanRank - b.fanRank)
    .slice(0, 10)
    .map((r) => ({ ...r, cityText: r.cityRank === null ? "Not in the city's top 20" : `City #${r.cityRank}` }));
}

export interface ZoneShareRow { label: string; share: number }
export const zoneShareRows = (city: ScoredCity): ZoneShareRow[] =>
  mergeZonesByLabel(city.zones.filter((z) => Number.isFinite(z.share))).map((z) => ({ label: zoneDisplayLabel(z.label, city.name), share: Math.max(0, Math.min(1, z.share)) }));

type StatusSnap = Pick<Snapshot, "statuses" | "threads">;
export function statusCounts(cities: ScoredCity[], snap: StatusSnap): Record<CityStatus, number> {
  const out = { considering: 0, confirmed: 0, on_hold: 0, dropped: 0 } as Record<CityStatus, number>;
  for (const c of cities) out[snap.statuses[c.id]?.status ?? "considering"] += 1;
  return out;
}

export interface OpenThreadRow { cityId: string; name: string; threads: number; messages: number }
/** Unresolved, non-empty threads (the city's own and its cards') per shown city. */
export function openThreadsByCity(cities: ScoredCity[], snap: StatusSnap): OpenThreadRow[] {
  const rows: OpenThreadRow[] = [];
  for (const c of cities) {
    const open = Object.entries(snap.threads).filter(([k, t]) => !t.resolved && t.messages.length > 0 && (k === `city:${c.id}` || k.startsWith(`card:${c.id}:`)));
    if (open.length > 0) rows.push({ cityId: c.id, name: c.name, threads: open.length, messages: open.reduce((n, [, t]) => n + t.messages.length, 0) });
  }
  return rows;
}
