import { fold, isNonSponsor, mentionsNonSponsor } from "../pipeline/nonSponsors.js";

/**
 * Acts we will not book. The dashboard keeps an identical copy in dashboard/src/lib/qloo/doNotBook.ts (and the agent MCP server another);
 * test/displayFilterDoNotBook.test.ts pins this one equal to the dashboard's by reading its source.
 */
export const DO_NOT_BOOK: readonly string[] = ["Ariel Pink"];
const FOLDED = DO_NOT_BOOK.map(fold);

export const NEUTRAL_ANSWER = "That answer named an act we don't recommend booking; ask again or pick another act.";

/** Accent- and case-folded exact name match. */
export const isDoNotBook = (name: unknown): boolean => typeof name === "string" && FOLDED.includes(fold(name));
/** True when free text names a listed act. */
export const mentionsDoNotBook = (text: string): boolean => { const t = fold(text); return FOLDED.some((n) => t.includes(n)); };

const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/**
 * Tool output with listed acts removed from every list (items with that name, or bare strings), at any depth. With `brands`, non-sponsor
 * organisations are removed too. `removed` counts what was dropped. Returns the same value when nothing was.
 */
export function filterToolData(data: unknown, opts: { brands: boolean }): { data: unknown; removed: number } {
  let removed = 0;
  const bad = (v: unknown): boolean => {
    const name = typeof v === "string" ? v : rec(v)?.name;
    return isDoNotBook(name) || (opts.brands && isNonSponsor(name));
  };
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      const kept = v.filter((x) => { if (bad(x)) { removed += 1; return false; } return true; });
      return kept.map(walk);
    }
    const o = rec(v);
    if (!o) return v;
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, walk(x)]));
  };
  const out = walk(data);
  return { data: removed === 0 ? data : out, removed };
}

/** Sentences end at . ! ? followed by whitespace, or at a line break (so "0.94" stays whole). */
const sentencesOf = (line: string): string[] => line.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

/**
 * The model's answer without the sentences that name a listed act or a non-sponsor organisation. Line structure (lists) is kept.
 * An answer with nothing left becomes a short neutral line.
 */
export function redactAnswer(text: string): { text: string; removed: number } {
  let removed = 0;
  const lines = text.split(/\r?\n/).map((line) => {
    if (!mentionsDoNotBook(line) && !mentionsNonSponsor(line)) return line;
    const marker = /^\s*(?:[-*+•]\s+|\d{1,2}[.)]\s+)?/.exec(line)![0];
    const kept = sentencesOf(line.slice(marker.length)).filter((s) => { const b = mentionsDoNotBook(s) || mentionsNonSponsor(s); if (b) removed += 1; return !b; });
    return kept.length ? marker + kept.join(" ") : null;
  }).filter((l): l is string => l !== null);
  if (removed === 0) return { text, removed: 0 };
  const out = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text: out === "" ? NEUTRAL_ANSWER : out, removed };
}
