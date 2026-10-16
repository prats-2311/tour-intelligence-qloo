import { numberTokens, tokenSupported } from "../claims/verify.js";
import type { StrategistContext } from "../types.js";

// Values under these keys are 0-1 scores or signed over/under-index values (shared taste, demographics): never percentages.
const SCORE_KEYS = new Set(["sharedTaste", "age", "gender"]);

function collect(v: unknown, out: number[], scores: number[] = [], inScore = false): void {
  if (typeof v === "number") { if (Number.isFinite(v)) (inScore ? scores : out).push(v); return; }
  if (Array.isArray(v)) { for (const x of v) collect(x, out, scores, inScore); return; }
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) collect(x, out, scores, inScore || SCORE_KEYS.has(k));
}

/** Raw number tokens in the answer that appear in no tool result and no board-context score (same match rules as verifyClaims). */
export function unsupportedNumbers(answer: string, toolData: unknown[], context: StrategistContext): string[] {
  const pool: number[] = [];
  const scores: number[] = [];
  collect(toolData, pool, scores);
  for (const c of context.cities ?? []) collect([c.fanHeat, c.activation, c.winnability], pool);
  // A percent rendering is only supported by non-score values; plain numbers by any value.
  return numberTokens(answer).filter((t) => !tokenSupported(t, t.percent ? pool : [...pool, ...scores])).map((t) => t.raw);
}
