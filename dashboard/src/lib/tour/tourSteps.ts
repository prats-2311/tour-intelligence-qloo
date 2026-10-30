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
}

export const TOUR_STEP_COUNT = 9;
const BOARD = `/tours/board${showcaseQuery(false)}`;

const joinList = (xs: string[]): string => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/** "Los Angeles" reads as "LA" in the approved copy; every other city keeps its name. */
const short = (name: string): string => (name === "Los Angeles" ? "LA" : name);
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
  coBill: { name: string; sharedPct: number | null } | null;
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
  const cb = firstOkItem(cards, "co_billing");
  const cbName = firstOkName(cards, "co_billing");
  const shared = num(cb?.sharedTaste);
  return {
    artist: show.artist,
    markets: all.length,
    regions: show.brief.regions,
    mover,
    playbookCity,
    sponsor: spName && spRank !== null ? { name: spName, artistRank: spRank, cityRank: num(sp?.cityRank) } : null,
    venue: firstOkName(cards, "venue_fit"),
    coBill: cbName ? { name: cbName, sharedPct: shared === null ? null : Math.round(shared * 100) } : null,
  };
}

export function buildTourSteps(show: Showcase): TourStep[] {
  const f = tourFacts(show);
  const pc = f.playbookCity;
  const playbookRoute = pc ? `/tours/playbook/${pc.id}${showcaseQuery(false)}` : BOARD;
  const where = pc ? short(pc.name) : "the top city";

  const hook = (() => {
    const s = f.sponsor;
    const gap = "That gap is the sponsor pitch, and finding gaps like it in every city is what this app does.";
    if (!pc || !s) return `Each city's playbook shows the brands this artist's fans rank far above the city's own list. ${gap}`;
    if (s.cityRank === null) return `In ${pc.name} the artist's fans rank ${s.name} #${s.artistRank}, and ${s.name} isn't in ${short(pc.name)}'s own top 20. ${gap}`;
    if (s.cityRank > s.artistRank) return `In ${pc.name} the artist's fans rank ${s.name} #${s.artistRank}, while the city ranks it #${s.cityRank}. ${gap}`;
    return `Each city's playbook shows the brands this artist's fans rank against the city's own list. ${gap}`;
  })();

  const decideMove = f.mover ? ` ${short(f.mover.city.name)} moves from #${f.mover.fanRank} on fan heat to #${f.mover.winRank} on winnability.` : "";
  const venueAsk = f.venue ? `at ${f.venue}` : "on the tour stop";
  const taste = f.coBill ? ` (${f.coBill.name}${f.coBill.sharedPct !== null ? `: fans share taste ${f.coBill.sharedPct}%` : ""})` : "";

  return [
    {
      id: "markets", title: "Markets", route: BOARD, targets: ["board-header"],
      body: `This is a recorded tour for ${f.artist}: ${f.markets} ${f.markets === 1 ? "city" : "cities"}${f.regions.length ? ` across ${joinList(f.regions)}` : ""}. Fan heat shows where the artist's fans are most concentrated, using Qloo taste data.`,
    },
    { id: "hook", title: "The hook", route: BOARD, targets: pc ? [`city-${pc.id}`] : [], body: hook },
    {
      id: "decide", title: "Decide", route: BOARD, targets: ["moves"],
      body: `Winnability is half fan heat and half activation, meaning how well the city's sponsors, venues and local hooks fit these fans.${decideMove} The scores come from fixed code, not an AI guess.`,
    },
    {
      id: "without", title: "Without Qloo", route: `${BOARD}&mode=without`, targets: ["board-panel"],
      body: "The same cities ranked by a generic AI, with no taste data. It's good at picking big markets, and it beat us there in our own test. What it can't tell you is which brands or acts to pitch.",
    },
    {
      id: "sponsors", title: "Playbook: Sponsors", route: playbookRoute, targets: ["card-sponsors"],
      body: `The brands the artist's ${where} fans rank far above the city does, with a ready-made ask: a presale or a co-branded night ${venueAsk}. Causes and advocacy groups are filtered out, because they aren't sponsors.`,
    },
    {
      id: "rest", title: "Playbook: the rest", route: playbookRoute, targets: ["card-co_billing"],
      body: `Venues ranked by fit and support acts scored on shared taste${taste}, plus the films, shows and places these fans love here, for local promo.`,
    },
    {
      id: "claims", title: "Verified claims", route: playbookRoute, targets: ["claims-badge", "claims-tile"],
      body: "Gemini writes the summaries, then every number and name is checked against the Qloo data. Anything that doesn't match is struck out, and this badge shows the count. Click any badge to see every checked claim.",
    },
    {
      id: "ask", title: "Ask about this tour", route: playbookRoute, targets: ["ask"],
      body: "A strategist agent answers questions about this tour with live Qloo lookups and shows its work log. Try “Who should open in Austin?” — every number it gives comes from a Qloo result.",
    },
    {
      id: "book", title: "Tour Book and Proof", route: `/tours/book${showcaseQuery(false)}`, targets: ["book-cover"],
      body: "Everything becomes a printable Tour Book, one chapter per city. Under 'How we tested it' you'll find our pre-registered test results, including where an AI did better than us. To try your own artist, use 'Try your own artist'.",
    },
  ];
}
