export const PUBLIC_SESSION_PREFIX = "mcp-public-";
export const DEFAULT_PUBLIC_DAILY = 400;
/** Uncached Qloo calls one session may make: a cold board (~63) plus up to 6 hybrid playbooks (~16 each, ~11 with the describe cap). */
export const SESSION_QLOO_BUDGET = 160;

export class BudgetExceededError extends Error {
  constructor(public readonly scope: "session" | "daily" | "public") {
    super(scope === "session" ? "Session Qloo budget exhausted" : scope === "public" ? "Public demo Qloo budget exhausted" : "Daily Qloo budget exhausted");
  }
}

export class BudgetGuard {
  private sessions = new Map<string, number>();
  private day = "";
  private dayCount = 0;
  private publicCount = 0;
  private readonly perSession: number;
  private readonly perDay: number;
  private readonly publicPerDay: number;
  private readonly now: () => number;

  /** `publicPerDay` caps sessions whose id starts with `mcp-public-`; those calls also count toward `perDay`, and the public cap is checked first. */
  constructor(opts: { perSession: number; perDay: number; publicPerDay?: number; now?: () => number }) {
    this.perSession = opts.perSession;
    this.perDay = opts.perDay;
    this.publicPerDay = opts.publicPerDay ?? DEFAULT_PUBLIC_DAILY;
    this.now = opts.now ?? Date.now;
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

  remaining(sessionId: string): { session: number; daily: number } {
    this.rollDay();
    return { session: this.perSession - (this.sessions.get(sessionId) ?? 0), daily: this.perDay - this.dayCount };
  }
}
