import { createHash } from "node:crypto";

/**
 * Optional BigQuery analytics. Enabled only when BQ_DATASET and GOOGLE_CLOUD_PROJECT are set; otherwise every call is a no-op.
 * Rows hold our own derived numbers and metadata only: never a Qloo payload (entity lists, names or affinities), never note text or people's names.
 * Logging is fire and forget: `track` never throws, never awaits, and failures are logged at most once a minute.
 */
export const BQ_TABLES = ["playbook_runs", "team_events", "v2_outcome_taps"] as const;
export type BqTable = (typeof BQ_TABLES)[number];
export type BqRow = Record<string, string | number | boolean | null>;
export interface BqField { name: string; type: "TIMESTAMP" | "STRING" | "INT64" | "BOOL"; mode: "REQUIRED" | "NULLABLE" }

const f = (name: string, type: BqField["type"], mode: BqField["mode"] = "NULLABLE"): BqField => ({ name, type, mode });
/** Table schemas. `scripts/bq_setup.sh` creates the tables from `scripts/bq_schemas/*.json`, which a test keeps equal to these. Tables are never created at runtime. */
export const BQ_SCHEMAS: Record<BqTable, BqField[]> = {
  playbook_runs: [
    f("ts", "TIMESTAMP", "REQUIRED"), f("session_hash", "STRING"), f("source", "STRING"), f("city_id", "STRING"), f("city", "STRING"), f("country", "STRING"), f("verdict", "STRING"),
    f("cards_ok", "INT64"), f("cards_empty", "INT64"), f("claims_verified", "INT64"), f("claims_removed", "INT64"), f("sponsors_hidden", "INT64"),
    f("qloo_calls", "INT64"), f("cache_hits", "INT64"), f("gemini_calls", "INT64"), f("latency_ms", "INT64"), f("narrative_status", "STRING"), f("error", "STRING"),
  ],
  team_events: [
    f("ts", "TIMESTAMP", "REQUIRED"), f("ws_hash", "STRING"), f("event", "STRING"), f("city_id", "STRING"), f("city", "STRING"), f("country", "STRING"),
    f("card_kind", "STRING"), f("role", "STRING"), f("status_to", "STRING"), f("override_field", "STRING"), f("overrode_qloo", "BOOL"),
  ],
  v2_outcome_taps: [f("ts", "TIMESTAMP", "REQUIRED"), f("session_hash", "STRING"), f("experience", "STRING"), f("action", "STRING")],
};

export const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

/** The slice of the BigQuery client this module uses; tests pass a fake. */
export interface BqClientLike {
  insert(table: BqTable, rows: BqRow[]): Promise<void>;
  query(sql: string): Promise<Array<Record<string, unknown>>>;
}

export interface AnalyticsOptions {
  project: string;
  dataset: string;
  client: BqClientLike;
  now?: () => number;
  maxBatch?: number;
  flushMs?: number;
  log?: (msg: string) => void;
}

export class Analytics {
  readonly enabled: boolean;
  readonly project: string;
  readonly dataset: string;
  private readonly client: BqClientLike | null;
  private readonly now: () => number;
  private readonly maxBatch: number;
  private readonly flushMs: number;
  private readonly log: (msg: string) => void;
  private buffers = new Map<BqTable, BqRow[]>();
  private timers = new Map<BqTable, ReturnType<typeof setTimeout>>();
  private lastErrorAt = -Infinity;

  constructor(o: AnalyticsOptions | null) {
    this.enabled = !!o;
    this.project = o?.project ?? "";
    this.dataset = o?.dataset ?? "";
    this.client = o?.client ?? null;
    this.now = o?.now ?? Date.now;
    this.maxBatch = o?.maxBatch ?? 20;
    this.flushMs = o?.flushMs ?? 5000;
    this.log = o?.log ?? ((m) => console.warn(m));
  }

