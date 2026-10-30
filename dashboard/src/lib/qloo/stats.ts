import { useEffect, useState } from "react";
import { sessionHeaders } from "./session";

/** Live analytics from the gateway's optional BigQuery tables. `enabled:false` (or any failure) means the panels stay hidden. */
export type StatsKind = "trust" | "team" | "v2";
export const STATS_OFF = { enabled: false } as const;

export interface TrustStats {
  enabled: true; since: string | null; playbooks: number; narratedPlaybooks: number; bySource: { live: number; mcp_public: number }; claimsChecked: number; claimsRemoved: number; removedRate: number | null;
  medianLatencyMs: number | null; sponsorsHidden: number; cities: number; last24h: { playbooks: number; claimsChecked: number };
}
export interface TeamStats {
  enabled: true; since: string | null; workspaces: number; events: number;
  overridesByField: { top_zone: number; best_room: number; support: number };
  overrideRate: number | null;
  statusCounts: { Considering: number; Confirmed: number; "On hold": number; Dropped: number };
  notesByRole: Record<string, number>;
}
export interface V2Stats {
  enabled: true; since: string | null; taps: number;
  byAction: { going: number; waitlist: number; was_there: number };
  byExperience: Record<string, { going: number; waitlist: number; was_there: number }>;
}
export type Off = typeof STATS_OFF;
export type StatsOf<K extends StatsKind> = K extends "trust" ? TrustStats | Off : K extends "team" ? TeamStats | Off : V2Stats | Off;

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const since = (v: unknown): string | null => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function parseStats<K extends StatsKind>(kind: K, raw: unknown): StatsOf<K> {
  const r = obj(raw);
  if (r.enabled !== true) return STATS_OFF as StatsOf<K>;
  if (kind === "trust") {
    const d = obj(r.last24h), src = obj(r.bySource);
    return { enabled: true, since: since(r.since), playbooks: num(r.playbooks), narratedPlaybooks: num(r.narratedPlaybooks), bySource: { live: num(src.live), mcp_public: num(src.mcp_public) }, claimsChecked: num(r.claimsChecked), claimsRemoved: num(r.claimsRemoved), removedRate: numOrNull(r.removedRate), medianLatencyMs: numOrNull(r.medianLatencyMs), sponsorsHidden: num(r.sponsorsHidden), cities: num(r.cities), last24h: { playbooks: num(d.playbooks), claimsChecked: num(d.claimsChecked) } } as StatsOf<K>;
  }
  if (kind === "team") {
    const o = obj(r.overridesByField), s = obj(r.statusCounts), roles = obj(r.notesByRole);
    return {
      enabled: true, since: since(r.since), workspaces: num(r.workspaces), events: num(r.events),
      overridesByField: { top_zone: num(o.top_zone), best_room: num(o.best_room), support: num(o.support) }, overrideRate: numOrNull(r.overrideRate),
      statusCounts: { Considering: num(s.Considering), Confirmed: num(s.Confirmed), "On hold": num(s["On hold"]), Dropped: num(s.Dropped) },
      notesByRole: Object.fromEntries(Object.entries(roles).map(([k, v]) => [k, num(v)])),
    } as StatsOf<K>;
  }
  const a = obj(r.byAction);
  const by = obj(r.byExperience);
  const act = (v: unknown) => { const x = obj(v); return { going: num(x.going), waitlist: num(x.waitlist), was_there: num(x.was_there) }; };
  return { enabled: true, since: since(r.since), taps: num(r.taps), byAction: act(a), byExperience: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, act(v)])) } as StatsOf<K>;
}

/** Never throws: any failure is `{enabled:false}`. */
export async function fetchStats<K extends StatsKind>(kind: K, opts: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {}): Promise<StatsOf<K>> {
  try {
    const res = await (opts.fetchImpl ?? fetch)(`/api/qloo/stats/${kind}`, { signal: opts.signal, headers: { ...sessionHeaders() } });
    if (!res.ok) return STATS_OFF as StatsOf<K>;
    return parseStats(kind, await res.json());
  } catch {
    return STATS_OFF as StatsOf<K>;
  }
}

/** `null` while loading, then the stats or `{enabled:false}`. Never blocks rendering. */
export function useStats<K extends StatsKind>(kind: K, active = true): StatsOf<K> | null {
  const [value, setValue] = useState<StatsOf<K> | null>(null);
  useEffect(() => {
    if (!active) return;
    const c = new AbortController();
    void fetchStats(kind, { signal: c.signal }).then((v) => { if (!c.signal.aborted) setValue(v); });
    return () => c.abort();
  }, [kind, active]);
  return active ? value : null;
}

export type TapAction = "going" | "waitlist" | "was_there";
export const TAPS_KEY = "tiq.v2.taps";

/** The actions this browser has already tapped (one per action). */
export function readTaps(): TapAction[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(TAPS_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is TapAction => x === "going" || x === "waitlist" || x === "was_there") : [];
  } catch { return []; }
}
export function rememberTap(a: TapAction): void {
  try { localStorage.setItem(TAPS_KEY, JSON.stringify([...new Set([...readTaps(), a])])); } catch { /* private mode: the tap still counted */ }
}

/** True when the gateway counted the tap. Never throws. */
export async function postV2Tap(action: TapAction, experience: string, opts: { fetchImpl?: typeof fetch } = {}): Promise<boolean> {
  try {
    const res = await (opts.fetchImpl ?? fetch)("/api/qloo/v2/tap", { method: "POST", headers: { "content-type": "application/json", ...sessionHeaders() }, body: JSON.stringify({ action, experience }) });
    if (!res.ok) return false;
    return obj(await res.json()).ok === true;
  } catch { return false; }
}
