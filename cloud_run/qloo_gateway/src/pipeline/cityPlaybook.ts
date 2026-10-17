import { extractEntities, extractMusicTags, extractSharedTaste } from "../extract.js";
import type { City } from "../geo/cities.js";
import type { CallResult, QlooCaller } from "../qlooCall.js";
import { coBillLift } from "../scoring/winnability.js";
import type { CardKind, DataWarning, EvidenceRef, GatewayEvent, NarrateFn, Narrative, PlaybookCard } from "../types.js";
import { activationInputs, Aborted, BudgetStop, trackedCall } from "./tourBoard.js";
import { LOCAL_DESCRIBE_CAP, LOCAL_SUGGESTIONS, matchPool, matchSuggestion } from "./localActs.js";
import { cityPopularityArgs, LOCAL_ACT_POOL, localActRankArgs } from "./recArgs.js";

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
  input: { artist: string; artistEntityId: string; city: { name: string; country: string }; sessionId: string; narrative?: boolean },
  deps: { qloo: QlooCaller; cities: City[]; signal?: AbortSignal; narrate?: NarrateFn; localActs?: (input: { artist: string; city: { name: string; country: string }; sessionId: string }) => Promise<string[] | null> },
): AsyncGenerator<GatewayEvent> {
  const events: GatewayEvent[] = [];
  try {
    const a = await activationInputs(input.artistEntityId, input.city, deps, input.sessionId, events);
    while (events.length) yield events.shift()!;
    const ref = (tool: string, r: { cacheKey: string }) => ({ tool, cacheKey: r.cacheKey });

    const candidates = extractEntities(a.raw.artists.envelope).slice(0, 3);
    const settled = await Promise.allSettled(candidates.map(async (c) => {
      const r = await trackedCall(deps, input.sessionId, "qloo_compare_audiences", { group_a: [input.artistEntityId], group_b: [c.entityId] }, events);
      const warnings = [...warningsFor("qloo_compare_audiences", r), ...needsInputWarning("qloo_compare_audiences", r)];
      const { value: sharedTaste, tags } = extractSharedTaste(r.envelope);
      if (sharedTaste === null || Number.isNaN(c.affinity)) {
        return { warnings: [...warnings, { tool: "qloo_compare_audiences", kind: "partial" as const, message: `shared taste unavailable for ${c.name}` }] };
      }
      return {
        warnings,
        lift: { name: c.name, entityId: c.entityId, sharedTaste, localAffinity: c.affinity, lift: coBillLift(sharedTaste, c.affinity), sharedTags: tags.slice(0, 3).map((t) => t.name), ref: ref("qloo_compare_audiences", r) },
      };
    }));
    while (events.length) yield events.shift()!;
    const bad = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected").map((s) => s.reason);
    if (bad.length) throw bad.find((b) => b instanceof Aborted || b instanceof BudgetStop) ?? bad[0];
    const compared = settled.map((s) => (s as PromiseFulfilledResult<{ warnings: DataWarning[]; lift?: { name: string; entityId: string; sharedTaste: number; localAffinity: number; lift: number; sharedTags: string[]; ref: EvidenceRef } }>).value);
    const coBill = compared.flatMap((c) => (c.lift ? [c.lift] : [])).sort((x, y) => y.lift - x.lift);

    const where = `${input.city.name}, ${input.city.country}`;
    const [tagsS, proxyS, suggestedS] = await Promise.allSettled([
      trackedCall(deps, input.sessionId, "qloo_entity_tags", { entities: [input.artistEntityId], entity_type: "artist", limit: 10 }, events),
      trackedCall(deps, input.sessionId, "qloo_recommend", cityPopularityArgs("artist", where, LOCAL_ACT_POOL), events),
      deps.localActs ? deps.localActs({ artist: input.artist, city: input.city, sessionId: input.sessionId }) : Promise.resolve(null),
    ]);
    while (events.length) yield events.shift()!;
    const failed = [tagsS, proxyS].filter((s): s is PromiseRejectedResult => s.status === "rejected").map((s) => s.reason);
    if (failed.length) throw failed.find((b) => b instanceof Aborted || b instanceof BudgetStop) ?? failed[0];
    const tags = (tagsS as PromiseFulfilledResult<CallResult>).value;
    const proxyRecs = (proxyS as PromiseFulfilledResult<CallResult>).value;
    const candidatesPop = extractEntities(proxyRecs.envelope);
    const proxies = candidatesPop.slice(0, 5);
    let talentShared: { value: number | null; tags: string[] } = { value: null, tags: [] };
    const talentWarnings: DataWarning[] = [...warningsFor("qloo_recommend", proxyRecs), ...needsInputWarning("qloo_recommend", proxyRecs)];
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
    let unresolved = skipped;
    const novel: Act[] = [];
    for (const [i, r] of resolvedS.entries()) {
      const top = r.status === "fulfilled" ? matchSuggestion(toDescribe[i]!, r.value.envelope.status, extractEntities(r.value.envelope)) : undefined;
      if (!top) unresolved += 1;
      else if (candidatesPop.some((e) => e.entityId === top.entityId)) poolHits.push(top);
      else novel.push(top);
      if (r.status === "fulfilled") talentRefs.push(ref("qloo_describe", r.value));
    }
    const suggestedIds = new Set([...novel, ...poolHits].map((e) => e.entityId));
    const candidateActs = suggested === null ? candidatesPop : [...new Map([...novel, ...candidatesPop].map((e) => [e.entityId, e])).values()].slice(0, LOCAL_SUGGESTIONS);
    let rankUnavailable = false;
    let localActs = suggested === null ? proxies : candidateActs.slice(0, 5);
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
      else talentShared = { value: st.value, tags: st.tags.slice(0, 3).map((t) => t.name) };
    }
    while (events.length) yield events.shift()!;

    const { raw } = a;
    const sponsors = extractEntities(raw.brands.envelope);
    const artistTags = extractMusicTags(tags.envelope).map((t, index) => ({ ...t, entityId: t.id, index }));
    const cards: PlaybookCard[] = [
      card("sponsors", sponsors, [ref("qloo_recommend", raw.brands)], warningsFor("qloo_recommend", raw.brands)),
      card("merch", artistTags, [ref("qloo_entity_tags", tags), ref("qloo_recommend", raw.brands)],
        [...warningsFor("qloo_entity_tags", tags), ...warningsFor("qloo_recommend", raw.brands)], artistTags.length > 0 || sponsors.length > 0),
      card("promo_zones", a.zones.slice(0, 5), [ref("qloo_where_popular", raw.inCity)], warningsFor("qloo_where_popular", raw.inCity)),
      card("local_moment",
        interleave([raw.artists, raw.films, raw.tv, raw.places].map((r) => extractEntities(r.envelope)), 9),
        [ref("qloo_recommend", raw.artists), ref("qloo_recommend", raw.films), ref("qloo_recommend", raw.tv), ref("qloo_recommend", raw.places)],
        [raw.artists, raw.films, raw.tv, raw.places].flatMap((r) => warningsFor("qloo_recommend", r))),
      card("venue_fit", a.venues.items, a.venues.refs, [...(raw.ranked ? warningsFor("qloo_rank", raw.ranked) : []), ...a.venues.warnings]),
      card("co_billing", coBill, coBill.map((c) => c.ref), compared.flatMap((c) => c.warnings)),
      { ...card("talent", localActs.map(({ name, entityId, affinity }) => ({ name, entityId, affinity, ...(suggested === null ? {} : { source: suggestedIds.has(entityId) ? "suggested" : "city_popular" }) })), talentRefs, talentWarnings),
        summary: { sharedTaste: talentShared.value, sharedTags: talentShared.tags, ...(rankUnavailable ? { rankUnavailable: true } : {}), ...(suggested === null ? {} : { suggestionsUnresolved: unresolved }) } },
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
