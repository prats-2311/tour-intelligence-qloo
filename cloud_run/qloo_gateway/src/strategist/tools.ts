import { extractCandidates, extractSharedTaste, extractTrendPoints } from "../extract.js";
import type { City } from "../geo/cities.js";
import { runCityPlaybook } from "../pipeline/cityPlaybook.js";
import { ValidationError, type QlooCaller } from "../qlooCall.js";
import { INSIGHTS_TYPES, SEARCH_TYPES } from "../validate.js";
import type { FunctionDeclaration } from "./gemini-tools.js";
import type { StrategistToolStatus } from "../types.js";
import { isSafeName } from "./safety.js";

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
    { artist: str("Artist name"), artistEntityId: str("Qloo entity id of the artist"), city: str("City name"), country: str("Two-letter country code") },
    ["artist", "artistEntityId", "city", "country"]),
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

const rejected = (name: string, summary: string): ToolOutcome => ({ name, status: "rejected", summary, data: null });
const failed = (name: string, err: unknown): ToolOutcome => ({ name, status: "error", summary: String((err as Error)?.message ?? err), data: null });

interface Deps { qloo: QlooCaller; cities: City[]; sessionId: string; signal?: AbortSignal }

async function playbook(args: Record<string, unknown>, deps: Deps): Promise<ToolOutcome> {
  const name = "get_city_playbook";
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
    const data = cards.map((c) => ({
      kind: c.kind, status: c.status,
      top: c.items.slice(0, 3).map((it) => {
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

export async function executeTool(call: { name: string; args: Record<string, unknown> }, deps: Deps): Promise<ToolOutcome> {
  const { name } = call;
  const args = rec(call.args) ?? {};
  if (name === "get_city_playbook") return playbook(args, deps);
  if (!STRATEGIST_QLOO_TOOLS.includes(name)) return rejected(name, `Tool not allowed: ${name}`);
  const bad = unsafeKey(args);
  if (bad) return rejected(name, `Unsafe argument: ${bad}`);
  try {
    const r = await deps.qloo.call(name, args, deps.sessionId);
    const e = r.envelope;
    const n = Array.isArray(e.results) ? e.results.length : 0;
    const resultCount = typeof e.result_count === "number" && Number.isFinite(e.result_count) ? e.result_count : n;
    const data = name === "qloo_trends" ? extractTrendPoints(e).slice(0, 8)
      : e.status === "needs_input" ? extractCandidates(e).slice(0, 5) // F6: ids the model can retry with
      : compactResults(e.results);
    return { name, status: e.status, summary: e.summary ?? `${n} results`, resultCount, data, cacheKey: r.cacheKey, cached: r.cached };
  } catch (err) {
    return err instanceof ValidationError ? rejected(name, err.message) : failed(name, err);
  }
}
