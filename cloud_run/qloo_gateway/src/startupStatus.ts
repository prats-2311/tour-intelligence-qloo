import { accessSync, constants } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";
import type { GeminiProvider } from "./narrative/provider.js";

const set = (v: string | undefined) => !!v && v.trim() !== "";

/** One line per optional service: on/off and what still works. Names only, never values. */
export function findOnPath(bin: string, pathVar: string | undefined): string | undefined {
  const candidates = isAbsolute(bin) ? [bin] : (pathVar ?? "").split(delimiter).filter(Boolean).map((d) => join(d, bin));
  for (const c of candidates) { try { accessSync(c, constants.X_OK); return c; } catch { /* next */ } }
  return undefined;
}

export function startupStatus(env: Record<string, string | undefined>, gemini: { provider: GeminiProvider; note: string }, opts: { harnessFound?: boolean } = {}): string[] {
  const lines: string[] = [];
  const install = "npm i -g @qloo/qloo-harness@^0.1.26 && qloo setup --qloo";
  if (!set(env.QLOO_API_KEY)) lines.push("Qloo: QLOO_API_KEY not set: live runs disabled; the sample tour still works");
  else if (opts.harnessFound === false) lines.push(`Qloo: QLOO_API_KEY set but the qloo harness not found on PATH (QLOO_BIN): live runs disabled; install it with: ${install}`);
  else lines.push("Qloo: QLOO_API_KEY set and harness found; GET /health shows connected after the first live call");
  lines.push(`Gemini: ${gemini.note}`);
  lines.push(set(env.TAVILY_API_KEY) ? "Tavily web lookups on (this week, Advance)" : "Tavily: TAVILY_API_KEY not set: this-week and Advance web lookups are off");
  lines.push(set(env.BQ_DATASET) && set(env.GOOGLE_CLOUD_PROJECT) ? "BigQuery analytics on" : "BigQuery analytics off (set BQ_DATASET and GOOGLE_CLOUD_PROJECT to enable)");
  const fsCache = env.QLOO_CACHE_BACKEND === "firestore";
  const fsUsage = env.QLOO_USAGE_BACKEND === "firestore";
  lines.push(fsCache || fsUsage
    ? `Storage: Firestore for ${[fsCache ? "cache" : "", fsUsage ? "usage counts and team workspaces" : ""].filter(Boolean).join(" and ")} (needs Google ADC); the rest in-memory`
    : "Storage: in-memory cache, usage counts and team workspaces (lost on restart; no Firestore or ADC needed)");
  return lines;
}
