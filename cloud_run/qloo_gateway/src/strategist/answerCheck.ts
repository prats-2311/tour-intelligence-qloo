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

// Strings in the data (brands, venues, places) whose digits are part of a name ("Forever 21"), not a claimed figure.
function collectNames(v: unknown, out: Set<string>, depth = 0): void {
  if (depth > 8) return;
  if (typeof v === "string") { const t = v.trim(); if (t.length >= 3 && t.length <= 80 && /\d/.test(t)) out.add(t.toLowerCase()); return; }
  if (Array.isArray(v)) { for (const x of v) collectNames(x, out, depth + 1); return; }
  if (v && typeof v === "object") for (const x of Object.values(v)) collectNames(x, out, depth + 1);
}
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
  // Any higher-precision value that rounds to the stated figure supports it (44.38 <- 44.3812).
  const rounded = (t: { value: number; decimals: number; percent: boolean }, vals: number[]): boolean =>
    !t.percent && t.decimals > 0 && vals.some((v) => Math.round(v * 10 ** t.decimals) / 10 ** t.decimals === t.value);
  // Numbers the user typed ("fans aged 25-29") are theirs, not claims; they support the plain (non-cited) sentences.
  for (const t of userTexts) for (const tok of numberTokens(t)) pool.push(tok.value);
  const names = new Set<string>();
  collectNames(toolData, names); collectNames(context, names);
  for (const t of userTexts) for (const m of t.matchAll(/[\p{L}][\p{L}'&.-]*(?:\s+[\p{L}][\p{L}'&.-]*)*\s+\d+(?:\.\d+)?\b/gu)) names.add(m[0].toLowerCase());
  let body = stripStructure(answer);
  for (const n of [...names].sort((a, b) => b.length - a.length)) body = body.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(n)}(?![\\p{L}\\p{N}])`, "giu"), " ");
  const flagged: string[] = [];
  for (const sentence of body.split(SENTENCES)) {
    const cites = [...sentence.matchAll(CITE)];
    const text = sentence.replace(CITE, " ");
    // A percent rendering is only supported by non-score values; plain numbers by any value.
    const evidence = cites.length > 0 ? cites.flatMap((c) => pageNumbers(documents, c[1]!, Number(c[2]))) : null;
    for (const t of numberTokens(text)) {
      if (!tokenSupported(t, evidence ?? (t.percent ? pool : [...pool, ...scores])) && (evidence !== null || !rounded(t, [...pool, ...scores]))) flagged.push(t.raw);
    }
  }
  return flagged;
}
