import { isDoNotBook, isHiddenItem } from "./doNotBook";
import type { PlaybookCard } from "./types";
import { sponsorLiftRows } from "./tourInsights";
import { AGE_BANDS, signedIndex, type AgeBand, type SegmentItem } from "./segments";
import type { SegmentState } from "./segmentStore";

/** Pure builder for "Which brands each age group loves, city by city". No network, no store: callers pass what is already in memory. */
export interface AllFansBrand { name: string; fanRank: number; cityRank: number | null }
export interface CityInput { id: string; name: string; segments: SegmentState; /** The city's all-fans sponsors, best fan rank first, from the playbook already in memory; null when not available. */ allFans: AllFansBrand[] | null }
export interface MatrixCell { band: AgeBand; index: number; brand: string | null; fanRank: number | null; cityRank: number | null; offCityTop20: boolean; /** null: no all-fans list to compare with, so no badge. */ unique: boolean | null; top5: SegmentItem[] }
export type RowState = "idle" | "loading" | "ok" | "no_skew" | "unavailable";
export interface MatrixRow { cityId: string; name: string; state: RowState; timedOut: boolean; cells: Partial<Record<AgeBand, MatrixCell>>; allFansTop: { brand: string; fanRank: number; cityRank: number | null } | null; allFansTop5: string[] | null }
export interface AgeMatrix { columns: AgeBand[]; rows: MatrixRow[]; ranges: Partial<Record<AgeBand, { min: number; max: number }>> }

const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const shown = (it: { name: string }): boolean => !isHiddenItem("sponsors", it as Record<string, unknown>) && !isDoNotBook(it.name);

/** "(+0.78 to +0.91 vs average audience)": the signed index range as Qloo gives it, never a percentage. */
export const indexRangeText = (min: number, max: number): string => (min === max ? `(${signedIndex(min)} vs average audience)` : `(${signedIndex(min)} to ${signedIndex(max)} vs average audience)`);

export function buildAgeMatrix(cities: CityInput[]): AgeMatrix {
  const present = new Set<AgeBand>();
  const ranges: AgeMatrix["ranges"] = {};
  const rows = cities.map((c): MatrixRow => {
    const fans = c.allFans === null ? null : c.allFans.filter(shown).sort((a, b) => a.fanRank - b.fanRank);
    const fans5 = fans ? fans.slice(0, 5).map((f) => fold(f.name)) : null;
    const base = { cityId: c.id, name: c.name, cells: {} as MatrixRow["cells"], allFansTop: fans && fans[0] ? { brand: fans[0].name, fanRank: fans[0].fanRank, cityRank: fans[0].cityRank } : null, allFansTop5: fans ? fans.slice(0, 5).map((f) => f.name) : null };
    const s = c.segments;
    if (s.status !== "done") return { ...base, state: s.status, timedOut: false };
    const d = s.data;
    if (d.status !== "ok") return { ...base, state: d.status, timedOut: d.status === "unavailable" && d.reason === "timeout" };
    for (const b of d.bands) {
      const items = b.status === "ok" ? b.items.filter(shown) : [];
      const top = items[0];
      present.add(b.band);
      const r = ranges[b.band];
      ranges[b.band] = { min: Math.min(r?.min ?? b.index, b.index), max: Math.max(r?.max ?? b.index, b.index) };
      base.cells[b.band] = {
        band: b.band, index: b.index, brand: top?.name ?? null, fanRank: top?.artistRank ?? null, cityRank: top?.cityRank ?? null,
        offCityTop20: !!top && b.lifted && top.cityRank === null,
        unique: top && fans5 ? !fans5.includes(fold(top.name)) : null,
        top5: items.slice(0, 5),
      };
    }
    return { ...base, state: "ok", timedOut: false };
  });
  return { columns: AGE_BANDS.filter((b) => present.has(b)), rows, ranges };
}

/** One computed sentence (two when some city has several groups), or null when no city has both an over-indexed group and an all-fans list to compare with. */
export function matrixSummary(m: AgeMatrix): string | null {
  const cmp = m.rows.flatMap((r) => {
    const bands = AGE_BANDS.filter((b) => r.cells[b]?.brand);
    return r.state === "ok" && r.allFansTop && bands.length ? [{ r, bands }] : [];
  });
  if (cmp.length === 0) return null;
  const differs = (pick: (bs: AgeBand[]) => AgeBand) => cmp.filter(({ r, bands }) => fold(r.cells[pick(bands)]!.brand!) !== fold(r.allFansTop!.brand)).length;
  const line = (who: string, n: number) => `In ${n} of ${cmp.length} ${cmp.length === 1 ? "city" : "cities"}, the ${who} over-indexed group's top brand differs from all fans'.`;
  if (cmp.every(({ bands }) => bands.length === 1)) return line("", differs((bs) => bs[0]!)).replace("the  ", "the ");
  return `${line("oldest", differs((bs) => bs[bs.length - 1]!))} ${line("youngest", differs((bs) => bs[0]!))}`;
}

/** The city's all-fans sponsors from its playbook Sponsors card (already filtered for display), or null when the card is missing or not ok. */
export function allFansFromCard(card: PlaybookCard | undefined): AllFansBrand[] | null {
  if (!card || card.status !== "ok") return null;
  return sponsorLiftRows(card).map((r) => ({ name: r.name, fanRank: r.fanRank, cityRank: r.cityRank }));
}
