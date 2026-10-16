import { BudgetExceededError, type BudgetGuard } from "../budget.js";
import type { UsageStore } from "../web/usage.js";

export interface CeilingDeps { ceiling: BudgetGuard; dailyUsage?: UsageStore; now?: () => number }

/** Reserve one Gemini attempt: the in-memory per-session limit, then the persisted daily count (shared across instances). */
export function reserveAttempt(deps: CeilingDeps, sessionId: string): () => Promise<void> {
  return async () => {
    deps.ceiling.reserve(sessionId);
    if (!deps.dailyUsage) return;
    const day = new Date((deps.now ?? Date.now)()).toISOString().slice(0, 10);
    if (!(await deps.dailyUsage.tryIncrement(day, day.slice(0, 7))).ok) throw new BudgetExceededError("daily");
  };
}
