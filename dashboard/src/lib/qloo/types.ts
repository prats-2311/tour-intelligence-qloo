/** Where a board or playbook came from. "sample" is the fictional Lumen Vale replay; "showcase" is a recorded run. */
export type Source = "live" | "sample" | "showcase";
export type SampleSet = "default" | "long" | "showcase";
export type QlooStatus = "ok" | "empty" | "needs_input" | "partial" | "degraded" | "error";
export interface EvidenceRef { tool: string; cacheKey: string; resultIndex?: number }
export type Score =
  | { value: number; refs: EvidenceRef[] }
  | { value: null; reason: "insufficient_data"; refs: EvidenceRef[] };
export interface DataWarning { tool: string; kind: "error" | "partial" | "degraded" | "stale"; code?: string; message?: string }
export type Verdict = "play" | "hidden_goldmine" | "de_risk" | "consider" | "skip" | "insufficient_data";
export type ComponentName = "sponsor_fit" | "local_hooks" | "fan_concentration" | "venue_fit";
export interface Thresholds {
  playFan: number; playAct: number; goldmineFanMin: number; goldmineFanMax: number; goldmineAct: number;
  deRiskFan: number; deRiskAct: number; considerWin: number;
}
/** The scoring config the gateway applied to a run (streamed once as the `scoring` event). */
export interface ScoringConfig {
  version: string;
  weights: Record<ComponentName, number>;
  affinityFloors: { sponsor_fit: number; local_hooks: number; venue_fit: number };
  concentration: "raw" | "vs_uniform";
  thresholds: Thresholds;
  /** Close-call band the gateway used; absent in older recordings (treat as 2). */
  closeCallBand?: number;
}
export interface Zone { label: string; lat: number; lon: number; affinity: number; index: number; share: number }
export interface ScoredCity {
  id: string; name: string; country: string; lat: number; lon: number;
  fanHeat: Score;
  activation: Score & { components?: Partial<Record<ComponentName, number>>; rawComponents?: Partial<Record<ComponentName, number>> };
  winnability: Score;
  verdict: Verdict;
  /** Within 2 points of a verdict line (gateway-computed). */
  closeCall?: boolean;
  zones: Zone[];
  warnings: DataWarning[];
  /** Why a city has no activation score. Only "location_unresolved" today: Qloo placed the city somewhere else, so it was not scored. */
  insufficientReason?: "location_unresolved";
  /** "major_market": the largest city of a brief country, checked though absent from Qloo's fan-heat list (fan heat is the board's floor). Absent on older recordings: treat as "heat". */
  candidateSource?: "heat" | "major_market";
  fanHeatFloor?: boolean;
  /** The location string Qloo resolved this city with and how many lookups that took (unresolved: all that were tried). */
  locationQuery?: string;
  locationAttempts?: number;
}
export type CardKind = "sponsors" | "merch" | "promo_zones" | "local_moment" | "venue_fit" | "co_billing" | "talent";
export interface PlaybookCard {
  kind: CardKind;
  status: "ok" | "empty";
  items: Array<Record<string, unknown>>;
  refs: EvidenceRef[];
  warnings: DataWarning[];
  summary?: Record<string, number | boolean | null | string | string[]>;
}
export interface Claim { text: string; entities: Array<{ name: string; entityId?: string }>; numbers: number[]; evidence_refs: string[] }
export type RemovalReason = "no_refs" | "dangling_ref" | "unsupported_entity" | "unsupported_number" | "no_checkable_content";
export interface CardClaims { verified: Claim[]; removed: Array<{ claim: Claim; reason: RemovalReason; detail: string }> }
export interface MerchDirection { title: string; palette: string[]; motifs: string[]; products: string[] }
export type Narrative =
  | { status: "ok"; model: string; thoughtSummary: string | null; cards: Partial<Record<CardKind, CardClaims>>; merch: MerchDirection | null; cached: boolean }
  | { status: "unavailable"; reason: "error" | "capped" | "disabled"; message: string };
export interface DateWindow { start: string; end: string }
export interface ThisWeekItem { text: string; date: string | null; entities: string[]; citations: string[] }
export type ThisWeek =
  | { status: "ok"; window: DateWindow; items: ThisWeekItem[]; removed: Array<{ item: ThisWeekItem; reason: string }>; citations: Array<{ id: string; url: string; title: string }>; summarised: boolean; cached: boolean }
  | { status: "unavailable"; reason: "no_key" | "capped" | "error" | "no_window"; message: string };
export interface ArtistProfile {
  demographics: unknown[];
  tags: Array<{ name: string; affinity: number }>;
  trends: Array<{ date: string; value: number }>;
  refs: EvidenceRef[];
  warnings: DataWarning[];
}
export type StrategistToolStatus = "ok" | "empty" | "needs_input" | "partial" | "degraded" | "error" | "rejected";
export type GatewayEvent =
  | { type: "resolve"; entity: { entityId: string; name: string; popularity?: number } }
  | { type: "scoring"; scoring: ScoringConfig; closeCallBand?: number }
  | ({ type: "artist_profile" } & ArtistProfile)
  | { type: "region_unavailable"; region: string; code: string; message: string }
  | { type: "needs_input"; field: string; candidates: Array<{ id: string; name: string; type?: string }>; summary: string }
  | { type: "tool_call"; tool: string; args: Record<string, unknown>; cached: boolean }
  | { type: "tool_result"; tool: string; status: QlooStatus; resultCount: number; cacheKey: string; stale: boolean }
  | { type: "region_empty"; region: string }
  | { type: "city_scored"; city: ScoredCity }
  | { type: "playbook"; playbook: { city: { name: string; country: string }; cards: PlaybookCard[] } }
  | { type: "narrative"; narrative: Narrative }
  | { type: "strategist_thinking"; summary: string }
  | { type: "strategist_tool_call"; id: string; name: string; args: Record<string, unknown> }
  | { type: "strategist_tool_result"; id: string; name: string; status: StrategistToolStatus; summary: string; cached: boolean }
  | { type: "strategist_message"; text: string; unsupportedNumbers: string[]; stoppedEarly: boolean; model: string }
  | { type: "strategist_error"; code: "CAPPED" | "UNAVAILABLE" | "ABORTED" | "INTERNAL"; message: string }
  | { type: "done"; summary: unknown }
  | { type: "error"; code: string; message: string };
export interface TourBrief { artist: string; artistEntityId?: string; regions: string[]; maxStops: number; dateWindow?: DateWindow }
export interface ChatMessage { role: "user" | "assistant"; text: string }
export interface StrategistContext {
  artist?: { name: string; entityId: string };
  regions?: string[];
  cities?: Array<{ id: string; name: string; country: string; verdict: string; fanHeat: number | null; activation: number | null; winnability: number | null }>;
  focusCityId?: string;
}
export type WithoutQloo =
  | { status: "ok"; ranked: Array<{ name: string; country: string }>; model: string; cached: boolean }
  | { status: "unavailable"; reason: "capped" | "error" | "disabled" | "invalid"; message: string };
