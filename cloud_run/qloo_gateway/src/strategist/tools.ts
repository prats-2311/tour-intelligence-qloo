import { extractCandidates, extractSharedTaste, extractTrendPoints } from "../extract.js";
import { metroAnchor, nearestCity, type City } from "../geo/cities.js";
import { runCityPlaybook } from "../pipeline/cityPlaybook.js";
import { ValidationError, type QlooCaller } from "../qlooCall.js";
import { INSIGHTS_TYPES, SEARCH_TYPES } from "../validate.js";
import type { FunctionDeclaration } from "./gemini-tools.js";
import type { StrategistToolStatus, UserDocument } from "../types.js";
import { isSafeName } from "./safety.js";
import { filterToolData, isDoNotBook, mentionsDoNotBook } from "../displayFilters/doNotBook.js";
import { isNonSponsor } from "../pipeline/nonSponsors.js";
import { findCity } from "../geo/location.js";
import { BAND_PHRASE, runSponsorSegments } from "../pipeline/sponsorSegments.js";
import { AGE_GROUP_HELP, parseAgeGroup } from "./ageGroup.js";

export const STRATEGIST_QLOO_TOOLS: readonly string[] = [
  "qloo_describe", "qloo_where_popular", "qloo_audience_demographics", "qloo_entity_tags", "qloo_trends",
  "qloo_recommend", "qloo_rank", "qloo_compare_audiences", "qloo_find_tags",
];

type Schema = Record<string, unknown>;
const str = (description: string, values?: readonly string[]): Schema => ({ type: "STRING", description, ...(values ? { enum: [...values] } : {}) });
const list = (description: string, max: number): Schema => ({ type: "ARRAY", description: `${description} (1-${max} items)`, items: { type: "STRING" } });
const limit: Schema = { type: "INTEGER", description: "Maximum results, 1-20" };
const bool = (description: string): Schema => ({ type: "BOOLEAN", description });
const op = (description: string): Schema => str(description, ["union", "intersection"]);
const decl = (name: string, description: string, properties: Record<string, Schema>, required: string[] = []): FunctionDeclaration => ({
  name, description, parameters: { type: "OBJECT", properties, ...(required.length ? { required } : {}) },
});

