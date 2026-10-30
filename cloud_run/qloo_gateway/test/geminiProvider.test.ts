import { describe, expect, it, vi } from "vitest";
import { createAiStudioGenerate } from "../src/narrative/gemini.js";
import { selectGenerate } from "../src/narrative/provider.js";

describe("createAiStudioGenerate", () => {
  it("posts the same generateContent body to the AI Studio endpoint with the key in a header, never the URL", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 }));
    const gen = createAiStudioGenerate({ apiKey: "KEY-123", fetchImpl });
    const body = { contents: [{ role: "user", parts: [{ text: "hi" }] }] };
    await gen("gemini-x", body);
    const [url, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent");
    expect(url).not.toContain("KEY-123");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("KEY-123");
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual(body);
  });
  it("throws a status-only error that does not leak the key", async () => {
    const gen = createAiStudioGenerate({ apiKey: "KEY-123", fetchImpl: async () => new Response("KEY-123 quota", { status: 429 }) });
    await expect(gen("m", {})).rejects.toThrow(/^AI Studio 429$/);
  });
});

describe("selectGenerate", () => {
  const deps = { getToken: async () => "tok" };
  it("is off with neither key nor project", () => {
    const r = selectGenerate({}, deps);
    expect(r.generate).toBeUndefined();
    expect(r.provider).toBe("none");
    expect(r.note).toMatch(/GEMINI_API_KEY/);
  });
  it("uses Vertex when only GOOGLE_CLOUD_PROJECT is set", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const r = selectGenerate({ GOOGLE_CLOUD_PROJECT: "p1" }, { ...deps, fetchImpl });
    expect(r.provider).toBe("vertex");
    await r.generate!("m", {});
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toContain("aiplatform.googleapis.com/v1/projects/p1/");
  });
  it("uses AI Studio when only GEMINI_API_KEY is set", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const r = selectGenerate({ GEMINI_API_KEY: "k" }, { ...deps, fetchImpl });
    expect(r.provider).toBe("aistudio");
    await r.generate!("m", {});
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toContain("generativelanguage.googleapis.com");
  });
  it("prefers the explicit API key over an ambient project, unless GEMINI_PROVIDER=vertex", () => {
    expect(selectGenerate({ GEMINI_API_KEY: "k", GOOGLE_CLOUD_PROJECT: "p" }, deps).provider).toBe("aistudio");
    expect(selectGenerate({ GEMINI_API_KEY: "k", GOOGLE_CLOUD_PROJECT: "p", GEMINI_PROVIDER: "vertex" }, deps).provider).toBe("vertex");
  });
  it("GEMINI_PROVIDER=vertex without a project is off with a note; blank key counts as unset", () => {
    const r = selectGenerate({ GEMINI_PROVIDER: "vertex", GEMINI_API_KEY: "k" }, deps);
    expect(r.provider).toBe("none");
    expect(r.note).toMatch(/GOOGLE_CLOUD_PROJECT/);
    expect(selectGenerate({ GEMINI_API_KEY: "   " }, deps).provider).toBe("none");
  });
  it("the note never contains the key value", () => {
    expect(JSON.stringify(selectGenerate({ GEMINI_API_KEY: "SECRETVALUE" }, deps))).not.toContain("SECRETVALUE");
  });
});
