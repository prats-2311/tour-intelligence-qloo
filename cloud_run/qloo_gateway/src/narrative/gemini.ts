export interface GeminiPart { text?: string; thought?: boolean }
export interface GeminiResponse { candidates?: Array<{ content?: { parts?: GeminiPart[] } }> }
export type GenerateFn = (model: string, body: Record<string, unknown>) => Promise<GeminiResponse>;

export function createVertexGenerate(opts: { project: string; getToken: () => Promise<string>; fetchImpl?: typeof fetch; timeoutMs?: number }): GenerateFn {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return async (model, body) => {
    const url = `https://aiplatform.googleapis.com/v1/projects/${opts.project}/locations/global/publishers/google/models/${model}:generateContent`;
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { authorization: `Bearer ${await opts.getToken()}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    });
    if (!res.ok) throw new Error(`Vertex ${res.status}`);
    return (await res.json()) as GeminiResponse;
  };
}

export function splitResponse(r: GeminiResponse): { thoughtSummary: string | null; text: string } {
  const parts = r.candidates?.[0]?.content?.parts ?? [];
  const thoughts = parts.filter((p) => p.thought && p.text).map((p) => p.text!.trim());
  const text = parts.filter((p) => !p.thought && p.text).map((p) => p.text!).join("");
  return { thoughtSummary: thoughts.length ? thoughts.join("\n\n") : null, text };
}

export async function generateJson(generate: GenerateFn, models: string[], body: Record<string, unknown>) {
  let last: unknown = new Error("no model configured");
  for (const model of models) {
    try {
      const { thoughtSummary, text } = splitResponse(await generate(model, body));
      return { model, thoughtSummary, json: JSON.parse(text) as unknown };
    } catch (err) {
      last = err;
    }
  }
  throw last;
}
