import { SAMPLE_PLAYBOOK_CITY_IDS } from "./fixtures/lumenValePlaybooks";
import { SAMPLE_CITIES } from "./fixtures/lumenVale";
import { defaultShortlist, sortCities } from "./ranking";
import { showcaseAvailable, showcaseBrief, showcaseCities, showcasePlaybookEvents, showcaseQuery, showcaseVariant } from "./showcase";
import type { SampleSet, ScoredCity, Source } from "./types";

export type StepId = "markets" | "decide" | "playbook" | "book";
/** The one thread through the app: pick markets, decide which to hold, read the playbook, take the book. */
export const STEPS: ReadonlyArray<{ id: StepId; label: string }> = [
  { id: "markets", label: "Markets" },
  { id: "decide", label: "Decide" },
  { id: "playbook", label: "Playbook" },
  { id: "book", label: "Tour Book" },
];

export function stepOf(pathname: string): StepId | null {
  // Landing ("/") is the doorway, not a step: nothing is active there. "Markets" reads as done once the board is open.
  if (pathname === "/tours/board") return "decide";
  if (pathname.startsWith("/tours/playbook/")) return "playbook";
  if (pathname === "/tours/book") return "book";
  return null;
}

/** Identifies one run of the board, so a choice (the last-opened city) is remembered per run and never leaks into another. */
export const runKey = (source: Source, sampleSet: SampleSet | undefined, artist: string | undefined, routing = false): string => `${source}|${sampleSet ?? ""}|${artist ?? ""}${routing ? "|routing" : ""}`;

export type JourneyInput = {
  status: "idle" | "streaming" | "needs_input" | "done" | "error" | "interrupted";
  source: Source;
  sampleSet?: SampleSet;
  cities: ScoredCity[];
  shortlist: string[];
  lastOpenedId: string | null;
  /** The run is the recorded (or live) pasted-cities routing, so showcase links carry ?showcase=routing. */
  routing?: boolean;
};

/** The query that keeps a run's data mode on links: ?showcase=1|routing, ?sample=1|long, or none for a live run. */
export const journeyQuery = (source: Source, sampleSet?: SampleSet, routing = false): string =>
  source === "showcase" ? showcaseQuery(routing) : source === "sample" ? (sampleSet === "long" ? "?sample=long" : "?sample=1") : "";

/** Alias kept for the Charts page. */
export const sourceQuery = journeyQuery;

/** Whether a playbook exists to open for this city in this run (a recorded or sample run holds only a few; live opens any). */
export const cityHasPlaybook = (source: Source, id: string, routing: boolean): boolean =>
  source === "showcase" ? showcasePlaybookEvents(id, routing ? "routing" : "main") !== null : source === "sample" ? (SAMPLE_PLAYBOOK_CITY_IDS as readonly string[]).includes(id) : true;

/** Where each journey step leads right now. With no run it always leads into the showcase example (or the sample when no recording loaded). */
export function journeyLinks(input: JourneyInput): Record<StepId, string> {
  const hasRun = input.status !== "idle" || input.cities.length > 0;
  let routing = input.routing === true;
  let source = input.source, sampleSet = input.sampleSet, cities = input.cities, shortlist = input.shortlist, lastOpened = input.lastOpenedId;
  if (!hasRun) {
    source = showcaseAvailable() ? "showcase" : "sample";
    sampleSet = undefined;
    routing = showcaseVariant() === "routing";
    cities = source === "showcase" ? showcaseCities(undefined, routing ? "routing" : "main") : SAMPLE_CITIES;
    shortlist = defaultShortlist(cities, source === "showcase" ? showcaseBrief(routing ? "routing" : "main").maxStops : 8);
    lastOpened = null;
  }
  const q = journeyQuery(source, sampleSet, routing);
  const decide = `/tours/board${q}`;
  const byId = new Map(cities.map((c) => [c.id, c]));
  const candidates = [lastOpened, ...shortlist, ...sortCities(cities, "winnability").map((c) => c.id)];
  const target = candidates.find((id): id is string => !!id && byId.has(id) && cityHasPlaybook(source, id, routing));
  return { markets: "/", decide, playbook: target ? `/tours/playbook/${target}${q}` : decide, book: `/tours/book${q}` };
}
