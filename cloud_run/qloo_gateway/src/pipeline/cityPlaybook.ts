import { extractEntities } from "../extract.js";
import type { City } from "../geo/cities.js";
import type { CallResult, QlooCaller } from "../qlooCall.js";
import { coBillLift } from "../scoring/winnability.js";
import type { CardKind, DataWarning, EvidenceRef, GatewayEvent, NarrateFn, Narrative, PlaybookCard } from "../types.js";
import { activationInputs, Aborted, BudgetStop, trackedCall } from "./tourBoard.js";

export type { PlaybookCard } from "../types.js";

function overlapOf(results: unknown): number {
  const r = results as Record<string, unknown> | undefined;
  const v = r && typeof r === "object" ? (r.overlap ?? r.similarity ?? r.score) : undefined;
  return typeof v === "number" && Number.isFinite(v) ? v : Number.NaN;
}

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
  deps: { qloo: QlooCaller; cities: City[]; signal?: AbortSignal; narrate?: NarrateFn },
): AsyncGenerator<GatewayEvent> {
  const events: GatewayEvent[] = [];
  try {
    const a = await activationInputs(input.artistEntityId, input.city, deps, input.sessionId, events);
    while (events.length) yield events.shift()!;
    const ref = (tool: string, r: { cacheKey: string }) => ({ tool, cacheKey: r.cacheKey });

    const candidates = extractEntities(a.raw.artists.envelope).slice(0, 3);
    const settled = await Promise.allSettled(candidates.map(async (c) => {
      const r = await trackedCall(deps, input.sessionId, "qloo_compare_audiences", { group_a: [input.artistEntityId], group_b: [c.entityId] }, events);
      const warnings = warningsFor("qloo_compare_audiences", r);
      const overlap = overlapOf(r.envelope.results);
      if (Number.isNaN(overlap) || Number.isNaN(c.affinity)) {
        return { warnings: [...warnings, { tool: "qloo_compare_audiences", kind: "partial" as const, message: `overlap unavailable for ${c.name}` }] };
      }
      return { warnings, lift: { name: c.name, entityId: c.entityId, overlap, localAffinity: c.affinity, lift: coBillLift(overlap, c.affinity), ref: ref("qloo_compare_audiences", r) } };
    }));
    while (events.length) yield events.shift()!;
    const bad = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected").map((s) => s.reason);
    if (bad.length) throw bad.find((b) => b instanceof Aborted || b instanceof BudgetStop) ?? bad[0];
    const compared = settled.map((s) => (s as PromiseFulfilledResult<{ warnings: DataWarning[]; lift?: { name: string; entityId: string; overlap: number; localAffinity: number; lift: number; ref: EvidenceRef } }>).value);
    const coBill = compared.flatMap((c) => (c.lift ? [c.lift] : [])).sort((x, y) => y.lift - x.lift);

    const where = `${input.city.name}, ${input.city.country}`;
    const [tagsS, proxyS] = await Promise.allSettled([
      trackedCall(deps, input.sessionId, "qloo_entity_tags", { entities: [input.artistEntityId], entity_type: "artist", limit: 10 }, events),
      trackedCall(deps, input.sessionId, "qloo_recommend", { target_type: "artist", filter_location: where, limit: 5 }, events),
    ]);
    while (events.length) yield events.shift()!;
    const failed = [tagsS, proxyS].filter((s): s is PromiseRejectedResult => s.status === "rejected").map((s) => s.reason);
    if (failed.length) throw failed.find((b) => b instanceof Aborted || b instanceof BudgetStop) ?? failed[0];
    const tags = (tagsS as PromiseFulfilledResult<CallResult>).value;
    const proxyRecs = (proxyS as PromiseFulfilledResult<CallResult>).value;
    const proxies = extractEntities(proxyRecs.envelope).slice(0, 5);
    let talentOverlap: number | null = null;
    const talentWarnings: DataWarning[] = [...warningsFor("qloo_recommend", proxyRecs)];
    const talentRefs: EvidenceRef[] = [ref("qloo_recommend", proxyRecs)];
    if (proxies.length > 0) {
      const cmp = await trackedCall(deps, input.sessionId, "qloo_compare_audiences", { group_a: [input.artistEntityId], group_b: proxies.map((p) => p.entityId) }, events);
      talentRefs.push(ref("qloo_compare_audiences", cmp));
      talentWarnings.push(...warningsFor("qloo_compare_audiences", cmp));
      const o = overlapOf(cmp.envelope.results);
      if (Number.isNaN(o)) talentWarnings.push({ tool: "qloo_compare_audiences", kind: "partial", message: "overlap unavailable for city mainstream" });
      else talentOverlap = o;
    }
    while (events.length) yield events.shift()!;

    const { raw } = a;
    const sponsors = extractEntities(raw.brands.envelope);
    const artistTags = extractEntities(tags.envelope);
    const cards: PlaybookCard[] = [
      card("sponsors", sponsors, [ref("qloo_recommend", raw.brands)], warningsFor("qloo_recommend", raw.brands)),
      card("merch", artistTags, [ref("qloo_entity_tags", tags), ref("qloo_recommend", raw.brands)],
        [...warningsFor("qloo_entity_tags", tags), ...warningsFor("qloo_recommend", raw.brands)], artistTags.length > 0 || sponsors.length > 0),
      card("promo_zones", a.zones.slice(0, 5), [ref("qloo_where_popular", raw.inCity)], warningsFor("qloo_where_popular", raw.inCity)),
      card("local_moment",
        interleave([raw.artists, raw.films, raw.tv, raw.places].map((r) => extractEntities(r.envelope)), 9),
        [ref("qloo_recommend", raw.artists), ref("qloo_recommend", raw.films), ref("qloo_recommend", raw.tv), ref("qloo_recommend", raw.places)],
        [raw.artists, raw.films, raw.tv, raw.places].flatMap((r) => warningsFor("qloo_recommend", r))),
      card("venue_fit", raw.ranked ? extractEntities(raw.ranked.envelope).slice(0, 3) : [], raw.ranked ? [ref("qloo_rank", raw.ranked)] : [],
        raw.ranked ? warningsFor("qloo_rank", raw.ranked) : []),
      card("co_billing", coBill, coBill.map((c) => c.ref), compared.flatMap((c) => c.warnings)),
      { ...card("talent", proxies, talentRefs, talentWarnings), summary: { overlap: talentOverlap } },
    ];
    yield { type: "playbook", playbook: { city: input.city, cards } };
    if (input.narrative !== false && deps.narrate) {
      if (deps.signal?.aborted) throw new Aborted();
      let narrative: Narrative;
      try {
        narrative = await deps.narrate({ artist: input.artist, city: input.city, cards, sessionId: input.sessionId });
      } catch {
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
