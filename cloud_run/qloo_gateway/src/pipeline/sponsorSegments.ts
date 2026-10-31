import { descriptionsOf, extractEntities } from "../extract.js";
import type { City } from "../geo/cities.js";
import { findCity } from "../geo/location.js";
import type { CallResult, QlooCaller } from "../qlooCall.js";
import type { GatewayEvent, QlooEnvelope } from "../types.js";
import { dropNonSponsors } from "./nonSponsors.js";
import { artistTasteArgs, cityPopularityArgs } from "./recArgs.js";
import { dedupeByName, rankLifted } from "./playbookTrust.js";
import { keepVerified, type SponsorCandidate, type SponsorVerdicts } from "./sponsorCheck.js";
import { Aborted, BudgetStop, resolveLocation, trackedCall } from "./tourBoard.js";

/** Qloo's six age bands, in order, and the demographic phrase the harness maps each to (only 18-24, 25-29 and 55-64 are live-verified; the rest fail closed per band). */
export const AGE_BANDS = ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];
export const BAND_PHRASE: Record<AgeBand, string> = {
  "24_and_younger": "18-24", "25_to_29": "25-29", "30_to_34": "30-34", "35_to_44": "35-44", "45_to_54": "45-54", "55_and_older": "55-64",
};
/** A band qualifies when its over-index vs the average audience is at least this (the index is signed, -1..1, and is not a share of fans). */
export const MIN_INDEX = 0.3;
export const MAX_BANDS = 2;
export const SEGMENT_LIMIT = 15;
export const CITY_BASELINE_LIMIT = 20;
/** The playbook's own sponsor request size: the all-fans list is the same cached request, so it costs no new call after a playbook visit. */
const ALL_FANS_LIMIT = 10;
const TOP = 5;

export interface SegmentItem { name: string; entityId: string; artistRank: number; cityRank: number | null }
export interface SegmentBand {
  band: AgeBand; phrase: string; index: number;
  /** ok: items listed. empty: Qloo returned no brands for this segment. unavailable: Qloo could not break this segment out (needs_input or an error). */
  status: "ok" | "empty" | "unavailable";
  items: SegmentItem[];
  /** Brands removed as non-sponsors (name list plus the model check). */
  hiddenCount: number;
  /** How many of this segment's top 5 are not in the all-fans top 5. Null when the all-fans list was unavailable. */
  newInTop5: number | null;
  /** False when the city baseline was too short to rank against it: then no cityRank claim is made. */
  lifted: boolean;
  sponsorCheck?: "unavailable";
}
export interface SponsorSegments {
  status: "ok" | "no_skew" | "unavailable";
  reason?: "budget" | "demographics" | "location";
  message?: string;
  /** The raw signed over/under-index per age band, as Qloo returned it. */
  indexes: Partial<Record<AgeBand, number>>;
  bands: SegmentBand[];
}

export interface SponsorSegmentsInput { /** Force one age band instead of picking the over-indexing ones (strategist). */ onlyBand?: AgeBand; artistId: string; city: { name: string; country: string; id?: string; lat?: number; lon?: number }; sessionId: string }
export interface SponsorSegmentsDeps {
  qloo: QlooCaller; cities: City[]; signal?: AbortSignal;
  sponsorCheck?: (candidates: SponsorCandidate[], sessionId: string) => Promise<SponsorVerdicts>;
}

