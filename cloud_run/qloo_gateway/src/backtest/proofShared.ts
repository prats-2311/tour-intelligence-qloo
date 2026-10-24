import { cacheKey } from "../cache.js";
import { generateJson, type GenerateFn } from "../narrative/gemini.js";
import type { CallResult, QlooCaller } from "../qlooCall.js";
import type { QlooEnvelope } from "../types.js";
import { GatewayAuthError } from "./run.js";
import { StopMonitor, StopRun } from "./proofStats.js";

/** One Qloo tool call, as the existing gateway HTTP caller makes it. */
export type CallTool = (name: string, args: Record<string, unknown>, sessionId: string) => Promise<QlooEnvelope>;

/**
 * Wraps a caller with the protocol's stop rule: no call is sent once the run has stopped, every call's outcome is recorded
 * (counts, 429, rate/quota/limit text, error rate), and a stop surfaces as `StopRun`. Only error envelopes and thrown errors are
 * scanned for limit text; a stale answer stops the run.
 */
export function monitoredCallTool(inner: CallTool, monitor: StopMonitor): CallTool {
  return async (name, args, sessionId) => {
    monitor.assertOk();
    let envelope: QlooEnvelope;
    try {
      envelope = await inner(name, args, sessionId);
    } catch (err) {
      if (err instanceof GatewayAuthError) { monitor.record("qloo", { ok: false, text: "auth" }); monitor.halt(err.message); monitor.assertOk(); }
      monitor.record("qloo", { ok: false, text: String((err as Error)?.message ?? err) });
      monitor.assertOk();
      throw err;
    }
    // The gateway serves a stale cache entry only after a live call failed, so a stale answer is an upstream error that was swallowed.
    if (envelope.stale === true) { monitor.record("qloo", { ok: false, text: "stale" }); monitor.halt(`qloo stale answer served after an upstream failure (${name})`); monitor.assertOk(); }
    const isError = envelope.status === "error";
    // Only error envelopes are scanned for limit text; a summary on an ok or partial answer is data.
    const text = isError ? [envelope.summary, envelope.error?.code, envelope.error?.recovery, (envelope.error as { message?: unknown } | undefined)?.message].filter((x): x is string => typeof x === "string").join(" ") : undefined;
    monitor.record("qloo", { ok: !isError, ...(text ? { text } : {}) });
    monitor.assertOk();
    return envelope;
  };
}

const MEMO_STATUSES = new Set(["ok", "empty", "partial", "degraded"]);

/**
 * A per-artist in-memory layer over a CallTool that presents the pipeline's QlooCaller. The second board pass (with extra cities) repeats
 * the first pass's calls; those are served here, so only new cities cost a request. Errors are never memoised.
 */
export function memoQloo(callTool: CallTool): QlooCaller & { stats: { hits: number; misses: number } } {
  const memo = new Map<string, QlooEnvelope>();
  const inflight = new Map<string, Promise<QlooEnvelope>>();
  const stats = { hits: 0, misses: 0 };
  return {
    stats,
    async call(tool, args, sessionId): Promise<CallResult> {
      const key = cacheKey(tool, args);
      const hit = memo.get(key);
      if (hit) { stats.hits += 1; return { envelope: hit, cacheKey: key, cached: true, stale: false }; }
      const pending = inflight.get(key);
      if (pending) { stats.hits += 1; return { envelope: await pending, cacheKey: key, cached: true, stale: false }; }
      stats.misses += 1;
      const p = callTool(tool, args, sessionId);
      inflight.set(key, p);
      try {
        const envelope = await p;
        if (MEMO_STATUSES.has(envelope.status)) memo.set(key, envelope);
        return { envelope, cacheKey: key, cached: false, stale: false };
      } finally { inflight.delete(key); }
    },
  };
}

export const isPermutation = (labels: string[], answer: unknown): answer is string[] =>
  Array.isArray(answer) && answer.length === labels.length && answer.every((x) => typeof x === "string")
  && new Set(answer).size === labels.length && labels.every((l) => (answer as string[]).includes(l));

export interface RankAnswer { order: string[] | null; attempts: number; model?: string; reason?: "not_a_permutation" | "gemini_error" }
export interface PermutationRanker { rank(prompt: string, labels: string[]): Promise<RankAnswer> }

/**
 * Gemini ranking at temperature 0.2 with a response schema that forces each label to be one of the given strings. A non-permutation is retried
 * once; a second miss is "no answer". A failed Vertex call (every model) is "no answer" without a retry; the stop rule watches every real call.
 */
const GEMINI_BACKOFF_MS = [2000, 6000];
const TRANSIENT = /\b(404|429|5\d\d)\b/;

/**
 * Amendment 3: a Gemini call failing with HTTP 404, 429, 5xx or a non-JSON body is retried up to twice (2 s, then 6 s) on the same model before the
 * fallback model is tried. Every attempt is recorded in the monitor (counts only; Gemini outcomes are never in the error rate).
 */
export function retryingGenerate(opts: { generate: GenerateFn; monitor: StopMonitor; sleep?: (ms: number) => Promise<void> }): GenerateFn {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const { monitor } = opts;
  return async (model, body) => {
    for (let attempt = 0; ; attempt += 1) {
      monitor.assertOk();
      try {
        const r = await opts.generate(model, body);
        monitor.record("gemini", { ok: true });
        return r;
      } catch (err) {
        if (err instanceof StopRun) throw err;
        const message = String((err as Error)?.message ?? err);
        monitor.record("gemini", { ok: false, text: message });
        const transient = err instanceof SyntaxError || TRANSIENT.test(message);
        if (!transient || attempt >= GEMINI_BACKOFF_MS.length) throw err instanceof SyntaxError ? new Error(`non-JSON body from Vertex: ${message}`) : err;
        await sleep(GEMINI_BACKOFF_MS[attempt]!);
      }
    }
  };
}

export function createPermutationRanker(opts: { generate: GenerateFn; models: string[]; monitor: StopMonitor; sleep?: (ms: number) => Promise<void> }): PermutationRanker {
  const { monitor } = opts;
  const generate = retryingGenerate(opts);
  return {
    async rank(prompt, labels) {
      const body = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json", temperature: 0.2,
          responseSchema: { type: "OBJECT", required: ["ranking"], properties: { ranking: { type: "ARRAY", items: { type: "STRING", enum: labels } } } },
        },
      };
      let model: string | undefined;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        let json: unknown;
        try {
          const r = await generateJson(generate, opts.models, body, { beforeAttempt: () => monitor.assertOk() });
          model = r.model;
          json = r.json;
        } catch (err) {
          if (err instanceof StopRun) throw err;
          monitor.assertOk();
          if (!(err instanceof SyntaxError)) {
            // Every model failed: an infrastructure failure, not "no answer". The run stops and says so.
            monitor.halt(`all Gemini models failed (${String((err as Error)?.message ?? err)})`);
            monitor.assertOk();
          }
        }
        const answer = (json as { ranking?: unknown } | null | undefined)?.ranking;
        if (isPermutation(labels, answer)) return { order: answer, attempts: attempt, ...(model ? { model } : {}) };
      }
      return { order: null, attempts: 2, ...(model ? { model } : {}), reason: "not_a_permutation" };
    },
  };
}

const regionNames = (() => { try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch { return undefined; } })();
/** English country name for an ISO-2 code; the code itself when unknown. */
export function countryLabel(code: string): string {
  try {
    const n = regionNames?.of(code);
    return n && n !== code && !/^unknown region$/i.test(n) ? n : code;
  } catch { return code; }
}
