import { zoneDisplayLabel } from "@/lib/qloo/zones";
import { showcaseCities, type Showcase } from "@/lib/qloo/showcase";
import type { PlaybookCard } from "@/lib/qloo/types";

/**
 * Data behind the /v2 "Taste Loop" concept preview. Everything about the artist and the venues' intent is a fictional or
 * illustrative example; everything in `match` is read from the recorded Los Angeles playbook at runtime.
 */

/** The fictional artist's profile. Nothing here describes a real person. */
export const EXAMPLE_PROFILE = {
  name: "Example artist",
  genre: "Dreamy guitar pop",
  soundsLike: "Mac DeMarco",
  loves: ["Record shops", "Small rooms", "Film screenings", "Tacos"],
  wontWorkWith: ["Luxury fashion"],
  datesInTown: "Two nights in town",
} as const;

/**
 * The category map behind the no-go list. A brand in the recording is crossed out only when it appears here under a category
 * the artist has put on their no-go list. Brands are assigned by hand and only for names that can appear in the recorded LA
 * sponsors list; a brand that is not in the map is never crossed out.
 */
export const BRAND_CATEGORY: Readonly<Record<string, string>> = {
  "off-white": "Luxury fashion",
  "fear of god": "Luxury fashion",
};

export const categoryOf = (brand: string): string | null => BRAND_CATEGORY[brand.trim().toLowerCase()] ?? null;
export const isNoGo = (brand: string, noGo: readonly string[] = EXAMPLE_PROFILE.wontWorkWith): boolean => {
  const c = categoryOf(brand);
  return c !== null && noGo.some((n) => n.toLowerCase() === c.toLowerCase());
};

export interface MatchBrand { name: string; fanRank: number | null; cityRank: number | null; noGo: boolean; category: string | null }
export interface MatchPlace { name: string; source: "venue_fit" | "local_moment"; affinity: number | null }
export interface VenueProfile { name: string; collabs: string; room: string; freeNights: string }

export interface TasteLoopData {
  /** False when no recording is loaded: the match section then says so instead of showing anything. */
  real: boolean;
  city: string;
  artist: string;
  recordedOn: string;
  brands: MatchBrand[];
  places: MatchPlace[];
  venues: VenueProfile[];
  topPlace: MatchPlace | null;
  topBrand: MatchBrand | null;
  /** First movie (else TV show) in "What these fans love here". */
  film: { name: string; kind: "movie" | "tv_show" } | null;
  /** First co-billing act. */
  coBill: string | null;
  /** First promo zone, shown the way the rest of the app shows it. */
  zone: string | null;
  /** First recorded place whose name reads as somewhere to eat. */
  foodPlace: string | null;
}

