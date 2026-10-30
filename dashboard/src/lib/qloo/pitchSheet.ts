import { NOT_IN_CITY_TOP_20, fit, pct } from "@/components/playbook/format";
import type { Snapshot } from "@/lib/collab/types";
import { isDoNotBook, mentionsDoNotBook, applyDoNotBook, visibleClaimTotals } from "./doNotBook";
import { INTEGRITY_LINE } from "./labels";
import { firstOkItem } from "./playbookFacts";
import { isNonSponsor } from "./nonSponsors";
import { BAND_LABEL, displayItems, showsUnder21Note, signedIndex, UNDER_21_NOTE, type SponsorSegments } from "./segments";
import type { Narrative, PlaybookCard, ThisWeek } from "./types";
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
  narrative?: Narrative;
  /** The team workspace snapshot already held by the page, if any. */
  snapshot?: Snapshot | null;
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
  activation: { label: "Suggestion"; text: string };
  /** "N verified · M removed" for the Sponsors card, or null when no checked narrative is available. */
  claims: string | null;
  evidence: string;
  team: string | null;
}
export const DRAFT_FOOTER = "Draft for discussion — not an offer or agreement.";
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
    activation: { label: "Suggestion", text: activationText(name, roomOf(input.cards)?.name, zonesOf(input.cards, city.name)[0]?.label) },
    claims: claimsOf(input.narrative),
    evidence: evidenceOf(input),
    team: teamLine(name, city.id, input.snapshot),
  };
}

/** Fixed template, no model: every clause comes from the city's own data and is dropped when that data is missing. */
export function activationText(brand: string, room?: string, zone?: string): string {
  return `${brand} presale and co-branded night${room ? ` at ${room}` : ""}${zone ? `, with a pop-up in ${zone}` : ""}.`;
}

function claimsOf(n: Narrative | undefined): string | null {
  if (!n || n.status !== "ok" || !n.cards.sponsors) return null;
  const t = visibleClaimTotals({ sponsors: n.cards.sponsors });
  return `${t.verified} verified · ${t.removed} removed`;
}

function evidenceOf(i: PitchInput): string {
  const lead = i.source === "live" ? "Every number above comes from Qloo results recorded today (live run)."
    : i.source === "showcase" && i.recordedAt ? `Every number above comes from Qloo results recorded on ${dayText(new Date(i.recordedAt))} (recorded example).`
    : "Every number above comes from invented sample data, not from Qloo (sample example).";
  return `${lead} ${INTEGRITY_LINE}`;
}

/** The newest team lead or note that names the brand, as one line. Resolved threads read as decisions. */
function teamLine(brand: string, cityId: string, snap: Snapshot | null | undefined): string | null {
  if (!snap) return null;
  const b = fold(brand);
  const named = (t: string) => fold(t).includes(b) && !mentionsDoNotBook(t);
  const who = (a: { name: string; role: string; demo?: true }) => `${a.name} (${a.role})${a.demo ? " · Demo teammate" : ""}`;
  const found: Array<{ at: number; line: string }> = [];
  for (const l of snap.leads[cityId] ?? []) if (named(l.text)) found.push({ at: l.at, line: `Sponsor lead: "${l.text}" — ${who(l)}` });
  for (const [key, th] of Object.entries(snap.threads)) {
    if (key !== `city:${cityId}` && !key.startsWith(`card:${cityId}:`)) continue;
    for (const m of th.messages) if (named(m.text)) found.push({ at: m.at, line: `${th.resolved ? "Decision" : "Team note"}: "${m.text}" — ${who(m)}` });
  }
  return found.sort((x, y) => y.at - x.at)[0]?.line ?? null;
}

/** The sheet as plain text, section by section, for the clipboard. */
export function pitchSheetText(s: PitchSheetOk): string {
  const out: string[] = [s.title, `${s.date} · ${s.preparedWith}`, "", "Why this brand", s.why, "", "Who loves it most"];
  if (s.segments.state === "bands") { out.push(...s.segments.lines); if (s.segments.note) out.push(s.segments.note); } else out.push(s.segments.message);
  out.push("", "Where the fans are (share of in-city fan heat)", ...(s.zones.length ? s.zones.map((z) => `${z.label} ${z.share}`) : ["No neighbourhood data."]));
  out.push("", "The night");
  if (s.room) out.push(`Best room: ${s.room.name} (fit ${s.room.fit})`);
  if (s.opener) out.push(`Suggested opening act: ${s.opener}`);
  if (s.week.length) {
    out.push("", "This week in the city");
    for (const w of s.week) out.push(`- ${w.text}${w.date ? ` (${w.date})` : ""}${w.links.map((l) => ` [${l.n}] ${l.href}`).join("")}`);
  }
  out.push("", `${s.activation.label}: ${s.activation.text}`);
  out.push("", "Evidence and trust");
  if (s.claims) out.push(`Sponsors card claims: ${s.claims}`);
  out.push(s.evidence);
  if (s.team) out.push("", "Team", s.team);
  out.push("", DRAFT_FOOTER);
  return out.join("\n");
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
