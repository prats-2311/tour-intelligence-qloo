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

/** Days a non-trends response stays fresh: QLOO_CACHE_TTL_DAYS, default 45 so the cache outlasts the judging window. */
function cacheTtlDays(): number {
  const n = Number(process.env.QLOO_CACHE_TTL_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 45;
}

export function ttlMs(tool: string): number {
  return tool === "qloo_trends" ? 7 * DAY : cacheTtlDays() * DAY;
}

export type CacheHit = { tool: string; envelope: QlooEnvelope; createdAt: number; stale: boolean };

export interface Cache {
  get(key: string, opts?: { allowStale?: boolean }): Promise<CacheHit | null>;
  put(key: string, tool: string, envelope: QlooEnvelope, createdAt?: number): Promise<void>;
}

export class MemoryCache implements Cache {
  private readonly store = new Map<string, { tool: string; envelope: QlooEnvelope; createdAt: number }>();
  constructor(private readonly now: () => number = Date.now, private readonly maxEntries = 2000) {}

  async get(key: string, opts: { allowStale?: boolean } = {}): Promise<CacheHit | null> {
    const row = this.store.get(key);
    if (!row) return null;
    const stale = this.now() - row.createdAt > ttlMs(row.tool);
    if (stale && !opts.allowStale) return null;
    this.store.delete(key);
    this.store.set(key, row); // refresh LRU recency
    return { tool: row.tool, envelope: row.envelope, createdAt: row.createdAt, stale };
  }

  async put(key: string, tool: string, envelope: QlooEnvelope, createdAt: number = this.now()): Promise<void> {
    this.store.delete(key);
    this.store.set(key, { tool, envelope, createdAt });
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value as string;
      this.store.delete(oldest);
    }
  }
}

export interface FirestoreLike {
  collection(name: string): {
    doc(id: string): {
      get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
      set(data: Record<string, unknown>): Promise<unknown>;
    };
  };
}

export class FirestoreCache implements Cache {
  private readonly db: FirestoreLike;
  private readonly collection: string;
  private readonly now: () => number;
  private readonly staleGraceMs: number;

  constructor(opts: { db: FirestoreLike; collection?: string; now?: () => number; staleGraceMs?: number }) {
    this.db = opts.db;
    this.collection = opts.collection ?? "qloo_cache";
    this.now = opts.now ?? Date.now;
    this.staleGraceMs = opts.staleGraceMs ?? 7 * DAY;
  }

  async get(key: string, opts: { allowStale?: boolean } = {}): Promise<CacheHit | null> {
    const snap = await this.db.collection(this.collection).doc(key).get();
    const row = snap.exists ? snap.data() : undefined;
    if (!row) return null;
    const createdAt = Number(row.createdAtMs);
    if (!Number.isFinite(createdAt) || typeof row.envelope !== "string") return null;
    const stale = this.now() - createdAt > ttlMs(String(row.tool));
    if (stale && !opts.allowStale) return null;
    return { tool: String(row.tool), envelope: JSON.parse(row.envelope) as QlooEnvelope, createdAt, stale };
  }

  async put(key: string, tool: string, envelope: QlooEnvelope, createdAt: number = this.now()): Promise<void> {
    await this.db.collection(this.collection).doc(key).set({
      tool, envelope: JSON.stringify(envelope), createdAtMs: createdAt,
      expireAt: new Date(createdAt + ttlMs(tool) + this.staleGraceMs),
    });
  }
}

export class TieredCache implements Cache {
  private readonly l1: Cache;
  private readonly l2: Cache;
  private readonly onError: (err: unknown) => void;

  constructor(opts: { l1: Cache; l2: Cache; onError?: (err: unknown) => void }) {
    this.l1 = opts.l1;
    this.l2 = opts.l2;
    this.onError = opts.onError ?? ((err) => console.warn("qloo cache L2 error:", (err as Error).message));
  }

  async get(key: string, opts: { allowStale?: boolean } = {}): Promise<CacheHit | null> {
    const hit = await this.l1.get(key, opts);
    if (hit) return hit;
    let remote: CacheHit | null = null;
    try { remote = await this.l2.get(key, opts); } catch (err) { this.onError(err); return null; }
    if (remote) await this.l1.put(key, remote.tool, remote.envelope, remote.createdAt);
    return remote;
  }

  async put(key: string, tool: string, envelope: QlooEnvelope, createdAt?: number): Promise<void> {
    await this.l1.put(key, tool, envelope, createdAt);
    try { await this.l2.put(key, tool, envelope, createdAt); } catch (err) { this.onError(err); }
  }
}
