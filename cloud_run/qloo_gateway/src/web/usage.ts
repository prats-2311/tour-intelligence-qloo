export const TAVILY_CAPS = { perDay: 25, perMonth: 600 } as const;
type Caps = { perDay: number; perMonth: number };
type Result = { ok: true; day: number; month: number } | { ok: false; scope: "day" | "month" };
export interface UsageStore { tryIncrement(day: string, month: string): Promise<Result> }

function step(doc: { month: number; days: Record<string, number> }, day: string, caps: Caps): Result & { next?: typeof doc } {
  const d = doc.days[day] ?? 0;
  if (doc.month >= caps.perMonth) return { ok: false, scope: "month" };
  if (d >= caps.perDay) return { ok: false, scope: "day" };
  const next = { month: doc.month + 1, days: { ...doc.days, [day]: d + 1 } };
  return { ok: true, day: d + 1, month: next.month, next };
}

export class MemoryUsageStore implements UsageStore {
  private docs = new Map<string, { month: number; days: Record<string, number> }>();
  private readonly caps: Caps;
  constructor(caps: Caps = TAVILY_CAPS) { this.caps = caps; }
  async tryIncrement(day: string, month: string): Promise<Result> {
    const r = step(this.docs.get(month) ?? { month: 0, days: {} }, day, this.caps);
    if (r.ok && r.next) this.docs.set(month, r.next);
    return r.ok ? { ok: true, day: r.day, month: r.month } : r;
  }
}

export type TxDocRef = unknown;
export interface TxDb {
  doc(path: string): TxDocRef;
  runTransaction<T>(fn: (tx: { get(ref: TxDocRef): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>; set(ref: TxDocRef, data: Record<string, unknown>): void }) => Promise<T>): Promise<T>;
}

/** Counter in Firestore doc tavily_usage/<YYYY-MM> so caps survive restarts and span instances. */
export class FirestoreUsageStore implements UsageStore {
  private readonly db: TxDb;
  private readonly caps: Caps;
  constructor(opts: { db: TxDb; caps?: Caps }) { this.db = opts.db; this.caps = opts.caps ?? TAVILY_CAPS; }
  async tryIncrement(day: string, month: string): Promise<Result> {
    const ref = this.db.doc(`tavily_usage/${month}`);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const raw = snap.exists ? snap.data() ?? {} : {};
      const doc = { month: typeof raw.month === "number" ? raw.month : 0, days: (raw.days && typeof raw.days === "object" ? raw.days : {}) as Record<string, number> };
      const r = step(doc, day, this.caps);
      if (r.ok && r.next) tx.set(ref, r.next);
      return r.ok ? { ok: true as const, day: r.day, month: r.month } : r;
    });
  }
}
