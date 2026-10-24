import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createVertexGenerate, type GenerateFn } from "../narrative/gemini.js";
import { SCORING } from "../scoring/calibration.js";
import { assertPrivateOut, createGatewayCaller } from "./cli.js";
import { summarise, type ProofV3Results } from "./proofResults.js";
import type { CallTool } from "./proofShared.js";
import type { StopMonitor } from "./proofStats.js";

/** Shared plumbing for the three Proof v3 CLIs (docs/qloo/proof-v3-protocol.md). */
export const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url)).replace(/\/$/, "");
export const PROTOCOL_PATH = "docs/qloo/proof-v3-protocol.md";

export interface Clients { callTool: CallTool; generate: GenerateFn; models: string[] }
export interface CliIo {
  log: (line: string) => void;
  env: Record<string, string | undefined>;
  /** Builds the network clients. Never called by --dry-run. */
  makeClients: (env: Record<string, string | undefined>) => Clients;
  now: () => Date;
}

const gcloud = (args: string[]): string => execFileSync("gcloud", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

export const geminiModels = (env: Record<string, string | undefined>): string[] => [env.GEMINI_MODEL ?? "gemini-3.8-flash", env.GEMINI_FALLBACK_MODEL ?? "gemini-2.5-flash"];

/** The real clients: the existing gateway HTTP caller (identity token refreshed every 25 minutes; a 429 is never retried) and Vertex REST. */
export function defaultClients(env: Record<string, string | undefined>): Clients {
  const baseUrl = env.QLOO_GATEWAY_URL;
  if (!baseUrl) throw new Error("set QLOO_GATEWAY_URL");
  let caller: ReturnType<typeof createGatewayCaller> | undefined;
  let issuedAt = 0;
  const current = () => {
    if (!caller || Date.now() - issuedAt > 25 * 60_000) {
      caller = createGatewayCaller({ baseUrl, token: gcloud(["auth", "print-identity-token"]), noRetryStatuses: [429] });
      issuedAt = Date.now();
    }
    return caller;
  };
  const project = env.GCP_PROJECT ?? "liifecalling-academy";
  return {
    callTool: (name, args, sessionId) => current()(name, args, sessionId),
    generate: createVertexGenerate({ project, getToken: async () => gcloud(["auth", "print-access-token"]) }),
    models: geminiModels(env),
  };
}

export const defaultIo = (): CliIo => ({ log: (l) => console.log(l), env: process.env, makeClients: defaultClients, now: () => new Date() });

/** Last commit that touched the protocol file. */
export function protocolCommit(cwd: string = REPO_ROOT): string {
  return execFileSync("git", ["log", "-n1", "--format=%H", "--", PROTOCOL_PATH], { cwd, encoding: "utf8" }).trim();
}

/** Results contain Qloo-derived ranks: only private-data/ (or outside the repo) is allowed, with no override. */
export function privateOut(out: string): string {
  assertPrivateOut(out, false);
  return resolve(out);
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}

export function assemble(opts: {
  sections: Pick<ProofV3Results, "cityRank" | "fixedRank" | "catchRate">;
  monitor?: StopMonitor; stop?: string; running?: boolean; models: string[]; geminiUsed: string[]; now: Date; commit: string;
}): ProofV3Results {
  const counts = opts.monitor?.counts ?? { qloo: 0, gemini: 0, qlooErrors: 0, geminiErrors: 0 };
  const results: ProofV3Results = {
    schemaVersion: 3, generatedAt: opts.now.toISOString(),
    protocol: { path: PROTOCOL_PATH, commit: opts.commit }, calibrationVersion: SCORING.version,
    models: { gemini: opts.models, geminiUsed: opts.geminiUsed }, callCounts: { ...counts }, geminiErrorTexts: [...(opts.monitor?.geminiErrorTexts ?? [])],
    stop: opts.stop ? { status: "stopped", reason: opts.stop } : { status: opts.running ? "running" : "complete" },
    ...opts.sections, summary: [],
  };
  results.summary = summarise(results);
  return results;
}
