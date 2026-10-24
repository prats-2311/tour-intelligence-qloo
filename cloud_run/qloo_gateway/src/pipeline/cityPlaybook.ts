import { extractEntities, extractMusicTags, extractSharedTaste } from "../extract.js";
import type { City } from "../geo/cities.js";
import { findCity } from "../geo/location.js";
import { displayZones } from "../geo/heat.js";
import type { CallResult, QlooCaller } from "../qlooCall.js";
import { coBillLift } from "../scoring/winnability.js";
import type { CardKind, DataWarning, EvidenceRef, GatewayEvent, NarrateFn, Narrative, PlaybookCard } from "../types.js";
import { activationInputs, Aborted, BudgetStop, resolveLocation, trackedCall } from "./tourBoard.js";
import { LOCAL_DESCRIBE_CAP, LOCAL_SUGGESTIONS, matchPool, matchSuggestion } from "./localActs.js";
import { cityPopularityArgs, LOCAL_ACT_POOL, localActRankArgs } from "./recArgs.js";
import { emptySupportCopy, genreTagNames, HEADLINER_SIZE_UNKNOWN, rankLifted, SIZE_UNCHECKED_COPY, smallerThanHeadliner, SPONSOR_LIFT_NOTE } from "./playbookTrust.js";

/** Size of the baseline lists (the city's own favourites) that lift is measured against. */
const BASELINE_LIMIT = 20;

export type { PlaybookCard } from "../types.js";

function warningsFor(tool: string, r: CallResult): DataWarning[] {
  const e = r.envelope;
  const out: DataWarning[] = [];
  if (e.status === "error") {
    const message = e.summary ?? e.error?.recovery;
    out.push({ tool, kind: "error", ...(e.error?.code ? { code: e.error.code } : {}), ...(message ? { message } : {}) });
  } else if (e.status === "partial" || e.status === "degraded") {
    out.push({ tool, kind: e.status, ...(e.summary ? { message: e.summary } : {}) });
  }
  if (r.stale) out.push({ tool, kind: "stale" });
  return out;
}

/** needs_input is not an error, but the card would otherwise be silently empty: say why. */
const needsInputWarning = (tool: string, r: CallResult): DataWarning[] =>
  r.envelope.status === "needs_input" ? [{ tool, kind: "partial", message: r.envelope.summary ?? "Qloo needs more input for this lookup" }] : [];

const dedupe = (ws: DataWarning[]): DataWarning[] => [...new Map(ws.map((w) => [JSON.stringify(w), w])).values()];

function interleave<T>(lists: T[][], max: number): T[] {
  const out: T[] = [];
  for (let i = 0; out.length < max && lists.some((l) => i < l.length); i += 1) {
    for (const l of lists) if (i < l.length && out.length < max) out.push(l[i]!);
  }
  return out;
}

function card<T>(kind: CardKind, items: T[], refs: EvidenceRef[], warnings: DataWarning[], nonEmpty = items.length > 0): PlaybookCard<T> {
  return { kind, status: nonEmpty ? "ok" : "empty", items, refs, warnings: dedupe(warnings) };
}

