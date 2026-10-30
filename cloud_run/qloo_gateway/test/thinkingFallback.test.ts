import { describe, expect, it, vi } from "vitest";
import { generateTurn } from "../src/strategist/gemini-tools.js";

const req = { system: "s", contents: [{ role: "user" as const, parts: [{ text: "hi" }] }], tools: [] };
const ok = { candidates: [{ content: { parts: [{ text: "answer" }] } }] };

describe("strategist thinking fallback", () => {
  it("retries the same model without the low-thinking fields when the API rejects them", async () => {
    const bodies: Array<Record<string, any>> = [];
    const generate = vi.fn(async (_m: string, body: Record<string, any>) => {
      bodies.push(body);
      const tc = body.generationConfig.thinkingConfig;
      if ("thinkingLevel" in tc || "thinkingBudget" in tc) throw new Error("Vertex 400: Invalid JSON payload received. Unknown name \"thinkingLevel\"");
      return ok as never;
    });
    const t = await generateTurn(generate as never, ["gemini-3.8-flash"], req);
    expect(t.text).toBe("answer");
    expect(t.model).toBe("gemini-3.8-flash");
    expect(bodies).toHaveLength(2);
    expect(bodies[1].generationConfig.thinkingConfig).toEqual({ includeThoughts: true });
  });
  it("does not retry when the low-thinking request succeeds", async () => {
    const generate = vi.fn(async () => ok as never);
    await generateTurn(generate as never, ["gemini-3.8-flash"], req);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});

describe("strategist thinking fallback scope", () => {
  it("moves straight to the next model on a non-payload error", async () => {
    const generate = vi.fn(async (m: string) => { if (m === "a") throw new Error("Vertex 503: unavailable"); return ok as never; });
    const t = await generateTurn(generate as never, ["a", "b"], req);
    expect(t.model).toBe("b");
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