/** Name heuristic only: a place is used for the fan dinner when its name says it serves food. */
export const isFoodPlace = (name: string): boolean => /\b(taco|tacos|taqueria|taquer[ií]a|restaurant|cafe|caf[eé]|kitchen|grill|diner|bistro|eatery|pizz\w*|ramen|bakery|cantina)\b/i.test(name);

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Real venues, blank intent fields: only the venue can answer these, so nothing is invented about a real business. */
const ILLUSTRATIVE = [
  { collabs: "Open to collabs? (the venue answers)", room: "Room size? (the venue answers)", freeNights: "Free nights? (the venue answers)" },
] as const;

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${d.getUTCFullYear()}`;
};

/** Heuristic for the activation title: only a shop-like place gets "Record-shop"; anything else is a plain listening session. */
export const isRecordShop = (name: string): boolean => /\b(records?|vinyl|music store)\b/i.test(name);

export function loadTasteLoop(show: Showcase): TasteLoopData {
  const empty: TasteLoopData = { real: false, city: "Los Angeles", artist: show.artist, recordedOn: "", brands: [], places: [], venues: [], topPlace: null, topBrand: null, film: null, coBill: null, zone: null, foodPlace: null };
  if (show.recordedAt === null) return empty;
  const cities = showcaseCities(show);
  const hasPb = (id: string) => (show.playbooks[id] ?? []).some((e) => e.type === "playbook");
  const la = cities.find((c) => c.name === "Los Angeles" && hasPb(c.id)) ?? cities.find((c) => hasPb(c.id));
  if (!la) return empty;
  const cards: PlaybookCard[] = (show.playbooks[la.id] ?? []).flatMap((e) => (e.type === "playbook" ? e.playbook.cards : []));
  const okCard = (k: PlaybookCard["kind"]) => cards.find((c) => c.kind === k && c.status === "ok")?.items ?? [];

  const brands: MatchBrand[] = okCard("sponsors").flatMap((it) => {
    const name = str(it.name);
    return name ? [{ name, fanRank: num(it.artistRank), cityRank: num(it.cityRank), noGo: isNoGo(name), category: categoryOf(name) }] : [];
  });
  const places: MatchPlace[] = [];
  const seen = new Set<string>();
  const addPlace = (it: Record<string, unknown>, source: MatchPlace["source"]) => {
    const name = str(it.name);
    if (!name || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    places.push({ name, source, affinity: num(it.affinity) });
  };
  okCard("venue_fit").forEach((it) => addPlace(it, "venue_fit"));
  okCard("local_moment").filter((it) => it.category === "place").forEach((it) => addPlace(it, "local_moment"));

  const moments = okCard("local_moment");
  const filmItem = moments.find((it) => it.category === "movie" && str(it.name)) ?? moments.find((it) => it.category === "tv_show" && str(it.name));
  const coBill = okCard("co_billing").map((it) => str(it.name)).find((n) => n) ?? null;
  const zoneLabel = okCard("promo_zones").map((it) => str(it.label)).find((n) => n);

  const venues: VenueProfile[] = places.slice(0, 3).map((p, i) => ({ name: p.name, ...ILLUSTRATIVE[i % ILLUSTRATIVE.length]! }));
  return {
    real: true,
    city: la.name,
    artist: show.artist,
    recordedOn: formatDate(show.recordedAt ?? ""),
    brands,
    places,
    venues,
    topPlace: places[0] ?? null,
    topBrand: brands.find((b) => !b.noGo) ?? null,
    film: filmItem ? { name: str(filmItem.name), kind: filmItem.category === "movie" ? "movie" : "tv_show" } : null,
    coBill,
    zone: zoneLabel ? zoneDisplayLabel(zoneLabel, la.name) : null,
    foodPlace: places.find((p) => isFoodPlace(p.name))?.name ?? null,
  };
}

export const OUTCOME_METRICS: ReadonlyArray<{ id: string; label: string; who: string }> = [
  { id: "rsvp", label: "RSVP rate", who: "Of the fans who saw the link, how many tapped Going or Waitlist" },
  { id: "showup", label: "Show-up rate", who: "Of the fans who said Going, how many tapped I was there" },
  { id: "rebook", label: "Would rebook (venue)", who: "The venue says whether it would host this artist again" },
  { id: "repeat", label: "Would repeat (artist)", who: "The artist says whether they would do this activation again" },
];

export const HYPOTHESES: readonly string[] = [
  "Activations at places these fans rank above the city get more RSVPs than places popular with everyone.",
  "Fans who say they were there are a better sign of a good match than fans who only said Going.",
  "A suggestion that respects the artist's no-go list is accepted more often than one that ignores it.",
];

export const COMPARE_ROWS: ReadonlyArray<{ topic: string; v1: string; v2: string }> = [
  { topic: "Whose taste counts", v1: "The fans of one artist, read from Qloo", v2: "The artist's own profile, plus what their fans rank above the city" },
  { topic: "Brand safety", v1: "Filters out causes; no say from the artist", v2: "The artist's won't-work-with list removes brands before anything is suggested" },
  { topic: "New and small artists", v1: "Needs an artist Qloo already knows well", v2: "A profile can say \"sounds like\" a known artist, so a new act can still be matched" },
  { topic: "What gets suggested", v1: "Ranked lists of brands, venues and acts", v2: "One activation with evidence and an outreach draft" },
  { topic: "Venues", v1: "Ranked by taste fit; nothing from the venue", v2: "Venues claim a profile: collabs, capacity, free nights" },
  { topic: "Learning", v1: "Each run starts fresh from Qloo data", v2: "Results are written back, and the next plan learns from them" },
  { topic: "Proof", v1: "Pre-registered tests on past tours", v2: "RSVPs and I was there taps from real events" },
];

export const HONEST_LIMITS: readonly string[] = [
  "Venues must claim a profile before they can be matched. Until enough do, there is little to match against (the cold start).",
  "There is no proof until real events happen. Nothing on this page has been tested with fans.",
  "An LLM can do the easy matching too. The edge is what fans rank above their city, plus an outcome record no LLM has read.",
];