export async function* runCityPlaybook(
  input: { artist: string; artistEntityId: string; city: { name: string; country: string; id?: string; lat?: number; lon?: number }; sessionId: string; narrative?: boolean; artistPopularity?: number },
  deps: { qloo: QlooCaller; cities: City[]; signal?: AbortSignal; narrate?: NarrateFn; localActs?: (input: { artist: string; city: { name: string; country: string }; sessionId: string }) => Promise<string[] | null> },
): AsyncGenerator<GatewayEvent> {
  const events: GatewayEvent[] = [];
  try {
    // The location is always checked, using the list's canonical name and ISO-2 country (same strings as the board, so its cache serves): match the city (id, else folded name + country, nearest the given coordinates, else most populous).
    const known = findCity(deps.cities, input.city);
    const loc = known ? await resolveLocation(input.artistEntityId, known, deps, input.sessionId, events) : undefined;
    while (events.length) yield events.shift()!;
    if (!loc || loc.status === "unresolved") {
      yield { type: "error", code: "LOCATION_UNRESOLVED", message: `Qloo couldn't place ${input.city.name} precisely, so no playbook was built from its data.` };
      return;
    }
    const a = await activationInputs(input.artistEntityId, { ...loc, city: known! }, deps, input.sessionId, events);
    while (events.length) yield events.shift()!;
    const ref = (tool: string, r: { cacheKey: string }) => ({ tool, cacheKey: r.cacheKey });

    // Support acts must be smaller than the headliner: use the caller's popularity, else describe by entity id, then by name (cached lookups).
    const sizeWarnings: DataWarning[] = [];
    let headliner = input.artistPopularity !== undefined && Number.isFinite(input.artistPopularity) ? input.artistPopularity : undefined;
    if (headliner === undefined) {
      for (const entity of [input.artistEntityId, input.artist]) {
        try {
          const d = await trackedCall(deps, input.sessionId, "qloo_describe", { entity, type: "artist" }, events);
          const self = extractEntities(d.envelope).find((e) => e.entityId === input.artistEntityId);
          if (self && Number.isFinite(self.popularity)) headliner = self.popularity;
        } catch (err) {
          if (err instanceof Aborted || err instanceof BudgetStop) throw err;
        }
        while (events.length) yield events.shift()!;
        if (headliner !== undefined) break;
      }
    }
    if (headliner === undefined) sizeWarnings.push({ tool: "qloo_describe", kind: "partial", message: HEADLINER_SIZE_UNKNOWN });
    const coScale = smallerThanHeadliner(extractEntities(a.raw.artists.envelope), headliner);
    const candidates = coScale.kept.slice(0, 3);
    const settled = await Promise.allSettled(candidates.map(async (c) => {
      const r = await trackedCall(deps, input.sessionId, "qloo_compare_audiences", { group_a: [input.artistEntityId], group_b: [c.entityId] }, events);
      const warnings = [...warningsFor("qloo_compare_audiences", r), ...needsInputWarning("qloo_compare_audiences", r)];
      const { value: sharedTaste, genreTags } = extractSharedTaste(r.envelope);
      if (sharedTaste === null || Number.isNaN(c.affinity)) {
        return { warnings: [...warnings, { tool: "qloo_compare_audiences", kind: "partial" as const, message: `shared taste unavailable for ${c.name}` }] };
      }
      return {
        warnings,
        lift: { name: c.name, entityId: c.entityId, sharedTaste, localAffinity: c.affinity, lift: coBillLift(sharedTaste, c.affinity), sharedTags: genreTagNames(genreTags), ref: ref("qloo_compare_audiences", r) },
      };
    }));
    while (events.length) yield events.shift()!;
    const bad = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected").map((s) => s.reason);
    if (bad.length) throw bad.find((b) => b instanceof Aborted || b instanceof BudgetStop) ?? bad[0];
    const compared = settled.map((s) => (s as PromiseFulfilledResult<{ warnings: DataWarning[]; lift?: { name: string; entityId: string; sharedTaste: number; localAffinity: number; lift: number; sharedTags: string[]; ref: EvidenceRef } }>).value);
    const coBill = compared.flatMap((c) => (c.lift ? [c.lift] : [])).sort((x, y) => y.lift - x.lift);

    const where = loc.where;
    const [tagsS, proxyS, suggestedS, brandBaseS, movieBaseS, tvBaseS] = await Promise.allSettled([
      trackedCall(deps, input.sessionId, "qloo_entity_tags", { entities: [input.artistEntityId], entity_type: "artist", limit: 10 }, events),
      trackedCall(deps, input.sessionId, "qloo_recommend", cityPopularityArgs("artist", where, LOCAL_ACT_POOL), events),
      deps.localActs ? deps.localActs({ artist: input.artist, city: input.city, sessionId: input.sessionId }) : Promise.resolve(null),
      // City baselines (no artist signal) for lift. Display only: the board's scoring never sees them.
      trackedCall(deps, input.sessionId, "qloo_recommend", cityPopularityArgs("brand", where, BASELINE_LIMIT), events),
      trackedCall(deps, input.sessionId, "qloo_recommend", cityPopularityArgs("movie", where, BASELINE_LIMIT), events),
      trackedCall(deps, input.sessionId, "qloo_recommend", cityPopularityArgs("tv_show", where, BASELINE_LIMIT), events),
    ]);
    while (events.length) yield events.shift()!;
    const failed = [tagsS, proxyS].filter((s): s is PromiseRejectedResult => s.status === "rejected").map((s) => s.reason);
    if (failed.length) throw failed.find((b) => b instanceof Aborted || b instanceof BudgetStop) ?? failed[0];
    const fatalBase = [brandBaseS, movieBaseS, tvBaseS].filter((s): s is PromiseRejectedResult => s.status === "rejected").map((s) => s.reason).find((e) => e instanceof Aborted || e instanceof BudgetStop);
    if (fatalBase) throw fatalBase;
    const baselineOf = (s: PromiseSettledResult<CallResult>) => (s.status === "fulfilled" && s.value.envelope.status !== "error" ? s.value : null);
    const brandBase = baselineOf(brandBaseS), movieBase = baselineOf(movieBaseS), tvBase = baselineOf(tvBaseS);
    const tags = (tagsS as PromiseFulfilledResult<CallResult>).value;
    const proxyRecs = (proxyS as PromiseFulfilledResult<CallResult>).value;
    const candidatesPop = extractEntities(proxyRecs.envelope);
    const proxies = candidatesPop.slice(0, 5); // the city's mainstream: the shared-taste comparison baseline, whatever its size
    const poolScale = smallerThanHeadliner(candidatesPop, headliner);
    const poolKept = poolScale.kept;
    let talentShared: { value: number | null; tags: string[] } = { value: null, tags: [] };
    const talentWarnings: DataWarning[] = [...warningsFor("qloo_recommend", proxyRecs), ...needsInputWarning("qloo_recommend", proxyRecs), ...sizeWarnings];
    const talentRefs: EvidenceRef[] = [ref("qloo_recommend", proxyRecs)];
    // Gemini names are unverified until Qloo finds them: only resolved entities ever become candidates.
    const suggested = suggestedS.status === "fulfilled" ? suggestedS.value : null;
    type Act = ReturnType<typeof extractEntities>[number];
    // A suggestion already in the city pool reuses that entity (no describe); only the first LOCAL_DESCRIBE_CAP others are looked up.
    const poolHits: Act[] = [];
    const toDescribe: string[] = [];
    let skipped = 0;
    for (const name of suggested ?? []) {
      const hit = matchPool(name, candidatesPop);
      if (hit) poolHits.push(hit);
      else if (toDescribe.length < LOCAL_DESCRIBE_CAP) toDescribe.push(name);
      else skipped += 1;
    }
    const resolvedS = await Promise.allSettled(toDescribe.map((name) => trackedCall(deps, input.sessionId, "qloo_describe", { entity: name, type: "artist" }, events)));
    while (events.length) yield events.shift()!;
    const fatal = resolvedS.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => r.reason).find((e) => e instanceof Aborted || e instanceof BudgetStop);
    if (fatal) throw fatal;
    let unresolved = 0;
    const novel: Act[] = [];
    for (const [i, r] of resolvedS.entries()) {
      const top = r.status === "fulfilled" ? matchSuggestion(toDescribe[i]!, r.value.envelope.status, extractEntities(r.value.envelope)) : undefined;
      if (!top) unresolved += 1;
      else if (candidatesPop.some((e) => e.entityId === top.entityId)) poolHits.push(top);
      else novel.push(top);
      if (r.status === "fulfilled") talentRefs.push(ref("qloo_describe", r.value));
    }
    const suggestedIds = new Set([...novel, ...poolHits].map((e) => e.entityId));
    const novelScale = smallerThanHeadliner(novel, headliner);
    const candidateActs = suggested === null ? poolKept : [...new Map([...novelScale.kept, ...poolKept].map((e) => [e.entityId, e])).values()].slice(0, LOCAL_SUGGESTIONS);
    const talentBigger = poolScale.biggerThanHeadliner + novelScale.biggerThanHeadliner;
    const talentUnknown = poolScale.popularityUnknown + novelScale.popularityUnknown;
    let rankUnavailable = false;
    let localActs = candidateActs.slice(0, 5);
    if (candidateActs.length > 0) {
      let ranked: CallResult | null = null;
      try {
        ranked = await trackedCall(deps, input.sessionId, "qloo_rank", localActRankArgs(input.artistEntityId, where, candidateActs.map((p) => p.entityId)), events);
      } catch (err) {
        if (err instanceof Aborted || err instanceof BudgetStop) throw err;
      }
      const rankedActs = ranked ? extractEntities(ranked.envelope) : [];
      if (ranked) talentRefs.push(ref("qloo_rank", ranked));
      if (ranked && rankedActs.length > 0) {
        localActs = rankedActs.slice(0, 5);
        talentWarnings.push(...warningsFor("qloo_rank", ranked));
      } else {
        rankUnavailable = true;
        talentWarnings.push({ tool: "qloo_rank", kind: "partial", message: novel.length > 0 ? "taste ranking unavailable — showing suggested and popular artists unranked" : "taste ranking unavailable — showing the city's most popular artists" });
      }
    }
    if (proxies.length > 0) {
      const cmp = await trackedCall(deps, input.sessionId, "qloo_compare_audiences", { group_a: [input.artistEntityId], group_b: proxies.map((p) => p.entityId) }, events);
      talentRefs.push(ref("qloo_compare_audiences", cmp));
      talentWarnings.push(...warningsFor("qloo_compare_audiences", cmp), ...needsInputWarning("qloo_compare_audiences", cmp));
      const st = extractSharedTaste(cmp.envelope);
      if (st.value === null) talentWarnings.push({ tool: "qloo_compare_audiences", kind: "partial", message: "shared taste unavailable for city mainstream" });
      else talentShared = { value: st.value, tags: genreTagNames(st.genreTags) };
    }
    while (events.length) yield events.shift()!;

    const { raw } = a;
    const sponsorLift = rankLifted(extractEntities(raw.brands.envelope), brandBase ? extractEntities(brandBase.envelope) : null);
    const sponsors = sponsorLift.items;
    const baselineRefs = (r: CallResult | null) => (r ? [ref("qloo_recommend", r)] : []);
    const filmLift = rankLifted(extractEntities(raw.films.envelope), movieBase ? extractEntities(movieBase.envelope) : null, { dropMainstream: true });
    const tvLift = rankLifted(extractEntities(raw.tv.envelope), tvBase ? extractEntities(tvBase.envelope) : null, { dropMainstream: true });
    const mainstreamDropped = filmLift.mainstreamDropped + tvLift.mainstreamDropped;
    const sizeKnown = headliner !== undefined;
    const sizeNote: Record<string, string> = sizeKnown ? {} : { sizeNote: SIZE_UNCHECKED_COPY };
    const coSummary: Record<string, number | string> = sizeKnown
      ? { biggerThanHeadliner: coScale.biggerThanHeadliner, popularityUnknown: coScale.popularityUnknown }
      : sizeNote;
    const coCopy = emptySupportCopy({ artist: input.artist, headlinerKnown: sizeKnown, shown: coBill.length, scaleKept: coScale.kept.length, bigger: coScale.biggerThanHeadliner, unknown: coScale.popularityUnknown, failedCompares: candidates.length - coBill.length });
    const talentCopy = emptySupportCopy({ artist: input.artist, headlinerKnown: sizeKnown, shown: localActs.length, scaleKept: candidateActs.length, bigger: talentBigger, unknown: talentUnknown });
    const artistTags = extractMusicTags(tags.envelope).filter((t) => t.id.startsWith("urn:tag:genre:")).map((t, index) => ({ ...t, entityId: t.id, index }));
    const cards: PlaybookCard[] = [
      { ...card("sponsors", sponsors, [ref("qloo_recommend", raw.brands), ...(sponsorLift.lifted ? baselineRefs(brandBase) : [])], warningsFor("qloo_recommend", raw.brands)),
        ...(sponsorLift.lifted ? { summary: { note: SPONSOR_LIFT_NOTE } } : {}) },
      { ...card("merch", artistTags, [ref("qloo_entity_tags", tags), ref("qloo_recommend", raw.brands)],
        [...warningsFor("qloo_entity_tags", tags), ...warningsFor("qloo_recommend", raw.brands)], artistTags.length > 0 || sponsors.length > 0),
        ...(sponsors.length > 0 ? { summary: { brands: sponsors.slice(0, 5).map((b) => b.name) } } : {}) },
      card("promo_zones", displayZones(a.zones, known!.name).slice(0, 5), [ref("qloo_where_popular", raw.inCity)], warningsFor("qloo_where_popular", raw.inCity)),
      { ...card("local_moment",
        interleave([extractEntities(raw.artists.envelope), filmLift.items, tvLift.items, a.placeEntities], 9),
        [ref("qloo_recommend", raw.artists), ref("qloo_recommend", raw.films), ref("qloo_recommend", raw.tv), ...(a.placeEntities.length > 0 ? [ref("qloo_recommend", raw.places)] : []), ...(filmLift.lifted ? baselineRefs(movieBase) : []), ...(tvLift.lifted ? baselineRefs(tvBase) : [])],
        [raw.artists, raw.films, raw.tv, raw.places].flatMap((r) => warningsFor("qloo_recommend", r))),
        ...(filmLift.lifted || tvLift.lifted ? { summary: { mainstreamDropped } } : {}) },
      card("venue_fit", a.venues.items, a.venues.refs, [...(raw.ranked ? warningsFor("qloo_rank", raw.ranked) : []), ...a.venues.warnings]),
      { ...card("co_billing", coBill, coBill.map((c) => c.ref), [...compared.flatMap((c) => c.warnings), ...sizeWarnings]),
        summary: { ...coSummary, ...coCopy } },
      { ...card("talent", localActs.map(({ name, entityId, affinity }) => ({ name, entityId, affinity, ...(suggested === null ? {} : { source: suggestedIds.has(entityId) ? "suggested" : "city_popular" }) })), talentRefs, talentWarnings),
        summary: { sharedTaste: talentShared.value, sharedTags: talentShared.tags, ...(sizeKnown ? { biggerThanHeadliner: talentBigger, popularityUnknown: talentUnknown } : sizeNote), ...talentCopy, ...(rankUnavailable ? { rankUnavailable: true } : {}), ...(suggested === null ? {} : { suggestionsUnresolved: unresolved, suggestionsSkipped: skipped }) } },
    ];
    yield { type: "playbook", playbook: { city: input.city, cards } };
    if (input.narrative !== false && deps.narrate) {
      if (deps.signal?.aborted) throw new Aborted();
      let narrative: Narrative;
      try {
        narrative = await deps.narrate({ artist: input.artist, city: input.city, cards, sessionId: input.sessionId });
      } catch (err) {
        console.warn(`[narrative] unavailable: ${String((err as Error)?.message ?? err)}`);
        narrative = { status: "unavailable", reason: "error", message: "Narrative unavailable — showing Qloo evidence only" };
      }
      yield { type: "narrative", narrative };
    }
    yield { type: "done", summary: { city: input.city.name } };
  } catch (err) {
    while (events.length) yield events.shift()!;
    if (err instanceof Aborted) { yield { type: "error", code: "ABORTED", message: "client disconnected" }; return; }
    if (err instanceof BudgetStop) { yield { type: "error", code: "BUDGET", message: err.message }; return; }
    yield { type: "error", code: "INTERNAL", message: String((err as Error)?.message ?? err) };
  }
}
