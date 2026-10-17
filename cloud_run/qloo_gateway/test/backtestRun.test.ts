import { describe, expect, it, vi } from "vitest";
import type { BacktestCase } from "../src/backtest/cases.js";
import { cleanLlmList, GatewayAuthError, llmPrompt, runCase, type RunnerDeps } from "../src/backtest/run.js";
import { createGatewayCaller, MAX_CASES, parseArgs, selectCases } from "../src/backtest/cli.js";
import { buildResults } from "../src/backtest/score.js";

const c: BacktestCase = {
  id: "a-gdl-vans", artist: "Mac DeMarco", city: "Guadalajara", country: "Mexico", activationType: "sponsor",
  realEntity: { name: "Vans" }, date: "2024-03", sources: ["https://e.com"], summary: "s",
  review: { status: "accepted", by: "prateek", at: "2026-10-18" },
};
const env = (results: unknown[], status = "ok") => ({ operation: "x", status, results }) as never;
const ent = (name: string, id: string) => ({ entity_id: id, name, subtype: "urn:entity:brand", affinity: 0.9 });

function deps(over: Partial<Record<string, unknown>> = {}): RunnerDeps & { calls: Array<[string, Record<string, unknown>, string]> } {
  const calls: Array<[string, Record<string, unknown>, string]> = [];
  return {
    calls,
    callTool: async (name, args, sessionId) => {
      calls.push([name, args, sessionId]);
      if (name === "qloo_describe" && args.type === "artist") return (over.artist as never) ?? env([ent("Mac DeMarco", "ART")]);
      if (name === "qloo_describe") return (over.entity as never) ?? env([ent("Vans", "VANS")]);
      if ("signals" in args) return (over.ours as never) ?? env([ent("Converse", "CON"), ent("Vans", "VANS")]);
      return (over.pop as never) ?? env([ent("Coca-Cola", "COKE")]);
    },
    llmList: async () => ("llm" in over ? (over.llm as string[] | null) : ["Vans", "Nike"]),
  };
}

describe("runCase", () => {
  it("asks the three methods the same question and ranks the real entity", async () => {
    const d = deps();
    const r = await runCase(c, d);
    expect(r.realEntity).toEqual({ name: "Vans", entityId: "VANS", resolved: true });
    expect(r.results.qloo_playbook).toMatchObject({ status: "ok", rank: 2 });
    expect(r.results.city_popularity).toMatchObject({ status: "ok", rank: null });
    expect(r.results.llm_only).toMatchObject({ status: "ok", rank: 1 });
    expect(r.decision).toBe("Which sponsor to pitch");
    const recs = d.calls.filter(([n]) => n === "qloo_recommend");
    expect(recs.map(([, a]) => a)).toEqual([
      { target_type: "brand", signals: ["ART"], signal_location: "Guadalajara, Mexico", limit: 20 },
      { target_type: "brand", signal_location: "Guadalajara, Mexico", limit: 20 },
    ]);
    expect(new Set(d.calls.map(([, , s]) => s))).toEqual(new Set(["backtest-a-gdl-vans"]));
  });

  it("still scores by name when the real entity does not resolve", async () => {
    const r = await runCase(c, deps({ entity: env([], "needs_input"), ours: env([{ name: "Vans", entity_id: "V2" }]) }));
    expect(r.realEntity).toEqual({ name: "Vans", entityId: null, resolved: false });
    expect(r.results.qloo_playbook).toMatchObject({ status: "ok", rank: 1 });
  });

  it("marks Qloo methods unavailable when the artist cannot be resolved, but still runs the LLM", async () => {
    const r = await runCase(c, deps({ artist: env([], "needs_input") }));
    expect(r.results.qloo_playbook).toEqual({ status: "unavailable", reason: "artist_unresolved" });
    expect(r.results.city_popularity).toEqual({ status: "unavailable", reason: "artist_unresolved" });
    expect(r.results.llm_only.status).toBe("ok");
  });

  it("marks one method unavailable on an error envelope or a thrown call", async () => {
    const d = deps({ pop: env([], "error") });
    const r = await runCase(c, d);
    expect(r.results.city_popularity).toEqual({ status: "unavailable", reason: "qloo_error" });
    const d2 = deps();
    d2.callTool = vi.fn(async (name: string, args: Record<string, unknown>, s: string) => {
      if (name === "qloo_recommend" && "signals" in args) throw new Error("HTTP 503");
      return deps().callTool(name, args, s);
    });
    expect((await runCase(c, d2)).results.qloo_playbook).toEqual({ status: "unavailable", reason: "request_failed" });
  });

  it("marks the LLM unavailable when it returns nothing usable", async () => {
    const r = await runCase(c, deps({ llm: null }));
    expect(r.results.llm_only).toEqual({ status: "unavailable", reason: "llm_unavailable" });
  });

  it("uses artist targets for local acts", async () => {
    const d = deps();
    await runCase({ ...c, activationType: "local_artist", realEntity: { name: "Caloncho" } }, d);
    expect(d.calls.find(([n, a]) => n === "qloo_describe" && a.entity === "Caloncho")?.[1]).toEqual({ entity: "Caloncho", type: "artist" });
    expect(d.calls.filter(([n]) => n === "qloo_recommend").every(([, a]) => a.target_type === "artist")).toBe(true);
  });
});