/** Signed age indexes from qloo_audience_demographics (results[0].query.age); null when the answer has none. */
export function ageIndexes(env: QlooEnvelope): Partial<Record<AgeBand, number>> | null {
  const first = Array.isArray(env.results) ? (env.results[0] as { query?: { age?: unknown } } | undefined) : undefined;
  const age = first?.query?.age;
  if (!age || typeof age !== "object") return null;
  const out: Partial<Record<AgeBand, number>> = {};
  for (const b of AGE_BANDS) {
    const v = (age as Record<string, unknown>)[b];
    if (typeof v === "number" && Number.isFinite(v)) out[b] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Up to two bands at or above the threshold, highest first (ties keep band order). */
export function pickBands(indexes: Partial<Record<AgeBand, number>>): Array<{ band: AgeBand; index: number }> {
  return AGE_BANDS.flatMap((band) => (indexes[band] !== undefined && indexes[band]! >= MIN_INDEX ? [{ band, index: indexes[band]! }] : []))
    .sort((a, b) => b.index - a.index).slice(0, MAX_BANDS);
}

const unavailable = (reason: NonNullable<SponsorSegments["reason"]>, message: string, indexes: SponsorSegments["indexes"] = {}): SponsorSegments => ({ status: "unavailable", reason, message, indexes, bands: [] });
const usable = (r: CallResult | null): r is CallResult => !!r && (r.envelope.status === "ok" || r.envelope.status === "partial" || r.envelope.status === "degraded");

/**
 * Sponsors by age group. One demographics lookup picks the age bands where this artist's fans over-index; per band, one segment recommend
 * and one city baseline for that segment. Lift is the playbook's own rankLifted. Non-sponsors are hidden by the playbook's rule, with one batched
 * model check across every segment. The "differs from all fans" count compares against the all-fans list rebuilt exactly as the playbook card
 * builds it (same recommend request, so it is served from the cache after a playbook visit).
 * Never throws for a budget stop: that is an `unavailable` answer. Other errors propagate.
 */
export async function runSponsorSegments(input: SponsorSegmentsInput, deps: SponsorSegmentsDeps): Promise<SponsorSegments> {
  const events: GatewayEvent[] = [];
  const d = { qloo: deps.qloo, cities: deps.cities, ...(deps.signal ? { signal: deps.signal } : {}) };
  const ask = (tool: string, args: Record<string, unknown>) => trackedCall(d, input.sessionId, tool, args, events);
  try {
    const demo = await ask("qloo_audience_demographics", { entity: input.artistId, entity_type: "artist" });
    const indexes = usable(demo) ? ageIndexes(demo.envelope) : null;
    if (!indexes) return unavailable("demographics", "Qloo has no age breakdown for this artist.");
    const picked = input.onlyBand ? [{ band: input.onlyBand, index: indexes[input.onlyBand] ?? 0 }] : pickBands(indexes);
    if (picked.length === 0) return { status: "no_skew", indexes, bands: [] };

    // The playbook's own location string (same cached lookups), never a fresh guess.
    const known = findCity(deps.cities, input.city);
    const loc = known ? await resolveLocation(input.artistId, known, d, input.sessionId, events) : undefined;
    if (!loc || loc.status === "unresolved") return unavailable("location", `Qloo couldn't place ${input.city.name} precisely.`, indexes);
    const where = loc.where;

    const [allFansJob, ...bandJobs] = await Promise.all([
      // All-fans top 5: the playbook's two requests, no demographic.
      Promise.all([ask("qloo_recommend", artistTasteArgs("brand", input.artistId, where, ALL_FANS_LIMIT)), ask("qloo_recommend", cityPopularityArgs("brand", where, CITY_BASELINE_LIMIT))]).then(([seg, base]) => ({ seg, base })),
      ...picked.map(async ({ band }) => {
        const phrase = BAND_PHRASE[band];
        const [seg, base] = await Promise.all([
          ask("qloo_recommend", { ...artistTasteArgs("brand", input.artistId, where, SEGMENT_LIMIT), demographic: phrase }),
          ask("qloo_recommend", { ...cityPopularityArgs("brand", where, CITY_BASELINE_LIMIT), demographic: phrase }),
        ]);
        return { seg, base };
      }),
    ]);

    const prepared = [...bandJobs, allFansJob].map(({ seg, base }) => {
      const all = usable(seg) ? dedupeByName(extractEntities(seg.envelope)) : [];
      const listed = dropNonSponsors(all);
      return { seg, base: usable(base) ? base : null, all, listed, desc: usable(seg) ? descriptionsOf(seg.envelope) : new Map<string, string>() };
    });
    const toCandidate = (p: (typeof prepared)[number]): SponsorCandidate[] => p.listed.items.map((e) => ({ entityId: e.entityId, name: e.name, ...(p.desc.has(e.entityId) ? { description: p.desc.get(e.entityId)! } : {}) }));
    // One batched model check for every segment together; the all-fans list is checked on its own (cached per id, so no model call after a playbook visit).
    const segCandidates = [...new Map(prepared.slice(0, -1).flatMap(toCandidate).map((c) => [c.entityId, c])).values()];
    const allCandidates = toCandidate(prepared[prepared.length - 1]!);
    let segCheck: SponsorVerdicts | null = null, allCheck: SponsorVerdicts | null = null;
    if (deps.sponsorCheck) {
      if (deps.signal?.aborted) throw new Aborted();
      [segCheck, allCheck] = await Promise.all([
        segCandidates.length > 0 ? deps.sponsorCheck(segCandidates, input.sessionId) : null,
        allCandidates.length > 0 ? deps.sponsorCheck(allCandidates, input.sessionId) : null,
      ]);
    }

    const lift = (p: (typeof prepared)[number], check: SponsorVerdicts | null) => {
      const kept = keepVerified(p.listed.items, check);
      const l = rankLifted(kept, p.base ? extractEntities(p.base.envelope) : null);
      return { kept, lifted: l.lifted, items: l.items, hidden: p.all.length - kept.length };
    };
    const allFans = lift(prepared[prepared.length - 1]!, allCheck);
    const allTop = usable(allFansJob.seg) ? new Set(allFans.items.slice(0, TOP).map((e) => e.entityId)) : null;

    const bands: SegmentBand[] = picked.map(({ band, index }, i) => {
      const p = prepared[i]!;
      const phrase = BAND_PHRASE[band];
      if (!usable(p.seg)) return { band, phrase, index, status: "unavailable", items: [], hiddenCount: 0, newInTop5: null, lifted: false };
      const l = lift(p, segCheck);
      const items: SegmentItem[] = l.items.map((e, k) => ({ name: e.name, entityId: e.entityId, artistRank: l.lifted ? e.artistRank! : k + 1, cityRank: l.lifted ? e.cityRank ?? null : null }));
      return {
        band, phrase, index, status: p.all.length === 0 ? "empty" : "ok", items, hiddenCount: l.hidden, lifted: l.lifted,
        newInTop5: allTop ? items.slice(0, TOP).filter((it) => !allTop.has(it.entityId)).length : null,
        ...(deps.sponsorCheck && segCheck && !segCheck.available ? { sponsorCheck: "unavailable" as const } : {}),
      };
    });
    return { status: "ok", indexes, bands };
  } catch (err) {
    if (err instanceof BudgetStop) return unavailable("budget", err.message || "Qloo limit reached for now");
    throw err;
  }
}
