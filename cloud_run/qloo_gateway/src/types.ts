export type QlooStatus = "ok" | "empty" | "needs_input" | "partial" | "degraded" | "error";

export interface QlooRequestPreview { method: "GET"; path: string; query: unknown }

export interface QlooEnvelope {
  schema_version?: string;
  operation: string;
  status: QlooStatus;
  summary?: string;
  interpretation?: unknown;
  results?: unknown;
  result_count?: number;
  warnings?: string[];
  issues?: unknown[];
  error?: { code: string; layer?: string; retryable: boolean; recovery: string };
  provenance?: { source: string; endpoint: string; documentation: string; requests?: QlooRequestPreview[] };
  [extra: string]: unknown;
}

export interface EvidenceRef { tool: string; cacheKey: string; resultIndex?: number }

export type Score =
  | { value: number; refs: EvidenceRef[] }
  | { value: null; reason: "insufficient_data"; refs: EvidenceRef[] };

export interface DataWarning { tool: string; kind: "error" | "partial" | "degraded" | "stale"; code?: string; message?: string }

export type Verdict = "play" | "hidden_goldmine" | "de_risk" | "consider" | "skip" | "insufficient_data";

export type GatewayEvent =
  | { type: "resolve"; entity: { entityId: string; name: string } }
  | { type: "artist_profile"; demographics: unknown[]; tags: Array<{ name: string; affinity: number }>; trends: unknown; refs: EvidenceRef[]; warnings: DataWarning[] }
  | { type: "region_unavailable"; region: string; code: string; message: string }
  | { type: "needs_input"; field: string; candidates: Array<{ id: string; name: string; type?: string }>; summary: string }
  | { type: "tool_call"; tool: string; args: Record<string, unknown>; cached: boolean }
  | { type: "tool_result"; tool: string; status: QlooStatus; resultCount: number; cacheKey: string; stale: boolean }
  | { type: "region_empty"; region: string }
  | { type: "city_scored"; city: unknown }
  | { type: "playbook"; playbook: unknown }
  | { type: "done"; summary: unknown }
  | { type: "error"; code: string; message: string };
