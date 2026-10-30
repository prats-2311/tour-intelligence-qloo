import { mentionsDoNotBook } from "./doNotBook";
import { mentionsNonSponsor } from "./nonSponsors";

export const NEUTRAL_ANSWER = "That answer named an act we don't recommend booking; ask again or pick another act.";

/** Sentences end at . ! ? followed by whitespace, or at a line break (so "0.94" stays whole). */
const sentencesOf = (line: string): string[] => line.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
const bad = (s: string): boolean => mentionsDoNotBook(s) || mentionsNonSponsor(s);

/**
 * A strategist answer without the sentences that name a listed act or a non-sponsor organisation (belt and braces: the gateway does this too,
 * but recorded replays and older gateways do not). Line structure is kept; an answer with nothing left becomes a neutral line.
 */
export function redactAnswer(text: string): { text: string; removed: number } {
  let removed = 0;
  const lines = text.split(/\r?\n/).map((line) => {
    if (!bad(line)) return line;
    const marker = /^\s*(?:[-*+•]\s+|\d{1,2}[.)]\s+)?/.exec(line)![0];
    const kept = sentencesOf(line.slice(marker.length)).filter((s) => { const b = bad(s); if (b) removed += 1; return !b; });
    return kept.length ? marker + kept.join(" ") : null;
  }).filter((l): l is string => l !== null);
  if (removed === 0) return { text, removed: 0 };
  const out = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text: out === "" ? NEUTRAL_ANSWER : out, removed };
}
