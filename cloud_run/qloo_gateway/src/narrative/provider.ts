import { createAiStudioGenerate, createVertexGenerate, type GenerateFn } from "./gemini.js";

export type GeminiProvider = "vertex" | "aistudio" | "none";

/**
 * Picks the Gemini backend from the environment. GEMINI_API_KEY (Google AI Studio) wins over an ambient
 * GOOGLE_CLOUD_PROJECT unless GEMINI_PROVIDER=vertex; with neither, model features are off and the
 * deterministic fallbacks run. Never returns or logs a key value.
 */
export function selectGenerate(
  env: Record<string, string | undefined>,
  deps: { getToken: () => Promise<string>; fetchImpl?: typeof fetch },
): { generate?: GenerateFn; provider: GeminiProvider; note: string } {
  const key = env.GEMINI_API_KEY?.trim();
  const project = env.GOOGLE_CLOUD_PROJECT?.trim();
  const forced = env.GEMINI_PROVIDER?.trim().toLowerCase();
  const fetchPart = deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {};
  if (forced === "vertex" || (!key && project && forced !== "aistudio")) {
    if (!project) return { provider: "none", note: "GEMINI_PROVIDER=vertex but GOOGLE_CLOUD_PROJECT is not set: Gemini features disabled (narration, local acts, strategist fall back to deterministic output)" };
    return { generate: createVertexGenerate({ project, getToken: deps.getToken, ...fetchPart }), provider: "vertex", note: `Gemini via Vertex AI (project ${project})` };
  }
  if (key) return { generate: createAiStudioGenerate({ apiKey: key, ...fetchPart }), provider: "aistudio", note: "Gemini via Google AI Studio (GEMINI_API_KEY)" };
  return { provider: "none", note: "no GEMINI_API_KEY or GOOGLE_CLOUD_PROJECT: Gemini features disabled (narration, local acts, strategist fall back to deterministic output; set GEMINI_API_KEY from Google AI Studio to enable)" };
}
