import { mentionsDoNotBook } from "./doNotBook";
import { mentionsNonSponsor } from "./nonSponsors";

export const REDACTION_NOTE = (n: number): string => `${n} ${n === 1 ? "sentence" : "sentences"} removed (do-not-book list or not a sponsor)`;

/** Sentences end at . ! ? followed by whitespace, or at a line break (so "0.94" stays whole). */
const sentencesOf = (line: string): string[] => line.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

/** Implementation talk a user should not see in a reasoning summary. */
const JARGON = /\b(json|arrays?|schemas?|tool[ _-]?calls?|function[ _-]?calls?|functions?)\b/i;

/** Markdown to plain text: bold/italic/code markers and heading or bullet markers go; a heading-only line becomes a plain sentence. */
export function plainText(text: string): string {
  return text.split(/\r?\n/).map((line) => {
    const heading = /^\s*#{1,6}\s+/.test(line) || /^\s*(\*\*|__)[^*_]+(\*\*|__)\s*$/.test(line);
    let t = line.replace(/^\s*#{1,6}\s+/, "").replace(/^\s*[-*+]\s+/, "").replace(/(\*\*|__)(.+?)\1/g, "$2").replace(/[*_`]+/g, (m, off: number, all: string) => (/\w/.test(all[off - 1] ?? "") && /\w/.test(all[off + m.length] ?? "") ? m : "")).replace(/`/g, "").trim();
    if (heading && t && !/[.!?]$/.test(t)) t += ".";
    return t;
  }).join("\n");
}

/**
 * Model reasoning is free text that can name a listed act or a non-sponsor organisation. Instead of hiding the whole
 * summary, only the sentences that mention one are dropped; the rest is shown with a count of what was removed.
 */
export function redactSummary(raw: string): { text: string; removed: number } {
  const text = plainText(raw);
  let removed = 0;
  const lines = text.split(/\r?\n/).flatMap((line) => {
    const kept = sentencesOf(line).filter((s) => {
      const bad = mentionsDoNotBook(s) || mentionsNonSponsor(s) || JARGON.test(s);
      if (bad) removed += 1;
      return !bad;
    });
    return kept.length ? [kept.join(" ")] : [];
  });
  return { text: lines.join("\n"), removed };
}
