import type { Analytics } from "./bigquery.js";

export type Disabled = { enabled: false };
const DISABLED: Disabled = { enabled: false };
const WINDOW = "ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 90 DAY)"; // partition filter: keeps every query to the last 90 days of partitions
const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const iso = (v: unknown): string | null => {
  const raw = v && typeof v === "object" && "value" in v ? (v as { value: unknown }).value : v;
  if (raw === null || raw === undefined || raw === "") return null;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export interface TrustStats {
  enabled: true; since: string | null; playbooks: number; claimsChecked: number; claimsRemoved: number; removedRate: number | null;
  medianLatencyMs: number | null; sponsorsHidden: number; cities: number; last24h: { playbooks: number; claimsChecked: number };
}
export const STATUS_LABELS = { considering: "Considering", confirmed: "Confirmed", on_hold: "On hold", dropped: "Dropped" } as const;
export const OVERRIDE_FIELDS = ["top_zone", "best_room", "support"] as const;
export const ROLE_NAMES = ["Manager", "Booking agent", "Promoter", "Brand team", "Other"] as const;
export interface TeamStats {
  enabled: true; since: string | null; workspaces: number; events: number;
  overridesByField: Record<(typeof OVERRIDE_FIELDS)[number], number>;
  /** Overrides per workspace: the playbooks a workspace viewed are not logged, so a per-view rate cannot be computed. */
  overrideRate: number | null;
  statusCounts: Record<(typeof STATUS_LABELS)[keyof typeof STATUS_LABELS], number>;
  notesByRole: Record<(typeof ROLE_NAMES)[number], number>;
}
export const V2_ACTIONS = ["going", "waitlist", "was_there"] as const;
export interface V2Stats {
  enabled: true; since: string | null; taps: number;
  byAction: Record<(typeof V2_ACTIONS)[number], number>;
  byExperience: Record<string, Record<(typeof V2_ACTIONS)[number], number>>;
}

/** Tiny aggregate queries behind a 60 s in-memory cache. Any failure answers `{enabled:false}` (cached 30 s) so the UI hides its panels. */
export function createStats(a: Analytics, now: () => number = Date.now) {
  const cache = new Map<string, { at: number; ttl: number; value: Promise<unknown> }>();
  function cached<T>(key: string, run: () => Promise<T>): Promise<T | Disabled> {
    if (!a.enabled) return Promise.resolve(DISABLED);
    const hit = cache.get(key);
    if (hit && now() - hit.at < hit.ttl) return hit.value as Promise<T | Disabled>;
    const entry = { at: now(), ttl: 60_000, value: undefined as unknown as Promise<unknown> };
    entry.value = run().catch((): Disabled => { entry.ttl = 30_000; return DISABLED; });
    cache.set(key, entry);
    return entry.value as Promise<T | Disabled>;
  }

  const trust = () => cached<TrustStats>("trust", async () => {
    const t = a.tableRef("playbook_runs");
    const day = "ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)";
    const checked = "IFNULL(claims_verified, 0) + IFNULL(claims_removed, 0)";
    const [r] = await a.query(`SELECT MIN(ts) AS since, COUNT(*) AS playbooks, SUM(${checked}) AS claims_checked, SUM(IFNULL(claims_removed, 0)) AS claims_removed,
      APPROX_QUANTILES(latency_ms, 2)[OFFSET(1)] AS median_latency_ms, SUM(IFNULL(sponsors_hidden, 0)) AS sponsors_hidden,
      COUNT(DISTINCT COALESCE(city_id, CONCAT(IFNULL(city, ''), '|', IFNULL(country, '')))) AS cities,
      COUNTIF(${day}) AS p24, SUM(IF(${day}, ${checked}, 0)) AS c24
      FROM ${t} WHERE ${WINDOW} AND error IS NULL`);
    const row = r ?? {};
    const claimsChecked = n(row.claims_checked), claimsRemoved = n(row.claims_removed), playbooks = n(row.playbooks);
    return {
      enabled: true as const, since: iso(row.since), playbooks, claimsChecked, claimsRemoved,
      removedRate: claimsChecked > 0 ? claimsRemoved / claimsChecked : null,
      medianLatencyMs: playbooks > 0 && row.median_latency_ms != null ? n(row.median_latency_ms) : null,
      sponsorsHidden: n(row.sponsors_hidden), cities: n(row.cities), last24h: { playbooks: n(row.p24), claimsChecked: n(row.c24) },
    };
  });

  const team = () => cached<TeamStats>("team", async () => {
    const t = a.tableRef("team_events");
    const rows = await a.query(`SELECT 'total' AS k, '' AS g, COUNT(*) AS n, COUNT(DISTINCT ws_hash) AS w, MIN(ts) AS since FROM ${t} WHERE ${WINDOW}
      UNION ALL SELECT 'override', IFNULL(override_field, ''), COUNT(*), 0, NULL FROM ${t} WHERE ${WINDOW} AND event = 'override' GROUP BY 2
      UNION ALL SELECT 'status', IFNULL(status_to, ''), COUNT(*), 0, NULL FROM ${t} WHERE ${WINDOW} AND event = 'status' GROUP BY 2
      UNION ALL SELECT 'role', IFNULL(role, ''), COUNT(*), 0, NULL FROM ${t} WHERE ${WINDOW} AND event = 'message' GROUP BY 2`);
    const overridesByField = { top_zone: 0, best_room: 0, support: 0 };
    const statusCounts = { Considering: 0, Confirmed: 0, "On hold": 0, Dropped: 0 };
    const notesByRole = { Manager: 0, "Booking agent": 0, Promoter: 0, "Brand team": 0, Other: 0 };
    let events = 0, workspaces = 0, since: string | null = null;
    for (const r of rows) {
      const g = String(r.g ?? ""), c = n(r.n);
      if (r.k === "total") { events = c; workspaces = n(r.w); since = iso(r.since); }
      else if (r.k === "override" && g in overridesByField) overridesByField[g as keyof typeof overridesByField] = c;
      else if (r.k === "status" && g in STATUS_LABELS) statusCounts[STATUS_LABELS[g as keyof typeof STATUS_LABELS]] = c;
      else if (r.k === "role" && g in notesByRole) notesByRole[g as keyof typeof notesByRole] = c;
    }
    const overrides = Object.values(overridesByField).reduce((x, y) => x + y, 0);
    return { enabled: true as const, since, workspaces, events, overridesByField, overrideRate: workspaces > 0 ? overrides / workspaces : null, statusCounts, notesByRole };
  });

  const v2 = () => cached<V2Stats>("v2", async () => {
    const t = a.tableRef("v2_outcome_taps");
    const rows = await a.query(`SELECT experience, action, COUNT(*) AS n, MIN(ts) AS since FROM ${t} WHERE ${WINDOW} GROUP BY experience, action`);
    const byAction = { going: 0, waitlist: 0, was_there: 0 };
    const byExperience: V2Stats["byExperience"] = {};
    let since: string | null = null;
    for (const r of rows) {
      const action = String(r.action ?? ""), exp = String(r.experience ?? "");
      if (!(action in byAction)) continue;
      const c = n(r.n);
      byAction[action as keyof typeof byAction] += c;
      (byExperience[exp] ??= { going: 0, waitlist: 0, was_there: 0 })[action as keyof typeof byAction] += c;
      const s = iso(r.since);
      if (s && (!since || s < since)) since = s;
    }
    return { enabled: true as const, since, taps: byAction.going + byAction.waitlist + byAction.was_there, byAction, byExperience };
  });

  return { trust, team, v2 };
}
export type Stats = ReturnType<typeof createStats>;
