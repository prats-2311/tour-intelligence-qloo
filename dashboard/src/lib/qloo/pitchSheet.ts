import { NOT_IN_CITY_TOP_20, fit, pct } from "@/components/playbook/format";
import { isDoNotBook, mentionsDoNotBook, applyDoNotBook } from "./doNotBook";
import { firstOkItem } from "./playbookFacts";
import { isNonSponsor } from "./nonSponsors";
import { BAND_LABEL, displayItems, showsUnder21Note, signedIndex, UNDER_21_NOTE, type SponsorSegments } from "./segments";
import type { PlaybookCard, ThisWeek } from "./types";
import { zoneDisplayLabel } from "./zones";

/** Everything the sheet is assembled from: data already in the app for one city. Nothing here is fetched. */
export interface PitchInput {
  brand: string;
  artist: string;
  city: { id: string; name: string; country: string };
  cards: PlaybookCard[];
  source: "live" | "showcase" | "sample";
  /** ISO timestamp of the recording (showcase only). */
  recordedAt?: string | null;
  today: Date;
  /** Age bands already loaded in the session store, or null/absent. The sheet never loads them. */
  segments?: SponsorSegments | null;
  week?: ThisWeek;
}

export const UNAVAILABLE_MESSAGE = "This name isn't available for a pitch sheet.";
export const PREPARED_WITH = "Prepared with Tour Intelligence × Qloo";

export const SEGMENTS_MISSING = "Open 'By age group' on the playbook to add the age breakdown.";
export const SEGMENTS_NONE = "Not in the top 10 of any age group.";
export type PitchSegments = { state: "bands"; lines: string[]; note: string | null } | { state: "none" | "missing"; message: string };
export interface PitchWeekItem { text: string; date: string | null; links: Array<{ n: number; href: string }> }
export interface PitchSheetOk {
  status: "ok"; title: string; date: string; preparedWith: string; why: string;
  segments: PitchSegments;
  zones: Array<{ label: string; share: string }>;
  room: { name: string; fit: string } | null;
  opener: string | null;
  week: PitchWeekItem[];
}
export type PitchSheet = PitchSheetOk | { status: "unavailable"; message: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayText = (d: Date): string => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const weekDay = (iso: string | null): string | null => {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  const mon = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && mon ? `${Number(m[3])} ${mon}` : null;
};
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const unavailable = (): PitchSheet => ({ status: "unavailable", message: UNAVAILABLE_MESSAGE });

export function buildPitchSheet(input: PitchInput): PitchSheet {
  const { brand, artist, city } = input;
  if (isDoNotBook(brand) || mentionsDoNotBook(brand) || isNonSponsor(brand)) return unavailable();
  const sponsors = input.cards.find((c) => c.kind === "sponsors" && c.status === "ok");
  const items = sponsors ? applyDoNotBook(sponsors).card.items : [];
  const at = items.findIndex((it) => typeof it.name === "string" && fold(it.name) === fold(brand));
  if (at < 0) return unavailable();
  const item = items[at]!;
  const name = item.name as string;
  const rank = num(item.artistRank) ?? at + 1;
  const cityRank = num(item.artistRank) === null ? undefined : num(item.cityRank);
  const cityClause = cityRank === undefined ? "" : cityRank === null ? `; it is ${NOT_IN_CITY_TOP_20}` : `; it is #${cityRank} for the city overall`;
  return {
    status: "ok",
    title: `${name} × ${artist} — ${city.name}`,
    date: dayText(input.today),
    preparedWith: PREPARED_WITH,
    why: `${artist}'s fans rank ${name} #${rank} in ${city.name}${cityClause}.`,
    segments: segmentsFor(name, city.country, input.segments),
    zones: zonesOf(input.cards, city.name),
    room: roomOf(input.cards),
    opener: openerOf(input.cards),
    week: weekOf(input.week),
  };
}

function segmentsFor(brand: string, country: string, data: SponsorSegments | null | undefined): PitchSegments {
  if (!data || data.status !== "ok" || data.bands.length === 0) return { state: "missing", message: SEGMENTS_MISSING };
  const hits = data.bands.flatMap((b) => {
    if (b.status !== "ok") return [];
    const it = displayItems(b).items.find((x) => fold(x.name) === fold(brand) && x.artistRank <= 10);
    return it ? [{ band: b, rank: it.artistRank }] : [];
  });
  if (hits.length === 0) return { state: "none", message: SEGMENTS_NONE };
  return {
    state: "bands",
    lines: hits.map((h) => `Aged ${BAND_LABEL[h.band.band]}: #${h.rank} in this band, index ${signedIndex(h.band.index)} vs the average audience, not a share.`),
    note: hits.some((h) => showsUnder21Note(country, h.band.band)) ? UNDER_21_NOTE : null,
  };
}

function zonesOf(cards: PlaybookCard[], city: string): Array<{ label: string; share: string }> {
  const card = cards.find((c) => c.kind === "promo_zones" && c.status === "ok");
  const zones = (card?.items ?? []).flatMap((it) => (typeof it.label === "string" && it.label !== "" && num(it.share) !== null ? [{ label: it.label, share: num(it.share)! }] : []));
  return zones.sort((a, b) => b.share - a.share).slice(0, 3).map((z) => ({ label: zoneDisplayLabel(z.label, city), share: pct(z.share) }));
}

function roomOf(cards: PlaybookCard[]): { name: string; fit: string } | null {
  const it = firstOkItem(cards, "venue_fit");
  return it && typeof it.name === "string" && it.name !== "" ? { name: it.name, fit: fit(it.affinity) } : null;
}

function openerOf(cards: PlaybookCard[]): string | null {
  const it = firstOkItem(cards, "co_billing");
  return it && typeof it.name === "string" && it.name !== "" ? it.name : null;
}

function weekOf(week: ThisWeek | undefined): PitchWeekItem[] {
  if (!week || week.status !== "ok" || !week.summarised) return [];
  const url = (id: string) => week.citations.find((c) => c.id === id)?.url;
  return week.items.map((it) => ({
    text: it.text, date: weekDay(it.date),
    links: it.citations.map((id) => url(id)).filter((h): h is string => !!h).map((href, i) => ({ n: i + 1, href })),
  }));
}
