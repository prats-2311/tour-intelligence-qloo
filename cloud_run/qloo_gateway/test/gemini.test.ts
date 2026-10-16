import { describe, expect, it, vi } from "vitest";
import { createVertexGenerate, generateJson, splitResponse } from "../src/narrative/gemini.js";

describe("gemini", () => {
  it("splitResponse separates thought parts from the answer text", () => {
    expect(splitResponse({ candidates: [{ content: { parts: [{ text: "t1", thought: true }, { text: "t2", thought: true }, { text: "{}" }] } }] }))
      .toEqual({ thoughtSummary: "t1\n\nt2", text: "{}" });
    expect(splitResponse({})).toEqual({ thoughtSummary: null, text: "" });
  });
  it("createVertexGenerate posts to the global Vertex endpoint with a bearer token", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 }));
    const gen = createVertexGenerate({ project: "p1", getToken: async () => "tok", fetchImpl });
    await gen("gemini-x", { contents: [] });
    const [url, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("https://aiplatform.googleapis.com/v1/projects/p1/locations/global/publishers/google/models/gemini-x:generateContent");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });
  it("createVertexGenerate throws on a non-2xx response", async () => {
    const gen = createVertexGenerate({ project: "p1", getToken: async () => "tok", fetchImpl: async () => new Response("quota", { status: 429 }) });
    await expect(gen("m", {})).rejects.toThrow("Vertex 429");
  });
  it("generateJson tries models in order and reports which one answered", async () => {
    const gen = vi.fn(async (m: string) => { if (m === "a") throw new Error("x"); return { candidates: [{ content: { parts: [{ text: "{\"ok\":1}" }] } }] }; });
    expect(await generateJson(gen, ["a", "b"], {})).toEqual({ model: "b", thoughtSummary: null, json: { ok: 1 } });
  });
  it("generateJson throws when every model fails", async () => {
    await expect(generateJson(async () => { throw new Error("down"); }, ["a", "b"], {})).rejects.toThrow("down");
  });
  it("generateJson does not fall back on malformed JSON from the first model", async () => {
    const gen = vi.fn(async () => ({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }));
    await expect(generateJson(gen, ["a", "b"], {})).rejects.toThrow();
    expect(gen).toHaveBeenCalledTimes(1);
  });
  it("generateJson calls beforeAttempt once per Vertex attempt, including the fallback", async () => {
    const gen = vi.fn(async (m: string) => { if (m === "a") throw new Error("Vertex 503"); return { candidates: [{ content: { parts: [{ text: "{}" }] } }] }; });
    const before = vi.fn();
    await generateJson(gen, ["a", "b"], {}, { beforeAttempt: before });
    expect(before).toHaveBeenCalledTimes(2);
  });
  it("generateJson stops without calling Vertex when beforeAttempt refuses", async () => {
    const gen = vi.fn(async () => ({}));
    await expect(generateJson(gen, ["a", "b"], {}, { beforeAttempt: () => { throw new Error("capped"); } })).rejects.toThrow("capped");
    expect(gen).not.toHaveBeenCalled();
  });
});
