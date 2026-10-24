import { describe, expect, it } from "vitest";
import type { BacktestCase } from "../src/backtest/cases.js";
import { buildFixedPrompt, DECOYS, pickDecoys, runFixedRank, scoreFixedCase } from "../src/backtest/fixedRank.js";
import type { CallTool, PermutationRanker } from "../src/backtest/proofShared.js";
import { sha256Hex, StopMonitor } from "../src/backtest/proofStats.js";
import type { QlooEnvelope } from "../src/types.js";

const ent = (id: string, name: string, affinity = 0.5) => ({ entity_id: id, name, affinity, popularity: 0.5 });
const env = (...results: Array<ReturnType<typeof ent>>): QlooEnvelope => ({ operation: "recommend", status: "ok", results });
const caseOf = (over: Partial<BacktestCase> = {}): BacktestCase => ({
  id: "case-one", artist: "Test Artist", city: "Testville", country: "Mexico", activationType: "sponsor", realEntity: { name: "Real Brand", aliases: ["RB"] },
  date: "2024-05", sources: ["https://example.org/a"], summary: "s", review: { status: "accepted", by: "t", at: "2026-10-24" }, ...over,
});
const pool = (n: number, prefix = "Decoy") => Array.from({ length: n }, (_, i) => ({ name: `${prefix} ${i + 1}`, entityId: `00000000-d${i + 1}` }));

describe("pickDecoys", () => {
  it("excludes the real pick (by id, name or alias), takes 9 by sha256(case id + name) ascending", () => {
    const p = [...pool(14), { name: "Real Brand", entityId: "00000000-aaaa" }, { name: "rb", entityId: "00000000-bbbb" }, { name: "Other Name", entityId: "00000000-REAL" }];
    const real = { name: "Real Brand", entityId: "00000000-real", aliases: ["RB"] };
    const picked = pickDecoys("case-one", p, real);
    expect(picked).toHaveLength(DECOYS);
    expect(picked.map((x) => x.name)).not.toContain("Real Brand");
    expect(picked.map((x) => x.name)).not.toContain("rb");
    expect(picked.map((x) => x.entityId.toLowerCase())).not.toContain("00000000-real"); // case-insensitive id match
    const expected = [...p].filter((x) => !["Real Brand", "rb", "Other Name"].includes(x.name)).sort((a, b) => (sha256Hex("case-one" + a.name) < sha256Hex("case-one" + b.name) ? -1 : 1)).slice(0, 9);
    expect(picked.map((x) => x.name)).toEqual(expected.map((x) => x.name));
  });
  it("skips entries without an id and repeated names; fewer than 9 left means fewer returned", () => {
    const p = [...pool(5), { name: "Decoy 1", entityId: "00000000-dup" }, { name: "No Id", entityId: "" }];
    expect(pickDecoys("c", p, { name: "Real", entityId: "r" })).toHaveLength(5);
  });
});

describe("buildFixedPrompt", () => {
  it("uses the protocol wording and lists the names alphabetically", () => {
    const text = buildFixedPrompt("sponsor", "Test Artist", "Testville", ["Zed", "Alpha"]);
    expect(text.startsWith("Rank these for a sponsor with Test Artist in Testville")).toBe(true);
    expect(text.indexOf("Alpha")).toBeLessThan(text.indexOf("Zed"));
    expect(buildFixedPrompt("merch_collab", "A", "C", ["x"])).toContain("for a merch collab with");
  });
});

interface Sent { tool: string; args: Record<string, unknown>; session: string }
function fakeQloo(opts: { sent?: Sent[]; popular?: ReturnType<typeof ent>[]; realResolves?: boolean; artistResolves?: boolean; rank?: "ok" | "empty" | "reverse"; rankFirstReal?: boolean } = {}): CallTool {
  return async (tool, args, session) => {
    opts.sent?.push({ tool, args, session });
    if (tool === "qloo_describe") {
      if (args.type === "artist") return opts.artistResolves === false ? { operation: "describe", status: "empty", results: [] } : env(ent("00000000-artist", String(args.entity)));
      return opts.realResolves === false ? { operation: "describe", status: "empty", results: [] } : env(ent("00000000-real", "Real Brand Official"));
    }
    if (tool === "qloo_recommend") return env(...(opts.popular ?? pool(20).map((p) => ent(p.entityId, p.name))));
    if (tool === "qloo_rank") {
      const ids = args.options as string[];
      if (opts.rank === "empty") return { operation: "rank", status: "ok", results: [] };
      const ordered = opts.rank === "reverse" ? [...ids].reverse() : ids;
      return env(...ordered.map((id, i) => ent(id, `n-${id}`, 0.9 - i * 0.01)));
    }
    return { operation: tool, status: "ok", results: [] };
  };
}
const ranker = (fn: (labels: string[]) => string[] | null, prompts: string[] = []): PermutationRanker => ({
  async rank(prompt, labels) { prompts.push(prompt); const o = fn(labels); return o ? { order: o, attempts: 1, model: "fake" } : { order: null, attempts: 2, reason: "not_a_permutation" }; },
});

