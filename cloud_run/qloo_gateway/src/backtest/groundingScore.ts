import { dedupeKey, type GroundItemsFile, type GroundKey } from "./grounding.js";
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
  if ((key.runId ?? null) !== (items.runId ?? null)) throw new Error("the key file and the items file come from different runs (run id mismatch)");
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
    excluded: items.excluded.map((e) => ({ cityId: e.cityId, city: e.city, code: e.code ?? /^[A-Z_]+/.exec(e.reason)?.[0] ?? "ERROR" })), notRun: items.notRun.map((n) => ({ cityId: n.cityId, city: n.city })),
    llmNoAnswer: items.cities.filter((c) => c.qloo === "ok" && c.llm === "no_answer").map((c) => c.city),
    cityDifference: items.cityDifference,
    rows: { total: ids.length, rated, unrated, cantTell },
    byArm, perCity,
    meanPerCity: { qloo: mean(paired.map((c) => c.qloo!)), llm: mean(paired.map((c) => c.llm!)) },
    signTest: { ...st, pairs: paired.length },
    secondary: truncated(input),
  };
  return { ...section, summary: groundingSummary(section) };
}

/**
 * Amendment 5's secondary analysis: per city and category, both arms are cut to the smaller arm's count by recorded rank (ranks are 1..n), and the
 * shares and sign test are recomputed from the same ratings. An item is credited the rating of the sheet row it was merged into.
 */
function truncated({ key, items, ratings }: ScoreInput): GroundingSection["secondary"] {
  const rowOf = new Map<string, string>();
  for (const [id, r] of Object.entries(key.rows)) rowOf.set(`${r.cityId}\u0000${r.category}\u0000${dedupeKey(r.name)}`, id);
  const count = (arm: GroundArm, cityId: string, category: GroundCategory) => items.items.filter((i) => i.arm === arm && i.cityId === cityId && i.category === category).length;
  const per = new Map<string, Record<GroundArm, ShareRow>>();
  const names: Record<GroundArm, number> = { qloo: 0, llm: 0 };
  for (const it of items.items) {
    const k = Math.min(count("qloo", it.cityId, it.category), count("llm", it.cityId, it.category));
    if (it.rank > k) continue;
    names[it.arm] += 1;
    const rating = ratings.get(rowOf.get(`${it.cityId}\u0000${it.category}\u0000${dedupeKey(it.name)}`) ?? "");
    if (!rating) continue;
    let c = per.get(it.cityId);
    if (!c) { c = { qloo: empty(), llm: empty() }; per.set(it.cityId, c); }
    add(c[it.arm], rating);
  }
  const perCity = items.cities.filter((c) => c.qloo === "ok").map((c) => ({ cityId: c.cityId, city: c.city, qloo: per.get(c.cityId)?.qloo.share ?? null, llm: per.get(c.cityId)?.llm.share ?? null }));
  const paired = perCity.filter((c) => c.qloo !== null && c.llm !== null);
  return { names, perCity, meanPerCity: { qloo: mean(paired.map((c) => c.qloo!)), llm: mean(paired.map((c) => c.llm!)) }, signTest: { ...signTest(paired.map((c) => [c.qloo!, c.llm!] as const)), pairs: paired.length } };
}
