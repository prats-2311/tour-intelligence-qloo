import { describe, expect, it, vi } from "vitest";
import { generateTurn } from "../src/strategist/gemini-tools.js";

const decl = [{ name: "qloo_recommend", description: "d", parameters: { type: "OBJECT", properties: {} } }];
const req = { system: "sys", contents: [{ role: "user" as const, parts: [{ text: "hi" }] }], tools: decl };

describe("generateTurn", () => {
  it("sends system instruction, tools and thinking config, and returns calls, text and thoughts", async () => {
    const generate = vi.fn(async () => ({ candidates: [{ content: { parts: [
      { text: "Checking sponsors.", thought: true },
      { functionCall: { name: "qloo_recommend", args: { target_type: "brand" } }, thoughtSignature: "sig" },
    ] } }] }));
    const r = await generateTurn(generate, ["m1"], req);
    const body = generate.mock.calls[0]![1] as Record<string, any>;
    expect(body.systemInstruction).toEqual({ parts: [{ text: "sys" }] });
    expect(body.tools).toEqual([{ functionDeclarations: decl }]);
    expect(body.generationConfig.thinkingConfig).toEqual({ includeThoughts: true, thinkingBudget: 256 });
    expect(r.calls).toEqual([{ name: "qloo_recommend", args: { target_type: "brand" } }]);
    expect(r.thoughtSummary).toBe("Checking sponsors.");
    expect(r.parts[1]!.thoughtSignature).toBe("sig");
    expect(r.text).toBe("");
  });
  it("falls back to the next model only when the call throws, reserving before each attempt", async () => {
    const before = vi.fn();
    const generate = vi.fn(async (m: string) => { if (m === "a") throw new Error("Vertex 503"); return { candidates: [{ content: { parts: [{ text: "ok" }] } }] }; });
    const r = await generateTurn(generate, ["a", "b"], req, { beforeAttempt: before });
    expect(r.model).toBe("b");
    expect(before).toHaveBeenCalledTimes(2);
  });
  it("propagates a ceiling refusal from beforeAttempt without calling Vertex", async () => {
    const generate = vi.fn();
    await expect(generateTurn(generate, ["a"], req, { beforeAttempt: () => { throw new Error("capped"); } })).rejects.toThrow("capped");
    expect(generate).not.toHaveBeenCalled();
  });
});
