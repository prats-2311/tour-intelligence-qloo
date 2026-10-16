import type { GeminiPart, GenerateFn } from "../narrative/gemini.js";

export interface FunctionDeclaration { name: string; description: string; parameters: Record<string, unknown> }
export interface TurnResult { model: string; parts: GeminiPart[]; calls: Array<{ name: string; args: Record<string, unknown> }>; text: string; thoughtSummary: string | null }

export async function generateTurn(
  generate: GenerateFn, models: string[],
  req: { system: string; contents: Array<{ role: "user" | "model"; parts: GeminiPart[] }>; tools: FunctionDeclaration[] },
  opts: { beforeAttempt?: () => void | Promise<void> } = {},
): Promise<TurnResult> {
  const body = {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: req.contents,
    tools: [{ functionDeclarations: req.tools }],
    toolConfig: { functionCallingConfig: { mode: "AUTO" } },
    generationConfig: { temperature: 0.3, thinkingConfig: { includeThoughts: true } },
  };
  let last: unknown = new Error("no model configured");
  for (const model of models) {
    await opts.beforeAttempt?.();
    let parts: GeminiPart[];
    try { parts = (await generate(model, body)).candidates?.[0]?.content?.parts ?? []; } catch (err) { last = err; continue; }
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
