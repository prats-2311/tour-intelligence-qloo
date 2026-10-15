import { BudgetExceededError, type BudgetGuard } from "./budget.js";
import { cacheKey, type Cache } from "./cache.js";
import type { QlooEnvelope } from "./types.js";
import { validateToolCall } from "./validate.js";

export interface CallResult { envelope: QlooEnvelope; cacheKey: string; cached: boolean; stale: boolean }
export interface QlooCaller { call(tool: string, args: Record<string, unknown>, sessionId: string): Promise<CallResult> }

const CACHEABLE = new Set(["ok", "empty", "partial", "degraded"]);
const MAX_RETRIES = 2;

export function createQlooCaller(deps: {
  mcp: { callTool(name: string, args: Record<string, unknown>): Promise<QlooEnvelope> };
  cache: Cache;
  budget: BudgetGuard;
  sleep?: (ms: number) => Promise<void>;
}): QlooCaller {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const inflight = new Map<string, Promise<CallResult>>();

  async function execute(tool: string, args: Record<string, unknown>, key: string, sessionId: string): Promise<CallResult> {
    const hit = await deps.cache.get(key);
    if (hit) return { envelope: hit.envelope, cacheKey: key, cached: true, stale: false };

    try {
      deps.budget.reserve(sessionId);
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        const recovery = err.scope === "session" ? "Session limit reached — try the showcase tour." : "Daily limit reached — try the showcase tour.";
        return { envelope: { operation: tool.replace(/^qloo_/, ""), status: "error", summary: recovery, error: { code: "BUDGET", retryable: false, recovery } }, cacheKey: key, cached: false, stale: false };
      }
      throw err;
    }

    let envelope = await deps.mcp.callTool(tool, args);
    for (let attempt = 0; attempt < MAX_RETRIES && envelope.status === "error" && envelope.error?.retryable; attempt += 1) {
      await sleep(250 * 2 ** attempt);
      envelope = await deps.mcp.callTool(tool, args);
    }

    if (CACHEABLE.has(envelope.status)) {
      await deps.cache.put(key, tool, envelope);
      return { envelope, cacheKey: key, cached: false, stale: false };
    }
    if (envelope.status === "error") {
      const stale = await deps.cache.get(key, { allowStale: true });
      if (stale) return { envelope: stale.envelope, cacheKey: key, cached: true, stale: true };
    }
    return { envelope, cacheKey: key, cached: false, stale: false };
  }

  return {
    async call(tool, args, sessionId) {
      const valid = validateToolCall(tool, args);
      if (!valid.ok) throw new Error(valid.error);
      const key = cacheKey(valid.name, valid.args);
      const existing = inflight.get(key);
      if (existing) return existing;
      const promise = execute(valid.name, valid.args, key, sessionId).finally(() => inflight.delete(key));
      inflight.set(key, promise);
      return promise;
    },
  };
}
