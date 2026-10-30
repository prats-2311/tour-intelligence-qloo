import type { GeminiPart, GenerateFn } from "../narrative/gemini.js";

export interface FunctionDeclaration { name: string; description: string; parameters: Record<string, unknown> }
export interface TurnResult { model: string; parts: GeminiPart[]; calls: Array<{ name: string; args: Record<string, unknown> }>; text: string; thoughtSummary: string | null }

/** Strategist turns think briefly: the answer is short and grounded in tool results, and thinking time is most of the latency. */
export const DEFAULT_THINKING_BUDGET = 256;

/** The thinking config for a model: gemini-3.x takes a level (never together with a budget), earlier models a token budget. Thought summaries stay on. */
export function thinkingConfigFor(model: string, budget: number): Record<string, unknown> {
  if (/^gemini-3/.test(model)) return { includeThoughts: true, thinkingLevel: budget <= 1024 ? "low" : "high" };
  return { includeThoughts: true, thinkingBudget: budget };
}

/** STRATEGIST_THINKING_BUDGET as a non-negative integer; anything else is the low default. */
export function thinkingBudgetFromEnv(v: string | undefined): number {
  const n = v === undefined || v.trim() === "" ? NaN : Number(v);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_THINKING_BUDGET;
}

export async function generateTurn(
  generate: GenerateFn, models: string[],
  req: { system: string; contents: Array<{ role: "user" | "model"; parts: GeminiPart[] }>; tools: FunctionDeclaration[] },
  opts: { beforeAttempt?: () => void | Promise<void>; thinkingBudget?: number } = {},
): Promise<TurnResult> {
  // No declarations means a forced text answer: omit tools (Vertex may reject an empty list) and set mode NONE.
  const forceText = req.tools.length === 0;
  const bodyFor = (model: string, lowThinking = true) => ({
    systemInstruction: { parts: [{ text: req.system }] },
    contents: req.contents,
    ...(forceText ? {} : { tools: [{ functionDeclarations: req.tools }] }),
    toolConfig: { functionCallingConfig: { mode: forceText ? "NONE" : "AUTO" } },
    generationConfig: { temperature: 0.3, thinkingConfig: lowThinking ? thinkingConfigFor(model, opts.thinkingBudget ?? DEFAULT_THINKING_BUDGET) : { includeThoughts: true } },
  });
  let last: unknown = new Error("no model configured");
  for (const model of models) {
    await opts.beforeAttempt?.();
    let parts: GeminiPart[];
    try { parts = (await generate(model, bodyFor(model))).candidates?.[0]?.content?.parts ?? []; } catch (err) {
      last = err;
      // If the API rejects the low-thinking fields (a 400-style payload error), try the same model once with the plain config before moving on.
      if (!/\b400\b|INVALID_ARGUMENT|Invalid JSON payload|Unknown name|thinking/i.test(String((err as Error)?.message ?? err))) continue;
      try { await opts.beforeAttempt?.(); parts = (await generate(model, bodyFor(model, false))).candidates?.[0]?.content?.parts ?? []; } catch (err2) { last = err2; continue; }
    }
    const thoughts = parts.filter((p) => p.thought && p.text).map((p) => p.text!.trim());
    return {
      model, parts,
      calls: parts.filter((p) => p.functionCall).map((p) => ({ name: p.functionCall!.name, args: p.functionCall!.args ?? {} })),
      text: parts.filter((p) => !p.thought && p.text).map((p) => p.text!).join(""),
      thoughtSummary: thoughts.length ? thoughts.join("\n\n") : null,
    };
  }
  throw last;
}
