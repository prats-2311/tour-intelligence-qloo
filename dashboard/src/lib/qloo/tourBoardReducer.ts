import type { ArtistProfile, GatewayEvent, SampleSet, ScoredCity, ScoringConfig, Source, TourBrief } from "./types";

export type BoardState = {
  status: "idle" | "streaming" | "needs_input" | "done" | "error" | "interrupted";
  source: Source;
  sampleSet?: SampleSet;
  brief?: TourBrief;
  artist?: { entityId: string; name: string; popularity?: number };
  profile?: ArtistProfile;
  cities: ScoredCity[];
  /** The scoring config the gateway applied; null until the event arrives (sample data, older recordings). */
  scoring: ScoringConfig | null;
  /** null = use defaultShortlist */
  shortlist: string[] | null;
  log: GatewayEvent[];
  regionsEmpty: string[];
  regionsUnavailable: Array<{ region: string; code: string; message: string }>;
  /** Pasted city names ("paste your cities" mode) that matched nothing in the city list, as the gateway listed them. */
  routingUnmatched: string[];
  needsInput?: Extract<GatewayEvent, { type: "needs_input" }>;
  error?: { code: string; message: string };
  interruptReason?: "user" | "connection";
  /** Distinct for every run the provider starts or loads (saved tours key on it, so re-running the same brief is a new run). */
  runId?: number;
  /** Set when the run was opened from a saved tour: the id it is stored under. */
  savedId?: string;
};

export type BoardAction =
  | { type: "start"; brief: TourBrief; source: Source; sampleSet?: SampleSet; runId?: number }
  | { type: "event"; event: GatewayEvent }
  | { type: "interrupted"; reason?: "user" | "connection" }
  | { type: "shortlist"; ids: string[] }
  | { type: "load"; brief: TourBrief; events: GatewayEvent[]; shortlist: string[] | null; savedId?: string; runId?: number }
  | { type: "reset" };

export const initialBoard: BoardState = { status: "idle", source: "live", cities: [], scoring: null, shortlist: null, log: [], regionsEmpty: [], regionsUnavailable: [], routingUnmatched: [] };

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    // A saved tour opens finished: its recorded events fold through the same reducer a live stream uses.
    case "load": {
      let s = boardReducer(initialBoard, { type: "start", brief: action.brief, source: "live", runId: action.runId });
      for (const event of action.events) s = boardReducer(s, { type: "event", event });
      return { ...s, status: s.status === "streaming" ? "done" : s.status, shortlist: action.shortlist, ...(action.savedId ? { savedId: action.savedId } : {}) };
    }
    case "reset":
      return initialBoard;
    case "shortlist":
      return { ...state, shortlist: action.ids };
    case "start":
      return { ...initialBoard, status: "streaming", source: action.source, sampleSet: action.sampleSet, brief: action.brief, ...(action.runId !== undefined ? { runId: action.runId } : {}) };
    case "interrupted":
      return state.status === "streaming" ? { ...state, status: "interrupted", interruptReason: action.reason ?? "connection" } : state;
    case "event": {
      const e = action.event;
      const log = [...state.log, e];
      switch (e.type) {
        case "resolve": return { ...state, log, artist: e.entity };
        case "scoring": return { ...state, log, scoring: e.closeCallBand === undefined ? e.scoring : { ...e.scoring, closeCallBand: e.closeCallBand } };
        case "artist_profile": {
          const profile: ArtistProfile = { demographics: e.demographics, tags: e.tags, trends: e.trends, refs: e.refs, warnings: e.warnings };
          return { ...state, log, profile };
        }
        case "region_empty": return { ...state, log, regionsEmpty: [...state.regionsEmpty, e.region] };
        case "region_unavailable": return { ...state, log, regionsUnavailable: [...state.regionsUnavailable, { region: e.region, code: e.code, message: e.message }] };
        case "routing_unmatched": return { ...state, log, routingUnmatched: e.names };
        case "needs_input": return { ...state, log, status: "needs_input", needsInput: e };
        // Arrival order is load-bearing (accentOrder): never sort here, and a re-scored city keeps its slot.
        case "city_scored": return { ...state, log, cities: state.cities.some((c) => c.id === e.city.id) ? state.cities.map((c) => (c.id === e.city.id ? e.city : c)) : [...state.cities, e.city] };
        case "done": return { ...state, log, status: "done" };
        case "error": return { ...state, log, status: "error", error: { code: e.code, message: e.message } };
        default: return { ...state, log };
      }
    }
  }
}
