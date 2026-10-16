import { numberTokens, tokenSupported } from "../claims/verify.js";
import type { StrategistContext } from "../types.js";

function collect(v: unknown, out: number[]): void {
  if (typeof v === "number") { if (Number.isFinite(v)) out.push(v); return; }
  if (Array.isArray(v)) { for (const x of v) collect(x, out); return; }
  if (v && typeof v === "object") for (const x of Object.values(v)) collect(x, out);
}

/** Raw number tokens in the answer that appear in no tool result and no board-context score (same match rules as verifyClaims). */
export function unsupportedNumbers(answer: string, toolData: unknown[], context: StrategistContext): string[] {
  const pool: number[] = [];
  collect(toolData, pool);
  for (const c of context.cities ?? []) collect([c.fanHeat, c.activation, c.winnability], pool);
  return numberTokens(answer).filter((t) => !tokenSupported(t, pool)).map((t) => t.raw);
}