describe("runCase local acts ranked by taste fit", () => {
  const local: BacktestCase = { ...c, activationType: "local_artist", realEntity: { name: "Caloncho" } };
  const pool = Array.from({ length: 20 }, (_, i) => ent(`Act ${i + 1}`, `A${i + 1}`));
  const rankedOf = (idxs: number[]) => env(idxs.map((i) => ({ ...pool[i - 1]!, affinity: 0.9 })));
  function localDeps(over: { rank?: unknown; rankThrows?: boolean } = {}) {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const d: RunnerDeps = {
      callTool: async (name, args) => {
        calls.push([name, args]);
        if (name === "qloo_describe" && args.type === "artist") return env([args.entity === "Caloncho" ? ent("Caloncho", "A15") : ent("Mac DeMarco", "ART")]);
        if (name === "qloo_recommend") return env(pool);
        if (over.rankThrows) throw new Error("HTTP 503");
        return (over.rank as never) ?? rankedOf([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
      },
      llmList: async () => ["Caloncho"],
    };
    return { d, calls };
  }
  it("lists the rank of the first 10 city-popular artists, then the remaining city-popular ones, with no duplicates", async () => {
    const { d, calls } = localDeps();
    const r = await runCase(local, d);
    const rank = calls.filter(([n]) => n === "qloo_rank");
    expect(rank).toEqual([["qloo_rank", { options: pool.slice(0, 10).map((e) => e.entity_id), option_type: "artist", signals: ["ART"], signal_location: "Guadalajara, Mexico" }]]);
    expect(calls.filter(([n]) => n === "qloo_recommend").map(([, a]) => a)).toEqual([{ target_type: "artist", signal_location: "Guadalajara, Mexico", limit: 20 }]);
    // Caloncho is A15 in city order; it sits at position 15 in the combined list (10 ranked + A11..A20)
    expect(r.results.qloo_playbook).toMatchObject({ status: "ok", rank: 15 });
    expect(r.results.qloo_playbook).not.toHaveProperty("note");
    expect((r.results.qloo_playbook as { top: Array<{ entityId: string }> }).top.map((i) => i.entityId)).toEqual(["A10", "A9", "A8", "A7", "A6", "A5", "A4", "A3", "A2", "A1"]);
    expect(r.results.city_popularity).toMatchObject({ status: "ok", rank: 15 });
  });
  it("ranks a real entity inside the first 10 by taste order, not city order", async () => {
    const { d } = localDeps();
    const r = await runCase({ ...local, realEntity: { name: "Act 10" } }, { ...d, callTool: async (n, a, s) => (n === "qloo_describe" && a.entity === "Act 10" ? env([ent("Act 10", "A10")]) : d.callTool(n, a, s)) });
    expect(r.results.qloo_playbook).toMatchObject({ rank: 1 });
    expect(r.results.city_popularity).toMatchObject({ rank: 10 });
  });
  it("keeps the city-popularity order, status ok, and records rank_unavailable when rank fails", async () => {
    for (const over of [{ rankThrows: true }, { rank: env([], "empty") }, { rank: env([], "error") }]) {
      const { d } = localDeps(over);
      const r = await runCase(local, d);
      expect(r.results.qloo_playbook).toMatchObject({ status: "ok", rank: 15, note: "rank_unavailable" });
      expect((r.results.qloo_playbook as { top: Array<{ entityId: string }> }).top[0]!.entityId).toBe("A1");
    }
  });
  it("keeps propagating gateway auth errors from the rank call", async () => {
    const { d } = localDeps();
    const inner = d.callTool;
    d.callTool = async (n, a, s) => { if (n === "qloo_rank") throw new GatewayAuthError(403); return inner(n, a, s); };
    await expect(runCase(local, d)).rejects.toThrow(/gcloud auth login/);
  });
  it("leaves brand cases on artist-taste recommend with no rank call", async () => {
    const d = deps();
    await runCase({ ...c, activationType: "merch_collab" }, d);
    expect(d.calls.some(([n]) => n === "qloo_rank")).toBe(false);
    expect(d.calls.filter(([n]) => n === "qloo_recommend").map(([, a]) => a)).toEqual([
      { target_type: "brand", signals: ["ART"], signal_location: "Guadalajara, Mexico", limit: 20 },
      { target_type: "brand", signal_location: "Guadalajara, Mexico", limit: 20 },
    ]);
  });
  it("marks both Qloo methods unavailable when the city-popular list itself fails", async () => {
    const { d } = localDeps();
    const inner = d.callTool;
    d.callTool = async (n, a, s) => (n === "qloo_recommend" ? env([], "error") : inner(n, a, s));
    const r = await runCase(local, d);
    expect(r.results.qloo_playbook).toEqual({ status: "unavailable", reason: "qloo_error" });
  });
});

describe("runCase hardening", () => {
  it("treats a malformed envelope from callTool as a per-method failure", async () => {
    const d = deps();
    const inner = d.callTool;
    d.callTool = async (name, args, s) => (name === "qloo_recommend" && "signals" in args ? (undefined as never) : inner(name, args, s));
    const r = await runCase(c, d);
    expect(r.results.qloo_playbook).toEqual({ status: "unavailable", reason: "request_failed" });
    expect(r.results.city_popularity.status).toBe("ok");
  });
  it("propagates auth failures instead of marking methods unavailable", async () => {
    const d = deps();
    d.callTool = async () => { throw new GatewayAuthError(401); };
    await expect(runCase(c, d)).rejects.toThrow(/gcloud auth login/);
  });
  it("marks the LLM unavailable when llmList throws", async () => {
    const d = deps();
    d.llmList = async () => { throw new Error("vertex down"); };
    expect((await runCase(c, d)).results.llm_only).toEqual({ status: "unavailable", reason: "llm_unavailable" });
  });
});

describe("results status and case cap", () => {
  it("marks results partial or complete", () => {
    expect(buildResults([], { runAt: "x", model: "m" }).status).toBe("complete");
    expect(buildResults([], { runAt: "x", model: "m", status: "partial" }).status).toBe("partial");
  });
  it("records the method and its note, defaulting to v2", () => {
    expect(buildResults([], { runAt: "x", model: "m" })).toMatchObject({ method: "v2", methodNote: "" });
    expect(buildResults([], { runAt: "x", model: "m", method: "v1", methodNote: "note" })).toMatchObject({ method: "v1", methodNote: "note" });
  });
  it("refuses more than the budget cap of cases", () => {
    const many = Array.from({ length: MAX_CASES + 1 }, (_, i) => ({ ...c, id: `c${i}` }));
    expect(() => selectCases(many, undefined, 0)).toThrow(/at most 30/);
    expect(() => selectCases(many, many.slice(0, 3).map((x) => x.id), 0)).not.toThrow();
  });
});

describe("LLM list handling", () => {
  it("dedupes, drops blanks, caps at 20", () => {
    const items = [{ name: "Vans" }, { name: " vans " }, { name: "" }, ...Array.from({ length: 30 }, (_, i) => ({ name: `B${i}` }))];
    const out = cleanLlmList({ items })!;
    expect(out[0]).toBe("Vans");
    expect(out).toHaveLength(20);
    expect(out.filter((n) => n.trim().toLowerCase() === "vans")).toHaveLength(1);
  });
  it("returns null for malformed output", () => {
    expect(cleanLlmList({ nope: 1 })).toBeNull();
    expect(cleanLlmList({ items: [] })).toBeNull();
  });
  it("never puts the real entity in the prompt", () => {
    expect(llmPrompt(c)).not.toContain("Vans");
    expect(llmPrompt(c)).toContain("Mac DeMarco");
    expect(llmPrompt({ ...c, activationType: "local_artist" })).toContain("artists");
  });
});

describe("cli helpers", () => {
  it("parses args", () => {
    expect(parseArgs(["--cases", "a.json", "--out", "/var/tmp/b.json", "--only", "x,y"])).toEqual({ cases: "a.json", out: "/var/tmp/b.json", only: ["x", "y"] });
    expect(parseArgs(["--cases", "a.json"]).out).toMatch(/private-data\/backtest\/results-/);
    expect(parseArgs(["--cases", "a.json", "--out", "/var/tmp/b.json", "--method-note", "ranked local acts"]).methodNote).toBe("ranked local acts");
    expect(parseArgs(["--cases", "a.json", "--out", "/var/tmp/b.json"])).not.toHaveProperty("methodNote");
  });

  it("calls the gateway with auth and session headers, retries 5xx, and never leaks the token in errors", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ envelope: { operation: "recommend", status: "ok", results: [] } }), { status: 200 }));
    const call = createGatewayCaller({ baseUrl: "https://gw.example/", token: "SECRET-TOKEN", fetchImpl, backoffMs: 0 });
    const envelope = await call("qloo_recommend", { target_type: "brand" }, "backtest-x");
    expect(envelope.status).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://gw.example/v1/tools/qloo_recommend");
    expect(init.headers).toMatchObject({ authorization: "Bearer SECRET-TOKEN", "x-session-id": "backtest-x", "content-type": "application/json" });

    const failing = createGatewayCaller({ baseUrl: "https://gw.example", token: "SECRET-TOKEN", fetchImpl: vi.fn().mockResolvedValue(new Response("no", { status: 500 })), backoffMs: 0, retries: 1 });
    await expect(failing("qloo_recommend", {}, "s")).rejects.toThrow(/HTTP 500/);
    await failing("qloo_recommend", {}, "s").catch((e: Error) => expect(e.message).not.toContain("SECRET-TOKEN"));
  });

  const mk = (fetchImpl: typeof fetch) => createGatewayCaller({ baseUrl: "https://gw.example", token: "SECRET-TOKEN", fetchImpl, backoffMs: 0 });
  it("uses a single prefix on 4xx and does not retry", async () => {
    const f = vi.fn().mockResolvedValue(new Response("nf", { status: 404 }));
    await expect(mk(f)("qloo_recommend", {}, "s")).rejects.toThrow(/^qloo_recommend: HTTP 404$/);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("throws GatewayAuthError on 401 and 403 without retrying", async () => {
    for (const status of [401, 403]) {
      const f = vi.fn().mockResolvedValue(new Response("x", { status }));
      const err = await mk(f)("qloo_recommend", {}, "s").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(GatewayAuthError);
      expect((err as Error).message).toContain(`HTTP ${status}`);
      expect((err as Error).message).not.toContain("SECRET-TOKEN");
      expect(f).toHaveBeenCalledTimes(1);
    }
  });
  it("retries 429", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("slow", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ envelope: { operation: "x", status: "ok", results: [] } }), { status: 200 }));
    expect((await mk(f)("qloo_recommend", {}, "s")).status).toBe("ok");
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("rejects a 200 without a usable envelope", async () => {
    for (const body of [{}, { envelope: "nope" }, { envelope: null }]) {
      const f = vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), { status: 200 }));
      await expect(mk(f)("qloo_recommend", {}, "s")).rejects.toThrow(/malformed response/);
    }
  });
});
