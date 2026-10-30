type Env = Record<string, string | undefined>;

export const DEFAULT_STRATEGIST_TIMEOUT_MS = 12_000;

const clean = (v: string | undefined, d: string) => (v?.trim() ? v.trim() : d);

/** Strategist-only model order: STRATEGIST_MODEL then STRATEGIST_FALLBACK_MODEL (blank = default; duplicates removed). */
export function strategistModelsFromEnv(env: Env): string[] {
  const models = [clean(env.STRATEGIST_MODEL, "gemini-2.5-flash"), clean(env.STRATEGIST_FALLBACK_MODEL, "gemini-3.8-flash")];
  return models.filter((m, i) => models.indexOf(m) === i);
}

/** STRATEGIST_TIMEOUT_MS: per-Gemini-call timeout, an integer in 1000..60000, else the 12 s default. */
export function strategistTimeoutFromEnv(v: string | undefined): number {
  const n = v === undefined || v.trim() === "" ? NaN : Number(v);
  return Number.isInteger(n) && n >= 1000 && n <= 60_000 ? n : DEFAULT_STRATEGIST_TIMEOUT_MS;
}