  /** Fully qualified, quoted table name for a query. Names come from the fixed list, never from input. */
  tableRef(t: BqTable): string { return `\`${this.project}.${this.dataset}.${t}\``; }

  /** Buffers one row (stamped with `ts`). Never throws and never blocks the caller. */
  track(table: BqTable, row: BqRow): void {
    if (!this.enabled) return;
    try {
      const buf = this.buffers.get(table) ?? [];
      buf.push({ ts: new Date(this.now()).toISOString(), ...row });
      this.buffers.set(table, buf);
      if (buf.length >= this.maxBatch) { void this.flushTable(table); return; }
      if (!this.timers.has(table)) {
        const t = setTimeout(() => { this.timers.delete(table); void this.flushTable(table); }, this.flushMs);
        t.unref?.();
        this.timers.set(table, t);
      }
    } catch (err) { this.fail("buffer", err); }
  }

  async flush(): Promise<void> { await Promise.all(BQ_TABLES.map((t) => this.flushTable(t))); }

  private async flushTable(table: BqTable): Promise<void> {
    const timer = this.timers.get(table);
    if (timer) { clearTimeout(timer); this.timers.delete(table); }
    const rows = this.buffers.get(table);
    if (!rows?.length || !this.client) return;
    this.buffers.set(table, []);
    try { await this.client.insert(table, rows); } catch (err) { this.fail(`insert ${table}`, err); }
  }

  /** Runs a read query; rejects on failure (callers turn that into `{enabled:false}`). */
  async query(sql: string): Promise<Array<Record<string, unknown>>> {
    if (!this.client) throw new Error("analytics disabled");
    try { return await this.client.query(sql); } catch (err) { this.fail("query", err); throw err; }
  }

  private fail(what: string, err: unknown): void {
    const t = this.now();
    if (t - this.lastErrorAt < 60_000) return;
    this.lastErrorAt = t;
    try { this.log(`[analytics] ${what} failed: ${err instanceof Error ? err.message : String(err)}`); } catch { /* logging must not throw */ }
  }
}

export const DISABLED_ANALYTICS = new Analytics(null);

/** The real client, built lazily so a disabled gateway never loads the BigQuery library. */
async function realClient(project: string, dataset: string, location: string): Promise<BqClientLike> {
  const { BigQuery } = await import("@google-cloud/bigquery");
  const bq = new BigQuery({ projectId: project });
  return {
    async insert(table, rows) { await bq.dataset(dataset).table(table).insert(rows, { ignoreUnknownValues: true }); },
    async query(sql) { const [rows] = await bq.query({ query: sql, location }); return rows as Array<Record<string, unknown>>; },
  };
}

/** Enabled only with both BQ_DATASET and GOOGLE_CLOUD_PROJECT. The client loads on first use; if that fails, calls log once and do nothing. */
export function createAnalytics(env: NodeJS.ProcessEnv, opts: { client?: BqClientLike; now?: () => number; flushMs?: number; maxBatch?: number } = {}): Analytics {
  const dataset = env.BQ_DATASET?.trim();
  const project = env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!dataset || !project) return DISABLED_ANALYTICS;
  if (!/^[A-Za-z0-9_]{1,128}$/.test(dataset) || !/^[a-z0-9.:-]{1,100}$/.test(project)) return DISABLED_ANALYTICS;
  const location = env.BQ_LOCATION?.trim() || "us-central1";
  let loaded: Promise<BqClientLike> | undefined;
  const lazy: BqClientLike = {
    insert: async (t, r) => (await (loaded ??= realClient(project, dataset, location))).insert(t, r),
    query: async (s) => (await (loaded ??= realClient(project, dataset, location))).query(s),
  };
  return new Analytics({ project, dataset, client: opts.client ?? lazy, ...(opts.now ? { now: opts.now } : {}), ...(opts.flushMs ? { flushMs: opts.flushMs } : {}), ...(opts.maxBatch ? { maxBatch: opts.maxBatch } : {}) });
}
