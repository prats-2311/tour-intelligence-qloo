import { extractEntities } from "../extract.js";
import { cityPopularityArgs } from "../pipeline/recArgs.js";
import { normaliseName } from "../claims/verify.js";
import type { BacktestCase } from "./cases.js";
import { computeFixedStats, FIXED_CANDIDATES, type FixedArmResult, type FixedCaseResult, type FixedRankSection } from "./proofResults.js";
import { monitoredCallTool, type CallTool, type PermutationRanker } from "./proofShared.js";
import { sha256Hex, StopRun, type StopMonitor } from "./proofStats.js";
import { targetType, WIDE_CUTOFF } from "./score.js";

/** Test B: the real pick plus this many decoys = 10 candidates. */
export const DECOYS = FIXED_CANDIDATES - 1;

export interface PoolEntity { name: string; entityId: string }
export class CaseExcluded extends Error {}

const lc = (s: string): string => s.toLowerCase();
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Decoys come from the city popularity list for the target type, never the real pick (matched by entity id, name or alias), without
 * repeats (id or normalised name) or entries lacking an id. The 9 kept are those with the lowest sha256(case id + decoy name).
 */
export function pickDecoys(caseId: string, popular: PoolEntity[], real: { name: string; entityId: string; aliases?: string[] }): PoolEntity[] {
  const realNames = new Set([real.name, ...(real.aliases ?? [])].map(normaliseName).filter((n) => n !== ""));
  const seenIds = new Set<string>([lc(real.entityId)]);
  const seenNames = new Set<string>(realNames);
  const out: PoolEntity[] = [];
  for (const p of popular) {
    const id = lc(p.entityId), name = normaliseName(p.name);
    if (id === "" || seenIds.has(id) || seenNames.has(name)) continue;
    seenIds.add(id); seenNames.add(name);
    out.push(p);
  }
  return out.sort((a, b) => cmp(sha256Hex(caseId + a.name), sha256Hex(caseId + b.name))).slice(0, DECOYS);
}

/** Protocol wording "Rank these for a {activation type} with {artist} in {city}", then the names alphabetically. */
export function buildFixedPrompt(activationType: string, artist: string, city: string, names: string[]): string {
  return [`Rank these for a ${activationType.replaceAll("_", " ")} with ${artist} in ${city}.`, "", ...[...names].sort(cmp).map((n) => `- ${n}`)].join("\n");
}

export interface FixedDeps { callTool: CallTool; ranker: PermutationRanker; monitor: StopMonitor; log?: (line: string) => void }

async function resolveId(call: CallTool, entity: string, type: "artist" | "brand", sessionId: string): Promise<{ entityId: string; name: string } | null> {
  const env = await call("qloo_describe", { entity, type }, sessionId);
  if (env.status !== "ok") return null;
  const top = extractEntities(env)[0];
  return top ? { entityId: top.entityId, name: top.name } : null;
}

const arm = (ranking: string[], realId: string): FixedArmResult => {
  const rank = ranking.findIndex((id) => lc(id) === lc(realId)) + 1;
  return { status: "ok", ranking, rank, rr: 1 / rank };
};