export const STRATEGIST_DECLARATIONS: FunctionDeclaration[] = [
  decl("qloo_describe", "Look up a Qloo entity by name or id and return its identity and popularity.",
    { entity: str("Entity name or Qloo entity id"), type: str("Entity type", SEARCH_TYPES) }, ["entity"]),
  decl("qloo_where_popular", "Find where in a place an entity is popular, as heat points with affinity.",
    { entity: str("Entity name or Qloo entity id"), entity_type: str("Entity type", SEARCH_TYPES), within: str("Place to search within, for example a city and country"), limit }, ["entity", "within"]),
  decl("qloo_audience_demographics", "Return the audience demographics (age and gender) for an entity. Values are signed over/under-index vs the average audience (-1..1), not shares or percentages.",
    { entity: str("Entity name or Qloo entity id"), entity_type: str("Entity type", SEARCH_TYPES), limit }, ["entity"]),
  decl("qloo_entity_tags", "Return the taste tags that describe the given entities.",
    { entities: list("Entity names or Qloo entity ids", 10), entity_type: str("Entity type", SEARCH_TYPES), limit }, ["entities"]),
  decl("qloo_trends", "Show how interest in the given entities has trended between two dates.",
    { entities: list("Entity names or Qloo entity ids", 5), entity_type: str("Entity type", INSIGHTS_TYPES), start_date: str("Start date, YYYY-MM-DD"), end_date: str("End date, YYYY-MM-DD"), limit },
    ["entities", "entity_type", "start_date", "end_date"]),
  decl("qloo_recommend", "Recommend entities of target_type (brand, place, artist, movie, tv_show…) that people with the given signals like, optionally near a location.",
    {
      target_type: str("Type of entity to recommend", INSIGHTS_TYPES), signals: list("Entities whose fans to base recommendations on", 10),
      signal_tags: list("Tag ids to base recommendations on", 10), signal_tags_operator: op("How signal_tags combine"),
      signal_location: str("Place whose audience to base recommendations on"), demographic: str("Demographic to focus on"),
      filter_location: str("Only return entities in this place"), include_tags: list("Tags results must have", 10), include_tags_operator: op("How include_tags combine"),
      exclude_tags: list("Tags results must not have", 10), exclude_tags_operator: op("How exclude_tags combine"), explain: bool("Include an explanation of why each result matches"), limit,
    }, ["target_type"]),
  decl("qloo_rank", "Rank the given options of option_type by how well they fit the given signals.",
    {
      options: list("Qloo entity ids of the entities to rank (names are not resolved; find ids with qloo_describe first)", 10), option_type: str("Type of the options", INSIGHTS_TYPES), signals: list("Entities whose fans to rank for", 10),
      signal_location: str("Place whose audience to rank for"), demographic: str("Demographic to focus on"),
      include_tags: list("Tags results must have", 10), exclude_tags: list("Tags results must not have", 10),
    }, ["options", "option_type"]),
  decl("qloo_compare_audiences", "Compare the shared taste (common tags) of two groups of entities, with a 0-1 score for each shared tag. Shared taste is a 0-1 score, not audience overlap and not a percentage.",
    { group_a: list("First group of entities", 10), group_b: list("Second group of entities", 10), target_type: str("Type of entity to compare on", INSIGHTS_TYPES), limit }, ["group_a", "group_b"]),
  decl("qloo_find_tags", "Search Qloo taste tags by keyword or meaning.",
    { query: str("Search text"), semantic: bool("Match by meaning instead of keyword"), limit }, ["query"]),
  decl("get_city_playbook", "Build the activation playbook evidence (sponsors, merch tags, promo zones, local moment, venues, co-billing, talent) for the artist in one city.",
    { artist: str("Artist name (defaults to the board artist)"), artistEntityId: str("Qloo entity id of the artist (defaults to the board artist)"), city: str("City name"), country: str("Two-letter country code") },
    ["city", "country"]),
  decl("sponsors_by_age", "Sponsor brands for the board artist's fans of one age group in one city (the app's Sponsors by age group). Valid age_group values are the Qloo buckets 24_and_younger, 25_to_29, 30_to_34, 35_to_44, 45_to_54, 55_and_older; phrasings like 25-29, late twenties or 55+ are mapped. Lift is vs the average audience, not a share.",
    { city: str("City name"), country: str("Two-letter country code"), age_group: str("Age group, for example 25_to_29, 25-29 or 55+") }, ["city", "country", "age_group"]),
];

export interface ToolOutcome {
  name: string;
  status: StrategistToolStatus;
  summary: string;
  /** How many results or cards the tool returned; absent when it did not run. */
  resultCount?: number;
  data: unknown;
  cacheKey?: string;
  cached?: boolean;
}

const ID = /^[A-Za-z0-9:_.-]{1,128}$/;
const STRING_KEYS = ["entity", "within", "filter_location", "signal_location", "query", "demographic"];
const LIST_KEYS = ["entities", "signals", "options", "group_a", "group_b", "signal_tags", "include_tags", "exclude_tags"];
const safe = (v: unknown) => typeof v === "string" && (isSafeName(v) || ID.test(v));

function unsafeKey(args: Record<string, unknown>): string | null {
  for (const k of STRING_KEYS) if (args[k] !== undefined && !safe(args[k])) return k;
  for (const k of LIST_KEYS) if (args[k] !== undefined && (!Array.isArray(args[k]) || !(args[k] as unknown[]).every(safe))) return k;
  return null;
}

const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const clip = (v: unknown): unknown => (typeof v === "string" && v.length > 120 ? v.slice(0, 120) : v);
const pick = (o: Record<string, unknown> | null, keys: string[]): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (o) for (const k of keys) if (o[k] !== undefined) out[k] = clip(o[k]);
  return out;
};

