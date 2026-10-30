import { NOT_IN_CITY_TOP_20 } from "@/components/playbook/format";
import { isDoNotBook, mentionsDoNotBook, applyDoNotBook } from "./doNotBook";
import { isNonSponsor } from "./nonSponsors";
import type { PlaybookCard } from "./types";

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
}

export const UNAVAILABLE_MESSAGE = "This name isn't available for a pitch sheet.";
export const PREPARED_WITH = "Prepared with Tour Intelligence × Qloo";

export interface PitchSheetOk { status: "ok"; title: string; date: string; preparedWith: string; why: string }
export type PitchSheet = PitchSheetOk | { status: "unavailable"; message: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayText = (d: Date): string => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
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
  };
}
