export type QlooStatus = "ok" | "empty" | "needs_input" | "partial" | "degraded" | "error";
export interface EvidenceRef { tool: string; cacheKey: string; resultIndex?: number }
export type Score =
  | { value: number; refs: EvidenceRef[] }
  | { value: null; reason: "insufficient_data"; refs: EvidenceRef[] };
export interface DataWarning { tool: string; kind: "error" | "partial" | "degraded" | "stale"; code?: string; message?: string }
export type Verdict = "play" | "hidden_goldmine" | "de_risk" | "consider" | "skip" | "insufficient_data";
export type ComponentName = "sponsor_fit" | "local_hooks" | "fan_concentration" | "venue_fit";
export interface Zone { label: string; lat: number; lon: number; affinity: number; index: number; share: number }
export interface ScoredCity {
  id: string; name: string; country: string; lat: number; lon: number;
  fanHeat: Score;
  activation: Score & { components: Partial<Record<ComponentName, number>> };
  winnability: Score;
  verdict: Verdict;
  zones: Zone[];
  warnings: DataWarning[];
}
export type CardKind = "sponsors" | "merch" | "promo_zones" | "local_moment" | "venue_fit" | "co_billing" | "talent";
export interface PlaybookCard {
  kind: CardKind;
  status: "ok" | "empty";
  items: Array<Record<string, unknown>>;
  refs: EvidenceRef[];
  warnings: DataWarning[];
  summary?: Record<string, number | null>;
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
  tags: Array<{ name: string; affinity: number | null }>;
  trends: unknown;
  refs: EvidenceRef[];
  warnings: DataWarning[];
}
export type StrategistToolStatus = "ok" | "empty" | "needs_input" | "partial" | "degraded" | "error" | "rejected";
export type GatewayEvent =
  | { type: "resolve"; entity: { entityId: string; name: string } }
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
