export class BudgetExceededError extends Error {
  constructor(public readonly scope: "session" | "daily") {
    super(scope === "session" ? "Session Qloo budget exhausted" : "Daily Qloo budget exhausted");
  }
}

export class BudgetGuard {
  private readonly sessions = new Map<string, number>();
  private day = "";
  private dayCount = 0;
  private readonly perSession: number;
  private readonly perDay: number;
  private readonly now: () => number;

  constructor(opts: { perSession: number; perDay: number; now?: () => number }) {
    this.perSession = opts.perSession;
    this.perDay = opts.perDay;
    this.now = opts.now ?? Date.now;
  }

  private rollDay(): void {
    const today = new Date(this.now()).toISOString().slice(0, 10);
    if (today !== this.day) { this.day = today; this.dayCount = 0; }
  }

  reserve(sessionId: string): void {
    this.rollDay();
    const used = this.sessions.get(sessionId) ?? 0;
    if (used >= this.perSession) throw new BudgetExceededError("session");
    if (this.dayCount >= this.perDay) throw new BudgetExceededError("daily");
    this.sessions.set(sessionId, used + 1);
    this.dayCount += 1;
  }

  remaining(sessionId: string): { session: number; daily: number } {
    this.rollDay();
    return { session: this.perSession - (this.sessions.get(sessionId) ?? 0), daily: this.perDay - this.dayCount };
  }
}
