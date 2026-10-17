import type { WithoutQloo } from "./types";

/** Shown in the showcase when the recording carries no generic-LLM ranking. */
export const WITHOUT_SHOWCASE_MISSING: WithoutQloo = { status: "unavailable", reason: "disabled", message: "This recording has no generic ranking" };

const isStr = (v: unknown): v is string => typeof v === "string";

/** Validates a gateway (or recorded) `WithoutQloo` value; returns null when it is malformed. */
export function parseWithoutQloo(v: unknown): WithoutQloo | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.status === "ok") {
    const ranked = o.ranked;
    if (!Array.isArray(ranked) || !ranked.every((r) => !!r && isStr((r as Record<string, unknown>).name) && isStr((r as Record<string, unknown>).country))) return null;
    return { status: "ok", ranked: ranked as Array<{ name: string; country: string }>, model: isStr(o.model) ? o.model : "", cached: o.cached === true };
  }
  if (o.status === "unavailable" && isStr(o.reason) && isStr(o.message)) return v as WithoutQloo;
  return null;
}