describe("scoreFixedCase", () => {
  it("builds 10 candidates (real + 9 decoys), calls the protocol requests, and scores the three arms by reciprocal rank", async () => {
    const sent: Sent[] = [];
    const prompts: string[] = [];
    const r = await scoreFixedCase(caseOf(), { callTool: fakeQloo({ sent, rank: "reverse" }), ranker: ranker((l) => [...l].sort(), prompts), monitor: new StopMonitor() });
    expect(r.candidates).toHaveLength(10);
    expect(r.candidates.filter((c) => c.real)).toHaveLength(1);
    expect(r.realPick).toEqual({ name: "Real Brand Official", entityId: "00000000-real" });
    expect(new Set(sent.map((s) => s.session))).toEqual(new Set(["proof-v3-fixed-case-one"]));
    const pop = sent.find((s) => s.tool === "qloo_recommend")!;
    expect(pop.args).toEqual({ target_type: "brand", signal_location: "Testville, Mexico", limit: 20 });
    const rank = sent.find((s) => s.tool === "qloo_rank")!;
    expect(rank.args).toMatchObject({ option_type: "brand", signals: ["00000000-artist"], signal_location: "Testville, Mexico" });
    expect((rank.args.options as string[]).sort()).toEqual(r.candidates.map((c) => c.entityId).sort());
    expect(prompts[0]).toContain("Rank these for a sponsor with Test Artist in Testville");
    // The real pick is not in the popularity list, so the popularity arm puts it last.
    expect(r.arms.popularity).toMatchObject({ status: "ok", rank: 10, rr: 0.1 });
    for (const arm of ["qloo_rank", "gemini", "popularity"] as const) {
      const a = r.arms[arm];
      if (a.status === "ok") { expect(a.ranking).toHaveLength(10); expect(a.rr).toBeCloseTo(1 / a.rank, 10); }
    }
  });

  it("popularity arm follows the popularity list order, with the real pick at its list position when it is on the list", async () => {
    const popular = [...pool(12).map((p) => ent(p.entityId, p.name)), ent("00000000-real", "Real Brand Official")];
    const r = await scoreFixedCase(caseOf(), { callTool: fakeQloo({ popular }), ranker: ranker((l) => l), monitor: new StopMonitor() });
    const a = r.arms.popularity;
    expect(a.status).toBe("ok");
    if (a.status !== "ok") return;
    const listIdx = (id: string) => popular.findIndex((p) => p.entity_id === id);
    const idxs = a.ranking.map(listIdx);
    expect(idxs).toEqual([...idxs].sort((x, y) => x - y));
    expect(a.ranking.at(-1)).toBe("00000000-real"); // last on the list, so last among the candidates too
  });

  it("the case's own name and aliases are excluded as decoys even when Qloo resolved the real pick to a different name; the popularity arm finds it by name", async () => {
    // describe resolves "Real Brand" to "Real Brand Official"; the popularity list carries the same brand as "Real Brand" (RB) under another id.
    const popular = [ent("00000000-dupe", "Real Brand"), ent("00000000-dupe2", "RB"), ...pool(12).map((p) => ent(p.entityId, p.name))];
    const r = await scoreFixedCase(caseOf(), { callTool: fakeQloo({ popular }), ranker: ranker((l) => l), monitor: new StopMonitor() });
    expect(r.realPick.name).toBe("Real Brand Official");
    expect(r.candidates.map((c) => c.entityId)).not.toContain("00000000-dupe");
    expect(r.candidates.map((c) => c.entityId)).not.toContain("00000000-dupe2");
    expect(r.candidates).toHaveLength(10);
    expect(r.arms.popularity).toMatchObject({ status: "ok", rank: 1 });
  });

  it("Qloo rank: ids it leaves out go after the ones it ranked, in hash order; an empty rank is no answer", async () => {
    const r = await scoreFixedCase(caseOf(), { callTool: fakeQloo({ rank: "reverse" }), ranker: ranker((l) => l), monitor: new StopMonitor() });
    const q = r.arms.qloo_rank;
    expect(q.status).toBe("ok");
    const e = await scoreFixedCase(caseOf(), { callTool: fakeQloo({ rank: "empty" }), ranker: ranker((l) => l), monitor: new StopMonitor() });
    expect(e.arms.qloo_rank).toMatchObject({ status: "no_answer", reason: "rank_unavailable" });
  });

  it("an LLM with no answer leaves that arm out", async () => {
    const r = await scoreFixedCase(caseOf(), { callTool: fakeQloo(), ranker: ranker(() => null), monitor: new StopMonitor() });
    expect(r.arms.gemini).toMatchObject({ status: "no_answer" });
  });

  it("fewer than 9 decoys: excluded as 'too few candidates'", async () => {
    await expect(scoreFixedCase(caseOf(), { callTool: fakeQloo({ popular: pool(6).map((p) => ent(p.entityId, p.name)) }), ranker: ranker((l) => l), monitor: new StopMonitor() }))
      .rejects.toThrow(/too few candidates \(6 decoys/);
  });
  it("unresolved artist or real pick: excluded with the reason", async () => {
    await expect(scoreFixedCase(caseOf(), { callTool: fakeQloo({ artistResolves: false }), ranker: ranker((l) => l), monitor: new StopMonitor() })).rejects.toThrow(/artist unresolved/);
    await expect(scoreFixedCase(caseOf(), { callTool: fakeQloo({ realResolves: false }), ranker: ranker((l) => l), monitor: new StopMonitor() })).rejects.toThrow(/real pick unresolved/);
  });
  it("local artists use option_type artist", async () => {
    const sent: Sent[] = [];
    await scoreFixedCase(caseOf({ activationType: "local_artist" }), { callTool: fakeQloo({ sent }), ranker: ranker((l) => l), monitor: new StopMonitor() });
    expect(sent.find((s) => s.tool === "qloo_rank")!.args.option_type).toBe("artist");
    expect(sent.find((s) => s.tool === "qloo_recommend")!.args.target_type).toBe("artist");
  });
});

describe("runFixedRank", () => {
  const cases = [caseOf({ id: "c-1" }), caseOf({ id: "c-2" }), caseOf({ id: "c-3" })];
  it("excluded cases are listed, others scored, stats computed", async () => {
    let n = 0;
    const call: CallTool = async (t, a, s) => (s === "proof-v3-fixed-c-2" && t === "qloo_recommend" ? env(...pool(3).map((p) => ent(p.entityId, p.name))) : fakeQloo({ rank: "reverse" })(t, a, s));
    const out = await runFixedRank({ cases }, { callTool: call, ranker: ranker((l) => { n += 1; return l; }), monitor: new StopMonitor() });
    expect(out.section.cases.map((c) => c.id)).toEqual(["c-1", "c-3"]);
    expect(out.section.excluded).toEqual([{ id: "c-2", reason: expect.stringContaining("too few candidates") }]);
    expect(out.section.plannedCases).toBe(3);
    expect(out.section.stats.arms.qloo_rank.answered).toBe(2);
    expect(n).toBe(2);
  });
  it("a 429 stops the run: finished cases are kept, the partly scored one is excluded, the rest not run", async () => {
    let calls = 0;
    const call: CallTool = async (t, a, s) => { calls += 1; if (s === "proof-v3-fixed-c-2" && t === "qloo_recommend") throw new Error("qloo_recommend: HTTP 429"); return fakeQloo()(t, a, s); };
    const out = await runFixedRank({ cases }, { callTool: call, ranker: ranker((l) => l), monitor: new StopMonitor() });
    expect(out.stop).toMatch(/429/);
    expect(out.section.cases.map((c) => c.id)).toEqual(["c-1"]);
    expect(out.section.excluded).toEqual([{ id: "c-2", reason: expect.stringMatching(/partly scored/) }]);
    expect(out.section.notRun).toEqual(["c-3"]);
    expect(calls).toBeLessThan(12);
  });
});