/** One activation case: resolve the artist and the real pick, build 10 candidates, rank them three ways. Throws CaseExcluded (or StopRun). */
export async function scoreFixedCase(c: BacktestCase, deps: FixedDeps): Promise<FixedCaseResult> {
  const call = monitoredCallTool(deps.callTool, deps.monitor);
  const sessionId = `proof-v3-fixed-${c.id}`.slice(0, 128);
  const target = targetType(c.activationType);
  const where = `${c.city}, ${c.country}`;

  const artist = await resolveId(call, c.artist, "artist", sessionId);
  if (!artist) throw new CaseExcluded("artist unresolved");
  const real = await resolveId(call, c.realEntity.name, target, sessionId);
  if (!real) throw new CaseExcluded("real pick unresolved");
  const popEnv = await call("qloo_recommend", cityPopularityArgs(target, where, WIDE_CUTOFF), sessionId);
  if (popEnv.status !== "ok" && popEnv.status !== "partial" && popEnv.status !== "degraded") throw new CaseExcluded(`popularity list unavailable (${popEnv.status})`);
  const popular = extractEntities(popEnv).map((e) => ({ name: e.name, entityId: e.entityId }));
  const decoys = pickDecoys(c.id, popular, { ...real, ...(c.realEntity.aliases ? { aliases: c.realEntity.aliases } : {}) });
  if (decoys.length < DECOYS) throw new CaseExcluded(`too few candidates (${decoys.length} decoys, need ${DECOYS})`);

  const candidates = [{ name: real.name, entityId: real.entityId, real: true }, ...decoys.map((d) => ({ ...d, real: false }))];
  const ids = candidates.map((x) => x.entityId);
  const tie = (a: string, b: string) => cmp(sha256Hex(c.id + a), sha256Hex(c.id + b));

  // Popularity: list order; a candidate not on the list (only the real pick can be) goes after every listed one.
  const listIdx = (id: string) => { const i = popular.findIndex((p) => lc(p.entityId) === lc(id)); return i === -1 ? Number.POSITIVE_INFINITY : i; };
  const popOrder = [...ids].sort((a, b) => (listIdx(a) === listIdx(b) ? tie(a, b) : listIdx(a) - listIdx(b)));

  // Qloo rank: the protocol request. Ids it leaves out go after the ranked ones, in hash order.
  let qloo: FixedArmResult;
  const rankEnv = await call("qloo_rank", { options: ids, option_type: target, signals: [artist.entityId], signal_location: where }, sessionId);
  const ranked = (rankEnv.status === "ok" || rankEnv.status === "partial" || rankEnv.status === "degraded") ? extractEntities(rankEnv).map((e) => e.entityId).filter((id) => ids.some((x) => lc(x) === lc(id))) : [];
  if (ranked.length === 0) qloo = { status: "no_answer", reason: "rank_unavailable" };
  else {
    const listed = new Set(ranked.map(lc));
    qloo = arm([...ranked, ...ids.filter((id) => !listed.has(lc(id))).sort(tie)], real.entityId);
  }

  const names = candidates.map((x) => x.name);
  const idOfName = new Map(candidates.map((x) => [x.name, x.entityId]));
  const answer = await deps.ranker.rank(buildFixedPrompt(c.activationType, c.artist, c.city, names), [...names].sort(cmp));
  const gemini: FixedArmResult = answer.order ? arm(answer.order.map((n) => idOfName.get(n)!), real.entityId) : { status: "no_answer", reason: answer.reason ?? "no_answer" };

  return {
    id: c.id, artist: c.artist, city: c.city, country: c.country, activationType: c.activationType, status: "scored",
    realPick: { name: real.name, entityId: real.entityId }, candidates,
    arms: { qloo_rank: qloo, gemini, popularity: arm(popOrder, real.entityId) },
    ...(answer.model && answer.order ? { geminiModel: answer.model } : {}),
  };
}

export interface FixedRankRun { section: FixedRankSection; stop?: string; callCounts: StopMonitor["counts"]; geminiUsed: string[] }

export async function runFixedRank(plan: { cases: BacktestCase[] }, deps: FixedDeps, onProgress?: (s: FixedRankSection) => void): Promise<FixedRankRun> {
  const cases: FixedCaseResult[] = [];
  const excluded: FixedRankSection["excluded"] = [];
  const notRun: string[] = [];
  const used = new Set<string>();
  let stop: string | undefined;
  const section = (): FixedRankSection => ({ plannedCases: plan.cases.length, cases, excluded, notRun, stats: computeFixedStats(cases) });
  for (const c of plan.cases) {
    if (stop) { notRun.push(c.id); continue; }
    try {
      const r = await scoreFixedCase(c, deps);
      cases.push(r);
      if (r.geminiModel) used.add(r.geminiModel);
      deps.log?.(`fixed ${c.id}: qloo ${r.arms.qloo_rank.status === "ok" ? r.arms.qloo_rank.rank : "-"} gemini ${r.arms.gemini.status === "ok" ? r.arms.gemini.rank : "-"} popularity ${r.arms.popularity.status === "ok" ? r.arms.popularity.rank : "-"} | qloo ${deps.monitor.counts.qloo} gemini ${deps.monitor.counts.gemini}`);
    } catch (err) {
      if (err instanceof StopRun) {
        stop = err.reason;
        excluded.push({ id: c.id, reason: `partly scored when the run stopped (${err.reason})` });
        deps.log?.(`STOP: ${err.reason}`);
      } else {
        const reason = err instanceof CaseExcluded ? err.message : `unexpected error: ${String((err as Error)?.message ?? err)}`;
        excluded.push({ id: c.id, reason });
        deps.log?.(`fixed ${c.id}: excluded (${reason})`);
      }
    }
    onProgress?.(section());
  }
  return { section: section(), ...(stop ? { stop } : {}), callCounts: { ...deps.monitor.counts }, geminiUsed: [...used] };
}
