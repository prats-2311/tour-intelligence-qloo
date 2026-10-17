import type { TxDb } from "./web/usage.js";

export const PUBLIC_SESSION_PREFIX = "mcp-public-";
export const DEFAULT_PUBLIC_DAILY = 400;
/** Uncached Qloo calls one session may make: a cold board (~63) plus up to 6 hybrid playbooks (~16 each, ~11 with the describe cap). */
export const SESSION_QLOO_BUDGET = 160;

export class BudgetExceededError extends Error {
  constructor(public readonly scope: "session" | "daily" | "public") {
    super(scope === "session" ? "Session Qloo budget exhausted" : scope === "public" ? "Public demo Qloo budget exhausted" : "Daily Qloo budget exhausted");
  }
}

/** Global daily Qloo call count shared across instances and restarts. */
export interface DailyCountStore { tryIncrement(day: string, ceiling: number): Promise<boolean> }

/** Counter in Firestore doc qloo_usage/<YYYY-MM-DD>, same transaction shape as the gemini_usage store. */
export class FirestoreDailyCountStore implements DailyCountStore {
  constructor(private readonly opts: { db: TxDb; prefix?: string }) {}
  async tryIncrement(day: string, ceiling: number): Promise<boolean> {
    const ref = this.opts.db.doc(`${this.opts.prefix ?? "qloo_usage"}/${day}`);
    return this.opts.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const raw = snap.exists ? snap.data()?.count : 0;
      const count = typeof raw === "number" ? raw : 0;
      if (count >= ceiling) return false;
      tx.set(ref, { count: count + 1 });
      return true;
    });
  }
}

const STORE_TIMEOUT_MS = 1500;

export class BudgetGuard {
  private sessions = new Map<string, number>();
  private day = "";
  private dayCount = 0;
  private publicCount = 0;
  private readonly perSession: number;
  private readonly perDay: number;
  private readonly publicPerDay: number;
  private readonly now: () => number;
  private lastWarnAt = -Infinity;
  private readonly dailyStore: DailyCountStore | undefined;

  /** `publicPerDay` caps sessions whose id starts with `mcp-public-`; those calls also count toward `perDay`, and the public cap is checked first. */
  constructor(opts: { perSession: number; perDay: number; publicPerDay?: number; now?: () => number; dailyStore?: DailyCountStore }) {
    this.perSession = opts.perSession;
    this.perDay = opts.perDay;
    this.publicPerDay = opts.publicPerDay ?? DEFAULT_PUBLIC_DAILY;
    this.now = opts.now ?? Date.now;
    this.dailyStore = opts.dailyStore;
  }

  /** New UTC day: global, public and per-session counts all start over. */
  private rollDay(): void {
    const today = new Date(this.now()).toISOString().slice(0, 10);
    if (today !== this.day) { this.day = today; this.dayCount = 0; this.publicCount = 0; this.sessions = new Map(); }
  }

  reserve(sessionId: string): void {
    this.rollDay();
    const used = this.sessions.get(sessionId) ?? 0;
    if (used >= this.perSession) throw new BudgetExceededError("session");
    const isPublic = sessionId.startsWith(PUBLIC_SESSION_PREFIX);
    if (isPublic && this.publicCount >= this.publicPerDay) throw new BudgetExceededError("public");
    if (this.dayCount >= this.perDay) throw new BudgetExceededError("daily");
    this.sessions.set(sessionId, used + 1);
    this.dayCount += 1;
    if (isPublic) this.publicCount += 1;
  }

  /**
   * Shared daily count, run after the synchronous `reserve`. The store call is bounded (STORE_TIMEOUT_MS); on error or
   * timeout it falls back to the in-memory count and warns at most once a minute. A refusal releases the reservation and throws.
   */
  async persistDaily(sessionId: string): Promise<void> {
    if (!this.dailyStore) return;
    let allowed = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const attempt = this.dailyStore.tryIncrement(new Date(this.now()).toISOString().slice(0, 10), this.perDay);
      attempt.catch(() => undefined);
      allowed = await Promise.race([
        attempt,
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out after ${STORE_TIMEOUT_MS} ms`)), STORE_TIMEOUT_MS); }),
      ]);
    } catch (err) {
      const t = this.now();
      if (t - this.lastWarnAt >= 60_000) {
        this.lastWarnAt = t;
        console.warn("qloo daily count store failed; using the in-memory count", err instanceof Error ? err.message : String(err));
      }
    } finally {
      clearTimeout(timer);
    }
    if (!allowed) {
      this.release(sessionId);
      throw new BudgetExceededError("daily");
    }
  }

  private release(sessionId: string): void {
    const used = this.sessions.get(sessionId) ?? 0;
    if (used > 0) this.sessions.set(sessionId, used - 1);
    if (this.dayCount > 0) this.dayCount -= 1;
    if (sessionId.startsWith(PUBLIC_SESSION_PREFIX) && this.publicCount > 0) this.publicCount -= 1;
  }

  remaining(sessionId: string): { session: number; daily: number } {
    this.rollDay();
    return { session: this.perSession - (this.sessions.get(sessionId) ?? 0), daily: this.perDay - this.dayCount };
  }
}
