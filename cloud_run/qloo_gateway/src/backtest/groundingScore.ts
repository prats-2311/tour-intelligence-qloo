import type { GroundItemsFile, GroundKey } from "./grounding.js";
import type { Rating } from "./groundingSheet.js";
import { GROUND_ARMS, GROUND_CATEGORIES, groundingSummary, type GroundArm, type GroundCategory, type GroundingSection, type ShareRow } from "./proofResults.js";
import { mean, signTest } from "./proofStats.js";

export type { GroundItemsFile };
/** More unrated rows than this share of the sheet stops the scorer unless `allowPartial`. */
export const MAX_UNRATED_SHARE = 0.05;

const empty = (): ShareRow => ({ rated: 0, inCity: 0, otherCity: 0, notExist: 0, cantTell: 0, share: null });
function add(row: ShareRow, rating: Rating): void {
  if (rating === "cant_tell") { row.cantTell += 1; return; }
  row.rated += 1;
  if (rating === "in_city") row.inCity += 1;
  else if (rating === "other_city") row.otherCity += 1;
  else row.notExist += 1;
  row.share = row.inCity / row.rated;
}

export interface ScoreInput { key: GroundKey; items: GroundItemsFile; ratings: Map<string, Rating | null> }

/**
 * Pure. Per arm and category: the share of rated rows that are "in this city" (can't tell is outside the denominator and counted apart); per city and arm
 * the same share over all categories; a paired per-city two-sided exact sign test, Qloo vs LLM, ties dropped. A row both arms gave counts for both.
 * Throws on a rating for an unknown row, a key row missing from the file, or more than 5% unrated rows unless `allowPartial`.
 */
export function scoreGrounding(input: ScoreInput, opts: { allowPartial?: boolean } = {}): GroundingSection & { summary: string[] } {
  const { key, items, ratings } = input;
  const ids = Object.keys(key.rows);
  const unknown = [...ratings.keys()].filter((id) => !(id in key.rows));
  if (unknown.length) throw new Error(`the ratings file has rows that are not on the sheet: ${unknown.slice(0, 5).join(", ")}`);
  const missing = ids.filter((id) => !ratings.has(id));
  if (missing.length) throw new Error(`the ratings file is missing rows: ${missing.slice(0, 5).join(", ")}`);

  const unrated = ids.filter((id) => ratings.get(id) === null).length;
  if (ids.length > 0 && unrated / ids.length > MAX_UNRATED_SHARE && !opts.allowPartial) {
    throw new Error(`${unrated} of ${ids.length} rows are unrated (more than ${MAX_UNRATED_SHARE * 100}%); finish the sheet or pass --allow-partial`);
  }

  const byArm = Object.fromEntries(GROUND_ARMS.map((a) => [a, { overall: empty(), byCategory: Object.fromEntries(GROUND_CATEGORIES.map((c) => [c, empty()])) as Record<GroundCategory, ShareRow> }])) as GroundingSection["byArm"];
  const cityRows = new Map<string, Record<GroundArm, ShareRow>>();
  let cantTell = 0;
  for (const id of ids) {
    const rating = ratings.get(id);
    if (!rating) continue;
    const row = key.rows[id]!;
    if (rating === "cant_tell") cantTell += 1;
    for (const arm of row.arms) {
      add(byArm[arm].overall, rating);
      add(byArm[arm].byCategory[row.category], rating);
      let c = cityRows.get(row.cityId);
      if (!c) { c = { qloo: empty(), llm: empty() }; cityRows.set(row.cityId, c); }
      add(c[arm], rating);
    }
  }

  const rated = ids.length - unrated;
  const rateable = items.cities.filter((c) => c.qloo === "ok");
  const perCity = rateable.map((c) => ({ cityId: c.cityId, city: c.city, qloo: cityRows.get(c.cityId)?.qloo.share ?? null, llm: cityRows.get(c.cityId)?.llm.share ?? null }));
  const paired = perCity.filter((c) => c.qloo !== null && c.llm !== null);
  const st = signTest(paired.map((c) => [c.qloo!, c.llm!] as const));
  const section: GroundingSection = {
    artist: items.artist,
    cities: rateable.map((c) => ({ cityId: c.cityId, city: c.city, country: c.country })),
    excluded: items.excluded, notRun: items.notRun.map((n) => ({ cityId: n.cityId, city: n.city })),
    llmNoAnswer: items.cities.filter((c) => c.qloo === "ok" && c.llm === "no_answer").map((c) => c.city),
    cityDifference: items.cityDifference,
    rows: { total: ids.length, rated, unrated, cantTell },
    byArm, perCity,
    meanPerCity: { qloo: mean(paired.map((c) => c.qloo!)), llm: mean(paired.map((c) => c.llm!)) },
    signTest: { ...st, pairs: paired.length },
  };
  return { ...section, summary: groundingSummary(section) };
}