export function compactResults(results: unknown, max = 8): unknown {
  if (Array.isArray(results)) {
    return results.slice(0, max).map((item) => {
      const o = rec(item);
      if (!o) return clip(item);
      const out = pick(o, ["name", "entity_id", "affinity", "popularity", "subtype", "type"]);
      const loc = pick(rec(o.location), ["latitude", "longitude", "geohash"]);
      if (Object.keys(loc).length) out.location = loc;
      const q = pick(rec(o.query), ["affinity", "popularity", "age", "gender"]);
      if (Object.keys(q).length) out.query = q;
      return out;
    });
  }
  const shared = extractSharedTaste({ operation: "compare_audiences", status: "ok", results });
  return shared.value === null ? null : { sharedTaste: shared.value, sharedTags: shared.tags.slice(0, 3).map((t) => t.name) };
}

/** Nearest city within 80 km, then the most populous city within 30 km of that one (suburb -> tour city); null when nothing is in range. Reuses the board's own anchoring helpers. */
function labelCity(p: { lat: number; lon: number }, cities: City[]): City | null {
  const near = nearestCity(cities, p, { maxKm: 80, minPopulation: 20_000 });
  return near ? metroAnchor(cities, near, { maxKm: 30, minPopulation: 20_000 }) ?? near : null;
}

/** Heat points as city labels for the model: no coordinates, a deduped city list (max affinity) on top. */
export function cityHeatForModel(results: unknown, cities: City[], max = 10): { cities: Array<{ city: string; country: string; affinity: number; popularity?: number }>; points: Array<{ city: string | null; country?: string; affinity: number | null }> } {
  const byCity = new Map<string, { city: string; country: string; affinity: number; popularity?: number }>();
  const points: Array<{ city: string | null; country?: string; affinity: number | null }> = [];
  for (const item of Array.isArray(results) ? results.slice(0, max) : []) {
    const o = rec(item), loc = rec(o?.location), q = rec(o?.query);
    const lat = Number(loc?.latitude), lon = Number(loc?.longitude);
    const c = Number.isFinite(lat) && Number.isFinite(lon) && loc?.latitude !== null && loc?.longitude !== null ? labelCity({ lat, lon }, cities) : null;
    const aff = typeof q?.affinity === "number" ? q.affinity : typeof o?.affinity === "number" ? o.affinity : null;
    const pop = typeof q?.popularity === "number" ? q.popularity : typeof o?.popularity === "number" ? o.popularity : undefined;
    points.push({ city: c?.name ?? null, ...(c ? { country: c.country } : {}), affinity: aff });
    if (!c) continue;
    const prev = byCity.get(c.id);
    if (!prev || (aff ?? -Infinity) > prev.affinity) byCity.set(c.id, { city: c.name, country: c.country, affinity: aff ?? 0, ...(pop !== undefined ? { popularity: pop } : {}) });
  }
  return { cities: [...byCity.values()].sort((a, b) => b.affinity - a.affinity), points };
}

const rejected = (name: string, summary: string): ToolOutcome => ({ name, status: "rejected", summary, data: null });
const failed = (name: string, err: unknown): ToolOutcome => ({ name, status: "error", summary: String((err as Error)?.message ?? err), data: null });

interface Deps { qloo: QlooCaller; cities: City[]; sessionId: string; /** The board's artist: tools default to its Qloo id and a matching name is swapped for it. */ artist?: { name: string; entityId: string }; documents?: UserDocument[]; signal?: AbortSignal }

const fold = (t: string): string => t.toLowerCase().replace(/\s+/g, " ").trim();
const isBoardArtist = (v: unknown, a: Deps["artist"]): boolean => !!a && typeof v === "string" && (fold(v) === fold(a.name) || v === a.entityId);

