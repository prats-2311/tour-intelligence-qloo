import { numberTokens, tokenSupported } from "../claims/verify.js";
import type { StrategistContext, UserDocument } from "../types.js";

// Values under these keys are 0-1 scores or signed over/under-index values (shared taste, demographics): never percentages.
const SCORE_KEYS = new Set(["sharedTaste", "age", "gender"]);

function collect(v: unknown, out: number[], scores: number[] = [], inScore = false): void {
  if (typeof v === "number") { if (Number.isFinite(v)) (inScore ? scores : out).push(v); return; }
  if (Array.isArray(v)) { for (const x of v) collect(x, out, scores, inScore); return; }
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) collect(x, out, scores, inScore || SCORE_KEYS.has(k));
}

// Markdown list markers ("1.", "2)", "- 3.", "**4.**") at line start and "Step N" ordinals are structure, not claimed figures.
const LIST_MARKER = /^[ \t]*(?:[-*+][ \t]+)?\**\d{1,2}[.)]\**(?=[ \t])/gm;
const STEP_ORDINAL = /\bsteps?\s+\d{1,2}\b/gi;
const stripStructure = (answer: string): string => answer.replace(LIST_MARKER, " ").replace(STEP_ORDINAL, " ");

const CITE = /\[doc:([A-Za-z0-9_-]{1,40}) p\.(\d{1,4})\]/g;
// A sentence ends at . ! ? or a line break; a citation right after the full stop still belongs to that sentence.
const SENTENCES = /\n|(?<=[.!?])[ \t]+(?!\[doc:)/;

function pageNumbers(documents: UserDocument[], id: string, n: number): number[] {
  const page = documents.find((d) => d.id === id)?.pages.find((p) => p.n === n);
  const vals = page ? numberTokens(page.text).map((t) => t.value) : [];
  return [...vals, ...vals.map((v) => -v)];
}

/**
 * Raw number tokens in the answer that are unsupported (same match rules as verifyClaims).
 * A sentence that cites `[doc:id p.n]` is checked only against the numbers on those pages of the user's documents; every other sentence only against tool results and board-context scores. Neither source ever vouches for the other.
 */
export function unsupportedNumbers(answer: string, toolData: unknown[], context: StrategistContext, documents: UserDocument[] = [], userTexts: string[] = []): string[] {
  const pool: number[] = [];
  const scores: number[] = [];
  collect(toolData, pool, scores);
  // Prose drops the minus sign of coordinates (-118.26 -> "118.26"), so non-score negatives also match by absolute value.
  for (const v of [...pool]) if (v < 0) pool.push(-v);
  for (const c of context.cities ?? []) collect([c.fanHeat, c.activation, c.winnability], pool);
  // Numbers the user typed ("fans aged 25-29") are theirs, not claims; they support the plain (non-cited) sentences.
  for (const t of userTexts) for (const tok of numberTokens(t)) pool.push(tok.value);
  const flagged: string[] = [];
  for (const sentence of stripStructure(answer).split(SENTENCES)) {
    const cites = [...sentence.matchAll(CITE)];
    const text = sentence.replace(CITE, " ");
    // A percent rendering is only supported by non-score values; plain numbers by any value.
    const evidence = cites.length > 0 ? cites.flatMap((c) => pageNumbers(documents, c[1]!, Number(c[2]))) : null;
    for (const t of numberTokens(text)) {
      if (!tokenSupported(t, evidence ?? (t.percent ? pool : [...pool, ...scores]))) flagged.push(t.raw);
    }
  }
  return flagged;
}
