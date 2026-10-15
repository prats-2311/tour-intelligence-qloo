import { createHash } from "node:crypto";
import type { QlooEnvelope } from "./types.js";

const DAY = 86_400_000;

function normalise(value: unknown): unknown {
  if (typeof value === "string") return value.trim().toLowerCase().replace(/\s+/g, " ");
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value as object).sort().map((k) => [k, normalise((value as Record<string, unknown>)[k])]));
  }
  return value;
}

export function cacheKey(tool: string, args: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify({ tool, args: normalise(args) })).digest("hex");
}

export function ttlMs(tool: string): number {
  return tool === "qloo_trends" ? DAY : 7 * DAY;
}

export type CacheHit = { envelope: QlooEnvelope; createdAt: number; stale: boolean };

export interface Cache {
  get(key: string, opts?: { allowStale?: boolean }): Promise<CacheHit | null>;
  put(key: string, tool: string, envelope: QlooEnvelope): Promise<void>;
}

export class MemoryCache implements Cache {
  private readonly store = new Map<string, { tool: string; envelope: QlooEnvelope; createdAt: number }>();
  constructor(private readonly now: () => number = Date.now) {}

  async get(key: string, opts: { allowStale?: boolean } = {}): Promise<CacheHit | null> {
    const row = this.store.get(key);
    if (!row) return null;
    const stale = this.now() - row.createdAt > ttlMs(row.tool);
    if (stale && !opts.allowStale) return null;
    return { envelope: row.envelope, createdAt: row.createdAt, stale };
  }

  async put(key: string, tool: string, envelope: QlooEnvelope): Promise<void> {
    this.store.set(key, { tool, envelope, createdAt: this.now() });
  }
}

export interface BigQueryLike {
  query(opts: { query: string; params: Record<string, unknown> }): Promise<[Array<Record<string, unknown>>, ...unknown[]]>;
  dataset(id: string): { table(id: string): { insert(rows: object[]): Promise<unknown> } };
}

export class BigQueryCache implements Cache {
  private readonly bq: BigQueryLike;
  private readonly dataset: string;
  private readonly table: string;
  private readonly now: () => number;

  constructor(opts: { bq: BigQueryLike; dataset: string; table?: string; now?: () => number }) {
    this.bq = opts.bq;
    this.dataset = opts.dataset;
    this.table = opts.table ?? "qloo_cache";
    this.now = opts.now ?? Date.now;
  }

  async get(key: string, opts: { allowStale?: boolean } = {}): Promise<CacheHit | null> {
    const [rows] = await this.bq.query({
      query: `SELECT tool, envelope, created_at_ms FROM \`${this.dataset}.${this.table}\` WHERE cache_key = @key ORDER BY created_at_ms DESC LIMIT 1`,
      params: { key },
    });
    const row = rows[0];
    if (!row) return null;
    const createdAt = Number(row.created_at_ms);
    const stale = this.now() - createdAt > ttlMs(String(row.tool));
    if (stale && !opts.allowStale) return null;
    const envelope = typeof row.envelope === "string" ? (JSON.parse(row.envelope) as QlooEnvelope) : (row.envelope as QlooEnvelope);
    return { envelope, createdAt, stale };
  }

  async put(key: string, tool: string, envelope: QlooEnvelope): Promise<void> {
    await this.bq.dataset(this.dataset).table(this.table).insert([
      { cache_key: key, tool, envelope: JSON.stringify(envelope), created_at_ms: this.now() },
    ]);
  }
}
