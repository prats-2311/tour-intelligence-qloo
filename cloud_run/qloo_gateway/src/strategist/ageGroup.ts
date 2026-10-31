import { AGE_BANDS, type AgeBand } from "../pipeline/sponsorSegments.js";

const WORDS: Array<[RegExp, AgeBand]> = [
  [/\b(?:late|upper)\s+twenties\b/, "25_to_29"],
  [/\b(?:early|teens?|teenagers?|youngest|gen\s*z)\b|\btwenties\b/, "24_and_younger"],
  [/\b(?:seniors?|retire\w*|oldest|older)\b/, "55_and_older"],
];

const bandFor = (n: number): AgeBand => n < 25 ? "24_and_younger" : n < 30 ? "25_to_29" : n < 35 ? "30_to_34" : n < 45 ? "35_to_44" : n < 55 ? "45_to_54" : "55_and_older";
const topOf = (b: AgeBand): number => ({ "24_and_younger": 24, "25_to_29": 29, "30_to_34": 34, "35_to_44": 44, "45_to_54": 54, "55_and_older": Infinity })[b];

/** Maps a user phrasing ("25-29", "late twenties", "55+", "under 25") to one of Qloo's age buckets; null when it is unknown or spans more than one bucket. */
export function parseAgeGroup(input: unknown): AgeBand | null {
  if (typeof input !== "string") return null;
  const s = input.toLowerCase().trim().replace(/[–—]/g, "-");
  if ((AGE_BANDS as readonly string[]).includes(s)) return s as AgeBand;
  for (const [re, band] of WORDS) if (re.test(s)) return band;
  const nums = (s.match(/\d{1,2}/g) ?? []).map(Number);
  if (nums.length === 0) return null;
  if (/\bunder\b|\bbelow\b|younger|\bless than\b/.test(s)) return nums[0]! <= 25 ? "24_and_younger" : bandFor(nums[0]! - 1);
  if (nums.length === 1) return /\+|over|older|above|and up/.test(s) ? bandFor(nums[0]!) : bandFor(nums[0]!);
  const [lo, hi] = [nums[0]!, nums[1]!];
  if (hi < lo) return null;
  const band = bandFor(lo);
  return hi <= topOf(band) || (band === "24_and_younger" && hi <= 24) ? band : null;
}

export const AGE_GROUP_HELP = `Valid age groups: ${AGE_BANDS.join(", ")} (for example 25-29, 55+).`;
