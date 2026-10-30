import { describe, expect, it, vi } from "vitest";
import { BudgetGuard } from "../src/budget.js";
import type { GeminiResponse } from "../src/narrative/gemini.js";
import type { QlooCaller } from "../src/qlooCall.js";
import { generateTurn, thinkingConfigFor, DEFAULT_THINKING_BUDGET } from "../src/strategist/gemini-tools.js";
import { runStrategist } from "../src/strategist/run.js";
import type { GatewayEvent } from "../src/types.js";
import { recs } from "./fixtures/envelopes.js";

const req = { system: "s", contents: [{ role: "user" as const, parts: [{ text: "hi" }] }], tools: [] };
const ok = { candidates: [{ content: { parts: [{ text: "x" }] } }] };

describe("strategist thinking budget", () => {
  it("defaults low", () => { expect(DEFAULT_THINKING_BUDGET).toBe(256); });
  it("gemini-2.5 models get thinkingBudget, thoughts still included", () => {
    expect(thinkingConfigFor("gemini-2.5-flash", 256)).toEqual({ includeThoughts: true, thinkingBudget: 256 });
  });
  it("gemini-3.x models get thinkingLevel low (never both fields)", () => {
    expect(thinkingConfigFor("gemini-3.8-flash", 256)).toEqual({ includeThoughts: true, thinkingLevel: "low" });
    expect(thinkingConfigFor("gemini-3.8-flash", 4096)).toEqual({ includeThoughts: true, thinkingLevel: "high" });
  });
  it("each model attempt gets its own request body", async () => {
    const generate = vi.fn(async (m: string) => { if (m === "gemini-3.8-flash") throw new Error("503"); return ok; });
    await generateTurn(generate, ["gemini-3.8-flash", "gemini-2.5-flash"], req, { thinkingBudget: 256 });
    const [a, b] = generate.mock.calls.map((c) => (c as unknown as [string, Record<string, any>])[1].generationConfig.thinkingConfig);
    expect(a).toEqual({ includeThoughts: true, thinkingLevel: "low" });
    expect(b).toEqual({ includeThoughts: true, thinkingBudget: 256 });
  });
  it("uses the default when no budget is given", async () => {
    const generate = vi.fn(async () => ok);
    await generateTurn(generate, ["gemini-2.5-flash"], req);
    expect((generate.mock.calls[0] as unknown as [string, any])[1].generationConfig.thinkingConfig.thinkingBudget).toBe(256);
  });
  it("runStrategist passes deps.thinkingBudget through", async () => {
    const generate = vi.fn(async () => ok);
    await (async () => { for await (const _ of runStrategist({ messages: [{ role: "user", text: "q" }], context: {}, sessionId: "s" }, { generate, models: ["gemini-2.5-flash"], thinkingBudget: 128, ceiling: { ceiling: new BudgetGuard({ perSession: 9, perDay: 99 }) }, qloo: { call: vi.fn() } as unknown as QlooCaller, cities: [] })) void _; })();
    expect((generate.mock.calls[0] as unknown as [string, any])[1].generationConfig.thinkingConfig.thinkingBudget).toBe(128);
  });
});

const call = (name: string, args: Record<string, unknown>): GeminiResponse => ({ candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }] });
const text = (t: string): GeminiResponse => ({ candidates: [{ content: { parts: [{ text: t }] } }] });
const script = (...rs: GeminiResponse[]) => vi.fn(async () => { const r = rs.shift(); if (!r) throw new Error("exhausted"); return r; });
const mk = (generate: ReturnType<typeof vi.fn>) => ({ generate, models: ["m"], ceiling: { ceiling: new BudgetGuard({ perSession: 20, perDay: 300 }) }, qloo: { call: vi.fn(async () => ({ envelope: recs(["Cerro"], [0.9]), cacheKey: "k", cached: false, stale: false })) } as unknown as QlooCaller, cities: [] });
const input = { messages: [{ role: "user" as const, text: "q" }], context: {}, sessionId: "s" };
async function collect(g: AsyncGenerator<GatewayEvent>) { const o: GatewayEvent[] = []; for await (const e of g) o.push(e); return o; }

describe("strategist_stage events", () => {
  it("emits thinking, then writing before the turn that follows tool results", async () => {
    const ev = await collect(runStrategist(input, mk(script(call("qloo_recommend", { target_type: "brand" }), text("Done.")))));
    expect(ev.map((e) => e.type === "strategist_stage" ? `stage:${e.stage}` : e.type)).toEqual(
      ["stage:thinking", "strategist_tool_call", "strategist_tool_result", "stage:writing", "strategist_message", "done"]);
  });
  it("a first turn with final text makes exactly one Gemini call", async () => {
    const generate = script(text("Straight answer."));
    const ev = await collect(runStrategist(input, mk(generate)));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(ev.map((e) => e.type)).toEqual(["strategist_stage", "strategist_message", "done"]);
    expect(ev.at(-1)).toMatchObject({ summary: { rounds: 1, toolCalls: 0, forcedFinal: false } });
  });
});