/** The board artist's id replaces an omitted entity and any argument that is the artist's name; other entities pass through. */
function withBoardArtist(name: string, args: Record<string, unknown>, a: Deps["artist"]): Record<string, unknown> {
  if (!a) return args;
  const out: Record<string, unknown> = { ...args };
  const swap = (v: unknown) => (isBoardArtist(v, a) ? a.entityId : v);
  for (const k of ["entity"]) if (out[k] !== undefined) out[k] = swap(out[k]);
  for (const k of ["entities", "signals", "group_a", "group_b"]) if (Array.isArray(out[k])) out[k] = (out[k] as unknown[]).map(swap);
  if (out.entity === undefined && ["qloo_describe", "qloo_where_popular", "qloo_audience_demographics"].includes(name)) out.entity = a.entityId;
  if (name === "qloo_recommend" && out.signals === undefined && out.signal_tags === undefined) out.signals = [a.entityId];
  return out;
}

const AGE_BRANDS_MAX = 5;

async function sponsorsByAge(args: Record<string, unknown>, deps: Deps): Promise<ToolOutcome> {
  const name = "sponsors_by_age";
  const band = parseAgeGroup(args.age_group);
  if (!band) return rejected(name, `Unknown age group ${JSON.stringify(args.age_group)}. ${AGE_GROUP_HELP}`);
  if (!deps.artist) return rejected(name, "No artist on the board; plan a tour first so the artist is known.");
  if (!isSafeName(args.city) || !isSafeName(args.country)) return rejected(name, "Unsafe argument: city or country");
  try {
    const city = findCity(deps.cities, { name: args.city, country: args.country });
    const out = await runSponsorSegments({ artistId: deps.artist.entityId, onlyBand: band, city: { name: args.city, country: args.country, ...(city ? { id: city.id } : {}) }, sessionId: deps.sessionId }, { qloo: deps.qloo, cities: deps.cities, ...(deps.signal ? { signal: deps.signal } : {}) });
    const b = out.bands[0];
    if (out.status === "unavailable" || !b) return { name, status: "empty", summary: out.message ?? `No age breakdown for ${band}.`, data: { ageGroup: band, phrase: BAND_PHRASE[band], status: out.status } };
    const items = b.items.filter((it) => !isDoNotBook(it.name) && !isNonSponsor(it.name)).slice(0, AGE_BRANDS_MAX);
    const data = filterToolData({ ageGroup: band, phrase: b.phrase, index: b.index, lifted: b.lifted, brands: items.map((it) => ({ name: it.name, artistRank: it.artistRank, ...(it.cityRank !== null ? { cityRank: it.cityRank } : {}) })) }, { brands: true }).data;
    return { name, status: b.status === "unavailable" ? "empty" : "ok", summary: `${items.length} brands for ${band}; rank is vs the average audience, not a share`, resultCount: items.length, data };
  } catch (err) {
    return failed(name, err);
  }
}

async function playbook(rawArgs: Record<string, unknown>, deps: Deps): Promise<ToolOutcome> {
  const name = "get_city_playbook";
  const args: Record<string, unknown> = { ...rawArgs };
  if (deps.artist && (args.artist === undefined || isBoardArtist(args.artist, deps.artist))) args.artist = deps.artist.name;
  if (deps.artist && (args.artistEntityId === undefined || isBoardArtist(args.artistEntityId, deps.artist))) args.artistEntityId = deps.artist.entityId;
  const { artist, artistEntityId, city, country } = args;
  const badKey = (["artist", "city", "country"] as const).find((k) => !isSafeName(args[k])) ?? (typeof artistEntityId !== "string" || !ID.test(artistEntityId) ? "artistEntityId" : null);
  if (badKey) return rejected(name, `Unsafe argument: ${badKey}`);
  try {
    type Card = { kind: string; status: string; items: unknown[] };
    const got: { cards: Card[] | null } = { cards: null };
    for await (const ev of runCityPlaybook(
      { artist: artist as string, artistEntityId: artistEntityId as string, city: { name: city as string, country: country as string }, sessionId: deps.sessionId, narrative: false },
      { qloo: deps.qloo, cities: deps.cities, ...(deps.signal ? { signal: deps.signal } : {}) },
    )) {
      if (ev.type === "error") return { name, status: "error", summary: ev.message, data: null };
      if (ev.type === "playbook") got.cards = (ev.playbook as { cards: Card[] }).cards;
    }
    const cards = got.cards;
    if (!cards) return { name, status: "error", summary: "playbook stream ended without results", data: null };
    // Listed acts and non-sponsor organisations are dropped before the top-3 cut, so the cut fills with allowed items.
    const allowed = (c: Card, it: unknown): boolean => {
      const n = rec(it)?.name;
      return !(isDoNotBook(n) || (c.kind === "sponsors" && isNonSponsor(n)));
    };
    const data = cards.map((c) => ({
      kind: c.kind, status: c.status,
      top: c.items.filter((it) => allowed(c, it)).slice(0, 3).map((it) => {
        const o = rec(it) ?? {};
        const out: Record<string, unknown> = { name: clip(o.name ?? o.label) };
        for (const k of ["affinity", "share", "lift"]) if (o[k] !== undefined) { out[k] = o[k]; break; }
        return out;
      }),
    }));
    return { name, status: "ok", summary: `${data.length} cards`, resultCount: data.length, data };
  } catch (err) {
    return failed(name, err);
  }
}

