import { describe, expect, it, vi } from "vitest";
import type { BacktestCase } from "../src/backtest/cases.js";
import { cleanLlmList, llmPrompt, runCase, type RunnerDeps } from "../src/backtest/run.js";
import { createGatewayCaller, parseArgs } from "../src/backtest/cli.js";

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
    expect(parseArgs(["--cases", "a.json", "--out", "b.json", "--only", "x,y"])).toEqual({ cases: "a.json", out: "b.json", only: ["x", "y"] });
    expect(() => parseArgs(["--cases", "a.json"])).toThrow(/--out/);
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
});
