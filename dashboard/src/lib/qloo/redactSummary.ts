import { mentionsDoNotBook } from "./doNotBook";
import { mentionsNonSponsor } from "./nonSponsors";

export const REDACTION_NOTE = (n: number): string => `${n} ${n === 1 ? "sentence" : "sentences"} removed (do-not-book list or not a sponsor)`;

/** Sentences end at . ! ? followed by whitespace, or at a line break (so "0.94" stays whole). */
const sentencesOf = (line: string): string[] => line.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

/**
 * Model reasoning is free text that can name a listed act or a non-sponsor organisation. Instead of hiding the whole
 * summary, only the sentences that mention one are dropped; the rest is shown with a count of what was removed.
 */
export function redactSummary(text: string): { text: string; removed: number } {
  let removed = 0;
  const lines = text.split(/\r?\n/).flatMap((line) => {
    const kept = sentencesOf(line).filter((s) => {
      const bad = mentionsDoNotBook(s) || mentionsNonSponsor(s);
      if (bad) removed += 1;
      return !bad;
    });
    return kept.length ? [kept.join(" ")] : [];
  });
  return removed === 0 ? { text, removed } : { text: lines.join("\n"), removed };
}
