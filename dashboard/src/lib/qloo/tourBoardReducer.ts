import type { ArtistProfile, GatewayEvent, ScoredCity, TourBrief } from "./types";

export type BoardState = {
  status: "idle" | "streaming" | "needs_input" | "done" | "error" | "interrupted";
  source: "live" | "sample";
  brief?: TourBrief;
  artist?: { entityId: string; name: string };
  profile?: ArtistProfile;
  cities: ScoredCity[];
  log: GatewayEvent[];
  regionsEmpty: string[];
  regionsUnavailable: Array<{ region: string; code: string; message: string }>;
  needsInput?: Extract<GatewayEvent, { type: "needs_input" }>;
  error?: { code: string; message: string };
  interruptReason?: "user" | "connection";
};

export type BoardAction =
  | { type: "start"; brief: TourBrief; source: "live" | "sample" }
  | { type: "event"; event: GatewayEvent }
  | { type: "interrupted"; reason?: "user" | "connection" }
  | { type: "reset" };

export const initialBoard: BoardState = { status: "idle", source: "live", cities: [], log: [], regionsEmpty: [], regionsUnavailable: [] };

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case "reset":
      return initialBoard;
    case "start":
      return { ...initialBoard, status: "streaming", source: action.source, brief: action.brief };
    case "interrupted":
      return state.status === "streaming" ? { ...state, status: "interrupted", interruptReason: action.reason ?? "connection" } : state;
    case "event": {
      const e = action.event;
      const log = [...state.log, e];
      switch (e.type) {
        case "resolve": return { ...state, log, artist: e.entity };
        case "artist_profile": {
          const profile: ArtistProfile = { demographics: e.demographics, tags: e.tags, trends: e.trends, refs: e.refs, warnings: e.warnings };
          return { ...state, log, profile };
        }
        case "region_empty": return { ...state, log, regionsEmpty: [...state.regionsEmpty, e.region] };
        case "region_unavailable": return { ...state, log, regionsUnavailable: [...state.regionsUnavailable, { region: e.region, code: e.code, message: e.message }] };
        case "needs_input": return { ...state, log, status: "needs_input", needsInput: e };
        case "city_scored": return { ...state, log, cities: [...state.cities.filter((c) => c.id !== e.city.id), e.city] };
        case "done": return { ...state, log, status: "done" };
        case "error": return { ...state, log, status: "error", error: { code: e.code, message: e.message } };
        default: return { ...state, log };
      }
    }
  }
}
