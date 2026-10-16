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
export interface PlaybookCard {
  kind: "sponsors" | "promo_zones" | "local_moment" | "venue_fit" | "co_billing";
  status: "ok" | "empty";
  items: Array<Record<string, unknown>>;
  refs: EvidenceRef[];
  warnings: DataWarning[];
}
export interface ArtistProfile {
  demographics: unknown[];
  tags: Array<{ name: string; affinity: number | null }>;
  trends: unknown;
  refs: EvidenceRef[];
  warnings: DataWarning[];
}
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
  | { type: "done"; summary: unknown }
  | { type: "error"; code: string; message: string };
export interface TourBrief { artist: string; artistEntityId?: string; regions: string[]; maxStops: number }
