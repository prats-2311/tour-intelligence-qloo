import { createHash } from "node:crypto";

export const sha256Hex = (s: string): string => createHash("sha256").update(s).digest("hex");

export const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export interface SignResult { wins: number; losses: number; ties: number; n: number; p: number }

const EPS = 1e-9;

/** Two-sided exact binomial sign test on paired scores [ours, theirs]; ties are dropped. No non-tied pair gives p = 1. */
export function signTest(pairs: Array<readonly [number, number]>): SignResult {
  let wins = 0, losses = 0, ties = 0;
  for (const [a, b] of pairs) {
    if (Math.abs(a - b) <= EPS) ties += 1;
    else if (a > b) wins += 1;
    else losses += 1;
  }
  const n = wins + losses;
  if (n === 0) return { wins, losses, ties, n, p: 1 };
  const k = Math.min(wins, losses);
  let tail = 0, c = 1; // c = C(n, i)
  for (let i = 0; i <= k; i += 1) { tail += c; c = (c * (n - i)) / (i + 1); }
  return { wins, losses, ties, n, p: Math.min(1, (2 * tail) / 2 ** n) };
}

export type CallKind = "qloo" | "gemini";
export interface CallOutcome { ok: boolean; text?: string }

export class StopRun extends Error {
  constructor(public readonly reason: string) { super(`stopped: ${reason}`); this.name = "StopRun"; }
}

const LIMIT_TEXT = /quota|rate.?limit|limit/i;
const HTTP_429 = /\b429\b/;
const BUDGET_CODE = /\bBUDGET\b/;

/**
 * The protocol's stop rule. After every Qloo or Gemini call: a 429, any error or non-ok response text matching /quota|rate.?limit|limit/i, or an
 * error rate above 10% over the last `window` calls (once at least `minCalls` have been seen) sets `stopped` (first reason wins).
 * Callers call `assertOk()` before each call so nothing is sent after a stop.
 */
export class StopMonitor {
  readonly counts = { qloo: 0, gemini: 0, qlooErrors: 0, geminiErrors: 0 };
  stopped: string | undefined;
  private recent: boolean[] = [];

  constructor(private readonly opts: { window?: number; minCalls?: number; maxErrorRate?: number } = {}) {}

  record(kind: CallKind, outcome: CallOutcome): void {
    this.counts[kind] += 1;
    if (!outcome.ok) this.counts[kind === "qloo" ? "qlooErrors" : "geminiErrors"] += 1;
    const window = this.opts.window ?? 20;
    this.recent.push(outcome.ok);
    if (this.recent.length > window) this.recent.shift();
    if (this.stopped) return;
    const text = outcome.text ?? "";
    if (HTTP_429.test(text)) this.stopped = `${kind} HTTP 429: ${text.slice(0, 160)}`;
    else if (BUDGET_CODE.test(text)) this.stopped = `${kind} session budget exhausted: ${text.slice(0, 160)}`;
    else if (LIMIT_TEXT.test(text)) this.stopped = `${kind} response mentions a quota or limit: ${text.slice(0, 160)}`;
    else if (this.recent.length >= (this.opts.minCalls ?? 10)) {
      const errors = this.recent.filter((ok) => !ok).length;
      if (errors / this.recent.length > (this.opts.maxErrorRate ?? 0.1)) this.stopped = `error rate ${errors}/${this.recent.length} over the last ${this.recent.length} calls`;
    }
  }

  /** Stop for a reason that is not a call outcome (for example a rejected identity token). The first reason wins. */
  halt(reason: string): void { this.stopped ??= reason; }

  assertOk(): void {
    if (this.stopped) throw new StopRun(this.stopped);
  }
}