const squash = (t: string): string => t.toLowerCase().replace(/\s+/g, " ").trim();
const QUOTE_MIN = 40;

/** True when a string argument (or list item) of the call quotes a stretch of the user's documents. Entity names are short; a long verbatim quote means document text is being sent out. */
function quotesDocument(args: Record<string, unknown>, documents: UserDocument[] | undefined): boolean {
  if (!documents?.length) return false;
  const corpus = squash(documents.flatMap((d) => d.pages.map((p) => p.text)).join(" "));
  const strings = Object.values(args).flatMap((v) => (typeof v === "string" ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []));
  return strings.some((v) => { const q = squash(v); return q.length >= QUOTE_MIN && corpus.includes(q); });
}

export async function executeTool(call: { name: string; args: Record<string, unknown> }, deps: Deps): Promise<ToolOutcome> {
  const { name } = call;
  const rawArgs = rec(call.args) ?? {};
  if (quotesDocument(rawArgs, deps.documents)) return rejected(name, "Document text is never sent to Qloo");
  if (name === "get_city_playbook") return playbook(rawArgs, deps);
  if (name === "sponsors_by_age") return sponsorsByAge(rawArgs, deps);
  if (!STRATEGIST_QLOO_TOOLS.includes(name)) return rejected(name, `Tool not allowed: ${name}`);
  const args = withBoardArtist(name, rawArgs, deps.artist);
  const bad = unsafeKey(args);
  if (bad) return rejected(name, `Unsafe argument: ${bad}`);
  try {
    const r = await deps.qloo.call(name, args, deps.sessionId);
    const e = r.envelope;
    const n = Array.isArray(e.results) ? e.results.length : 0;
    const resultCount = typeof e.result_count === "number" && Number.isFinite(e.result_count) ? e.result_count : n;
    const heat = name === "qloo_where_popular" && e.status === "ok" ? cityHeatForModel(e.results, deps.cities) : null;
    const raw = heat ? heat : name === "qloo_trends" ? extractTrendPoints(e).slice(0, 8)
      : e.status === "needs_input" ? extractCandidates(e).slice(0, 5) // F6: ids the model can retry with
      : compactResults(e.results);
    // Same display rules as the dashboard: no do-not-book acts; no non-sponsor organisations among brands.
    const brands = [args.target_type, args.entity_type, args.option_type].some((t) => t === "brand");
    const data = filterToolData(raw, { brands }).data;
    const top = heat ? (rec(data)?.cities as Array<{ city: string }> | undefined)?.slice(0, 3).map((c) => c.city) ?? [] : [];
    if (heat) return { name, status: e.status, summary: top.length ? `${n} points; Top: ${top.join(", ")}` : `${n} points, none near a listed city`, resultCount, data, cacheKey: r.cacheKey, cached: r.cached };
    return { name, status: e.status, summary: e.summary && !mentionsDoNotBook(e.summary) ? e.summary : `${n} results`, resultCount, data, cacheKey: r.cacheKey, cached: r.cached };
  } catch (err) {
    return err instanceof ValidationError ? rejected(name, err.message) : failed(name, err);
  }
}
