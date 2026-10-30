import { describe, expect, it, vi } from "vitest";
import { strategistModelsFromEnv, strategistTimeoutFromEnv, DEFAULT_STRATEGIST_TIMEOUT_MS } from "../src/strategist/config.js";
import { generateTurn } from "../src/strategist/gemini-tools.js";
import { selectGenerate } from "../src/narrative/provider.js";

const req = { system: "s", contents: [{ role: "user" as const, parts: [{ text: "hi" }] }], tools: [] };
const ok = { candidates: [{ content: { parts: [{ text: "answer" }] } }] };

describe("strategistModelsFromEnv", () => {
  it("defaults to 2.5-flash then 3.8-flash", () => {
    expect(strategistModelsFromEnv({})).toEqual(["gemini-2.5-flash", "gemini-3.8-flash"]);
  });
  it("honours overrides", () => {
    expect(strategistModelsFromEnv({ STRATEGIST_MODEL: "m1", STRATEGIST_FALLBACK_MODEL: "m2" })).toEqual(["m1", "m2"]);
  });
  it("falls back to defaults for empty or whitespace values", () => {
    expect(strategistModelsFromEnv({ STRATEGIST_MODEL: "  ", STRATEGIST_FALLBACK_MODEL: "" })).toEqual(["gemini-2.5-flash", "gemini-3.8-flash"]);
  });
  it("dedupes when both are equal", () => {
    expect(strategistModelsFromEnv({ STRATEGIST_MODEL: "x", STRATEGIST_FALLBACK_MODEL: "x" })).toEqual(["x"]);
  });
  it("is independent of the narrator's GEMINI_MODEL", () => {
    expect(strategistModelsFromEnv({ GEMINI_MODEL: "narr" })[0]).toBe("gemini-2.5-flash");
  });
});

describe("strategistTimeoutFromEnv", () => {
  it("defaults to 12000", () => {
    expect(DEFAULT_STRATEGIST_TIMEOUT_MS).toBe(12_000);
    expect(strategistTimeoutFromEnv(undefined)).toBe(12_000);
    expect(strategistTimeoutFromEnv("")).toBe(12_000);
  });
  it("accepts integers 1000-60000", () => {
    expect(strategistTimeoutFromEnv("1000")).toBe(1000);
    expect(strategistTimeoutFromEnv("45000")).toBe(45000);
    expect(strategistTimeoutFromEnv("60000")).toBe(60000);
  });
  it("rejects out-of-range, fractional and junk values", () => {
    for (const v of ["999", "60001", "12.5", "abc", "-5", "NaN"]) expect(strategistTimeoutFromEnv(v)).toBe(12_000);
  });
});

describe("strategist generate timeout", () => {
  const hang = ((_u: unknown, init?: { signal?: AbortSignal }) => new Promise((_res, rej) => {
    init?.signal?.addEventListener("abort", () => rej(init.signal!.reason));
  })) as unknown as typeof fetch;

  it("selectGenerate passes timeoutMs through: a hung fetch aborts after ~50 ms (vertex and aistudio)", async () => {
    for (const env of [{ GOOGLE_CLOUD_PROJECT: "p" }, { GEMINI_API_KEY: "k" }]) {
      const sel = selectGenerate(env, { getToken: async () => "t", fetchImpl: hang, timeoutMs: 50 });
      const t0 = Date.now();
      await expect(sel.generate!("m", {})).rejects.toThrow();
      expect(Date.now() - t0).toBeLessThan(1000);
    }
  });
  it("without timeoutMs the narrator default stays 30 s", async () => {
    let signal: AbortSignal | undefined;
    const f = (async (_u: unknown, init?: { signal?: AbortSignal }) => { signal = init?.signal; return new Response(JSON.stringify(ok)); }) as unknown as typeof fetch;
    const sel = selectGenerate({ GEMINI_API_KEY: "k" }, { getToken: async () => "t", fetchImpl: f });
    await sel.generate!("m", {});
    expect(signal?.aborted).toBe(false);
  });
  it("a timeout error goes straight to the next model, one call per model", async () => {
    const generate = vi.fn(async (m: string) => {
      if (m === "a") throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      return ok as never;
    });
    const t = await generateTurn(generate as never, ["a", "b"], req);
    expect(t.model).toBe("b");
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it("an AbortError also does not trigger the payload retry", async () => {
    const generate = vi.fn(async (m: string) => {
      if (m === "a") throw new DOMException("This operation was aborted", "AbortError");
      return ok as never;
    });
    await generateTurn(generate as never, ["a", "b"], req);
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
