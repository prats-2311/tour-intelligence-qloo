import { computeMoves } from "@/lib/qloo/moves";
import { firstOkItem, firstOkName } from "@/lib/qloo/playbookFacts";
import { showcaseCities, showcaseQuery, type Showcase } from "@/lib/qloo/showcase";
import type { PlaybookCard, ScoredCity } from "@/lib/qloo/types";

/** One step of the guided tour. `targets` are `data-tour` values tried in order; none found means the step is centred with no highlight. */
export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** Path and query this step lives on; the tour navigates there when the step changes. */
  route: string;
  targets: string[];
  /** Opens the Ask panel before the step is drawn (the chat steps point at controls inside it). Nothing is sent. */
  opens?: "ask";
}

export const TOUR_STEP_COUNT = 9;
export const BOARD = `/tours/board${showcaseQuery(false)}`;

export const joinList = (xs: string[]): string => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/** "Los Angeles" reads as "LA" in the approved copy; every other city keeps its name. */
export const short = (name: string): string => (name === "Los Angeles" ? "LA" : name);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

interface Facts {
  artist: string;
  markets: number;
  regions: string[];
  /** The city that climbs furthest when winnability is added to fan heat. */
  mover: { city: ScoredCity; fanRank: number; winRank: number } | null;
  /** The city whose recorded playbook the tour opens: the mover when it has one, else the first city with a recorded playbook. */
  playbookCity: ScoredCity | null;
  sponsor: { name: string; artistRank: number; cityRank: number | null } | null;
  venue: string | null;
  coBill: { name: string } | null;
  /** The first recorded question the strategist replays, for the chat step's example. */
  question: string | null;
}

/** Every number and name in the tour copy is read from the recording here, the way storyBeats does, so the copy cannot drift from the screen. */
export function tourFacts(show: Showcase): Facts {
  const all = showcaseCities(show);
  const real = show.recordedAt !== null;
  const top = real ? computeMoves(all).find((m) => m.delta > 0) : undefined;
  const mover = top ? { city: top.city, fanRank: top.fanRank, winRank: top.winRank } : null;
  const hasPlaybook = (c: ScoredCity) => (show.playbooks[c.id] ?? []).some((e) => e.type === "playbook");
  const playbookCity = real ? (mover && hasPlaybook(mover.city) ? mover.city : all.find(hasPlaybook) ?? null) : null;
  const cards: PlaybookCard[] = playbookCity ? (show.playbooks[playbookCity.id] ?? []).flatMap((e) => (e.type === "playbook" ? e.playbook.cards : [])) : [];
  const sp = firstOkItem(cards, "sponsors");
  const spName = typeof sp?.name === "string" && sp.name ? sp.name : null;
  const spRank = num(sp?.artistRank);
  const cbName = firstOkName(cards, "co_billing");
  return {
    artist: show.artist,
    markets: all.length,
    regions: show.brief.regions,
    mover,
    playbookCity,
    sponsor: spName && spRank !== null ? { name: spName, artistRank: spRank, cityRank: num(sp?.cityRank) } : null,
    venue: firstOkName(cards, "venue_fit"),
    coBill: cbName ? { name: cbName } : null,
    question: show.strategist[0]?.question ?? null,
  };
}

export function buildTourSteps(show: Showcase): TourStep[] {
  const f = tourFacts(show);
  const pc = f.playbookCity;
  const playbookRoute = pc ? `/tours/playbook/${pc.id}${showcaseQuery(false)}` : BOARD;
  const where = pc ? short(pc.name) : "the top city";
  const s = f.sponsor;

  const hook = (() => {
    const gap = "That gap is the sponsor pitch.";
    if (!pc || !s) return `Each city's playbook shows the brands this artist's fans rank far above the city's own list. ${gap}`;
    if (s.cityRank === null) return `In ${pc.name} the artist's fans rank ${s.name} #${s.artistRank}, and ${s.name} isn't in ${short(pc.name)}'s own top 20. ${gap}`;
    if (s.cityRank > s.artistRank) return `In ${pc.name} the artist's fans rank ${s.name} #${s.artistRank}, while the city ranks it #${s.cityRank}. ${gap}`;
    return `Each city's playbook shows the brands this artist's fans rank against the city's own list. ${gap}`;
  })();

  const venueAsk = f.venue ? `at ${f.venue}` : "on the tour stop";
  const rest = f.venue && f.coBill
    ? `In ${where} the top room is ${f.venue} and the top support act is ${f.coBill.name}.`
    : `Each one is picked from the fans' taste in ${where}, not from a generic list.`;

  return [
    { id: "hook", title: "The hook", route: playbookRoute, targets: ["sponsors-top", "card-sponsors"], body: hook },
    {
      id: "age", title: "By age group", route: playbookRoute, targets: ["sponsors-age", "card-sponsors"],
      body: "By age group re-ranks the brands for each age band. Each number is how far that band over-indexes against the average audience, not a share, so different ages point to different sponsors.",
    },
    {
      id: "pitch", title: "Pitch sheet", route: playbookRoute, targets: ["sponsors-pitch", "card-sponsors"],
      body: `Every brand row links to a one-page Pitch sheet. ${s ? `For ${s.name}` : "For each brand"} it turns the rank gap and the ask ${venueAsk} into a brief to send.`,
    },
    {
      id: "claims", title: "Checked claims", route: playbookRoute, targets: ["claims-badge", "claims-tile"],
      body: "Gemini writes the summaries, then every number and name is checked against the Qloo data. Anything unmatched is struck out; click this badge to see each checked claim.",
    },
    {
      id: "playbook", title: "Acts, venues and promo zones", route: playbookRoute, targets: ["card-co_billing", "card-venue_fit", "card-promo_zones"],
      body: `The rest of the playbook ranks venues by fit, support acts by shared taste and promo zones for local promotion. ${rest}`,
    },
    {
      id: "board", title: "The Tour Board", route: BOARD, targets: ["moves", "board-header"],
      body: `An LLM is good at picking big markets, so the board is context for winning each city, not a market pick. ${f.mover ? `${short(f.mover.city.name)} moves from #${f.mover.fanRank} on fan heat to #${f.mover.winRank} on winnability.` : "Each row scores how winnable the city is, beyond fan heat."}`,
    },
    {
      id: "without", title: "Without Qloo", route: `${BOARD}&mode=without`, targets: ["board-panel"],
      body: "The same cities ranked by a generic AI with no taste data. It is good at big markets and beat us there in our own test, but it can't say which brands or acts to pitch.",
    },
    {
      id: "ask", title: "Ask about this tour", route: playbookRoute, targets: ["ask"],
      body: `A strategist agent answers questions about this tour with live Qloo lookups and shows its work log. ${f.question ? `Try \u201c${f.question}\u201d` : `Ask which brand to pitch in ${where}`} and every number in the answer comes from a Qloo result.`,
    },
    {
      id: "book", title: "Tour Book", route: `/tours/book${showcaseQuery(false)}`, targets: ["book-cover"],
      body: `Everything becomes a printable Tour Book for ${f.artist}, one chapter per city. To run your own artist, use "Try your own artist" on the home page.`,
    },
  ];
}
