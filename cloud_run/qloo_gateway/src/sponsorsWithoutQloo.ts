import { BudgetExceededError } from "./budget.js";
import { cacheKey, type Cache } from "./cache.js";
import { extractEntities } from "./extract.js";
import type { City } from "./geo/cities.js";
import { findCity } from "./geo/location.js";
import { reserveAttempt, type CeilingDeps } from "./narrative/ceiling.js";
import { generateJson, type GenerateFn } from "./narrative/gemini.js";
import { fold, isNonSponsor } from "./pipeline/nonSponsors.js";
import { artistTasteArgs, cityPopularityArgs } from "./pipeline/recArgs.js";
import { rankLifted } from "./pipeline/playbookTrust.js";
import { Aborted, BudgetStop, resolveLocation, trackedCall } from "./pipeline/tourBoard.js";
import type { QlooCaller } from "./qlooCall.js";
import type { GatewayEvent } from "./types.js";

/** Bump when the prompt or the result shape changes: it is part of the cache key. */
export const SPONSORS_PROMPT_VERSION = "v1";
/** The playbook's own request sizes: the card asks for 10 fan brands and a 20-brand city baseline; this asks for 20 fan brands (Qloo's per-call cap) so ranks up to 20 are known. */
const CARD_LIMIT = 10, FAN_LIMIT = 20, CITY_LIMIT = 20, MAX_DESCRIBE = 5, PICKS = 5;
export const SPONSORS_NOTE = "Measured on Qloo's own fan ranking: this shows how far a model's memory strays from these fans' taste, not that the ranking is right.";

export const sponsorsPrompt = (artist: string, city: string, country: string) =>
  `You are advising a concert promoter. Without looking anything up, list the 5 brands most likely to sponsor or partner with ${artist}'s concert in ${city}, ${country}, best first. Brands only, no organisations.`;

const SCHEMA = { type: "OBJECT", required: ["brands"], properties: { brands: { type: "ARRAY", items: { type: "STRING" } } } };

export interface SponsorPick { name: string; fanRank: number | null; cityRank: number | null; nonSponsor?: true }
export type SponsorsWithoutQloo =
  | { status: "ok"; model: string; prompt: string; brands: SponsorPick[]; qlooTop: { name: string; fanRank: number; cityRank: number | null } | null; note: string; cached: boolean }
  | { status: "unavailable"; reason: "capped" | "error" | "disabled" | "invalid"; message: string };

export interface SponsorsWithoutQlooInput { artist: string; artistId: string; city: { name: string; country: string; id?: string; lat?: number; lon?: number }; sessionId: string }
export interface SponsorsWithoutQlooDeps { qloo: QlooCaller; cities: City[]; generate?: GenerateFn; models: string[]; ceiling: CeilingDeps; cache: Cache; signal?: AbortSignal }

const unavailable = (reason: "capped" | "error" | "disabled" | "invalid", message: string): SponsorsWithoutQlooResult => ({ status: "unavailable", reason, message });
type SponsorsWithoutQlooResult = SponsorsWithoutQloo;
/** Names compared with accents, case and punctuation folded away ("Café Nero" = "CAFE-NERO"). */
const key = (s: string) => fold(s).replace(/[^a-z0-9]+/g, "");

function validBrands(json: unknown): string[] | null {
  const b = (json as { brands?: unknown } | null)?.brands;
  if (!Array.isArray(b) || b.length !== PICKS || !b.every((x) => typeof x === "string" && x.trim() !== "" && x.length <= 80)) return null;
  return b.map((x: string) => x.trim());
}

export async function compareSponsorsWithoutQloo(input: SponsorsWithoutQlooInput, deps: SponsorsWithoutQlooDeps): Promise<SponsorsWithoutQloo> {
  if (!deps.generate) return unavailable("disabled", "Comparison unavailable");
  const ck = cacheKey("sponsors_without_qloo", { artist: input.artist, artistId: input.artistId, city: input.city.name, country: input.city.country, v: SPONSORS_PROMPT_VERSION });
  try {
    const hit = await deps.cache.get(ck);
    if (hit?.envelope.results) return { ...(hit.envelope.results as Extract<SponsorsWithoutQloo, { status: "ok" }>), cached: true };
  } catch { /* cache miss on read failure */ }

  const prompt = sponsorsPrompt(input.artist, input.city.name, input.city.country);
  const body = { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.2 } };
  try {
    const events: GatewayEvent[] = [];
    const d = { qloo: deps.qloo, cities: deps.cities, ...(deps.signal ? { signal: deps.signal } : {}) };
    const ask = (tool: string, args: Record<string, unknown>) => trackedCall(d, input.sessionId, tool, args, events);
    // The Qloo lookups don't depend on the model's picks, so they run while the model answers.
    const qlooP = (async () => {
      const known = findCity(deps.cities, input.city);
      const loc = known ? await resolveLocation(input.artistId, known, d, input.sessionId, events) : undefined;
      if (!loc || loc.status === "unresolved") return null;
      return Promise.all([
        ask("qloo_recommend", artistTasteArgs("brand", input.artistId, loc.where, FAN_LIMIT)),
        ask("qloo_recommend", cityPopularityArgs("brand", loc.where, CITY_LIMIT)),
      ]);
    })();
    qlooP.catch(() => {}); // surfaced below; never an unhandled rejection if the model path returns first

    let picks: string[] | null = null, model = "";
    for (let attempt = 0; attempt < 2 && !picks; attempt++) {
      try {
        const r = await generateJson(deps.generate, deps.models, body, { beforeAttempt: reserveAttempt(deps.ceiling, input.sessionId) });
        model = r.model; picks = validBrands(r.json);
      } catch (err) { if (!(err instanceof SyntaxError)) throw err; }
    }
    if (!picks) return unavailable("invalid", "Comparison unavailable");

    const q = await qlooP;
    if (!q) return unavailable("error", "Comparison unavailable");
    const [fanR, cityR] = q;
    if (fanR.envelope.status === "error") return unavailable("error", "Comparison unavailable");
    const fan = extractEntities(fanR.envelope);
    const city = cityR.envelope.status === "error" ? null : extractEntities(cityR.envelope);

    const fanById = new Map(fan.map((e, i) => [e.entityId, i + 1]));
    const fanByName = new Map<string, number>();
    fan.forEach((e, i) => { if (!fanByName.has(key(e.name))) fanByName.set(key(e.name), i + 1); });
    const cityById = new Map<string, number>(), cityByName = new Map<string, number>();
    (city ?? []).slice(0, CITY_LIMIT).forEach((e, i) => { if (!cityById.has(e.entityId)) cityById.set(e.entityId, i + 1); if (!cityByName.has(key(e.name))) cityByName.set(key(e.name), i + 1); });
    const baselineFull = !!city && city.length >= CITY_LIMIT;

    let described = 0;
    const brands: SponsorPick[] = await Promise.all(picks.map(async (name): Promise<SponsorPick> => {
      if (isNonSponsor(name)) return { name, fanRank: null, cityRank: null, nonSponsor: true };
      let fanRank = fanByName.get(key(name)) ?? null;
      let cityRank = baselineFull ? cityByName.get(key(name)) ?? null : null;
      if (fanRank === null && described < MAX_DESCRIBE) {
        described += 1;
        const r = await ask("qloo_describe", { entity: name, type: "brand" });
        const id = r.envelope.status === "ok" ? extractEntities(r.envelope)[0]?.entityId : undefined;
        if (id) { fanRank = fanById.get(id) ?? null; if (baselineFull) cityRank = cityById.get(id) ?? cityRank; }
      }
      return { name, fanRank, cityRank };
    }));

    // The sponsors card's #1: the fans' first 10 non-sponsors, ordered by the playbook's own lift rule against the city baseline.
    const card = fan.slice(0, CARD_LIMIT).filter((e) => !isNonSponsor(e.name));
    const lifted = rankLifted(card, baselineFull ? city : null);
    const top = lifted.items[0];
    const qlooTop = top ? { name: top.name, fanRank: lifted.lifted ? top.artistRank! : (fanById.get(top.entityId) ?? 1), cityRank: lifted.lifted ? top.cityRank ?? null : null } : null;

    const result: Extract<SponsorsWithoutQloo, { status: "ok" }> = { status: "ok", model, prompt, brands, qlooTop, note: SPONSORS_NOTE, cached: false };
    try { await deps.cache.put(ck, "sponsors_without_qloo", { operation: "sponsors_without_qloo", status: "ok", results: result }); } catch { /* not cached */ }
    return result;
  } catch (err) {
    if (err instanceof BudgetExceededError || err instanceof BudgetStop) return unavailable("capped", "Comparison limit reached");
    if (err instanceof Aborted) return unavailable("error", "Comparison unavailable");
    console.warn(`[sponsors-without-qloo] unavailable: ${String((err as Error)?.message ?? err)}`);
    return unavailable("error", "Comparison unavailable");
  }
}
