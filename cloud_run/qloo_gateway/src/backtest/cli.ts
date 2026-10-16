import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createVertexGenerate, generateJson } from "../narrative/gemini.js";
import type { QlooEnvelope } from "../types.js";
import { MIN_CASES, validateCases, type BacktestCase } from "./cases.js";
import { cleanLlmList, GatewayAuthError, llmPrompt, runCase } from "./run.js";
import { buildResults, METHODS } from "./score.js";

export function parseArgs(argv: string[]): { cases: string; out: string; only?: string[] } {
  const get = (f: string) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
  const cases = get("--cases"); const out = get("--out"); const only = get("--only");
  if (!cases) throw new Error("--cases <path> is required");
  if (!out) throw new Error("--out <path> is required");
  return { cases, out, ...(only ? { only: only.split(",").map((s) => s.trim()).filter(Boolean) } : {}) };
}

/** Budget guard (global constraints): never spend Qloo/Vertex calls on more than this many cases in one run. */
export const MAX_CASES = 30;

export function selectCases(all: BacktestCase[], only: string[] | undefined, skipped: number): BacktestCase[] {
  const cases = only ? all.filter((c) => only.includes(c.id)) : all;
  if (cases.length > MAX_CASES) throw new Error(`refusing to run ${cases.length} cases: at most ${MAX_CASES} per run (budget guard)`);
  if (!only && cases.length < MIN_CASES) throw new Error(`need at least ${MIN_CASES} accepted cases, have ${cases.length} (${skipped} not accepted)`);
  return cases;
}

export function createGatewayCaller(opts: { baseUrl: string; token: string; fetchImpl?: typeof fetch; retries?: number; backoffMs?: number }) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const base = opts.baseUrl.replace(/\/+$/, "");
  const retries = opts.retries ?? 2;
  return async (name: string, args: Record<string, unknown>, sessionId: string): Promise<QlooEnvelope> => {
    let last = "";
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, (opts.backoffMs ?? 2000) * attempt));
      try {
        const res = await fetchImpl(`${base}/v1/tools/${encodeURIComponent(name)}`, {
          method: "POST",
          headers: { authorization: `Bearer ${opts.token}`, "x-session-id": sessionId, "content-type": "application/json" },
          body: JSON.stringify(args),
          signal: AbortSignal.timeout(90_000),
        });
        if (res.status === 401 || res.status === 403) throw new GatewayAuthError(res.status);
        if (res.status >= 500 || res.status === 429) { last = `HTTP ${res.status}`; continue; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const envelope = ((await res.json()) as { envelope?: unknown } | null)?.envelope;
        if (typeof envelope !== "object" || envelope === null) throw new Error("malformed response (no envelope)");
        return envelope as QlooEnvelope;
      } catch (err) {
        if (err instanceof GatewayAuthError) throw err;
        last = String((err as Error)?.message ?? err).replaceAll(opts.token, "[token]");
        if (/HTTP 4\d\d/.test(last)) break;
      }
    }
    throw new Error(`${name}: ${last}`);
  };
}

const gcloud = (args: string[]) => execFileSync("gcloud", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = process.env.QLOO_GATEWAY_URL;
  if (!baseUrl) throw new Error("set QLOO_GATEWAY_URL");
  const { cases: all, errors, skipped } = validateCases(JSON.parse(readFileSync(args.cases, "utf8")));
  if (errors.length) throw new Error(`invalid cases:\n${errors.join("\n")}`);
  const cases = selectCases(all, args.only, skipped);

  const token = gcloud(["auth", "print-identity-token"]);
  const project = process.env.GCP_PROJECT ?? "liifecalling-academy";
  const models = [process.env.GEMINI_MODEL ?? "gemini-3.8-flash", process.env.GEMINI_FALLBACK_MODEL ?? "gemini-2.5-flash"];
  const generate = createVertexGenerate({ project, getToken: async () => gcloud(["auth", "print-access-token"]) });
  let usedModel = models[0]!;
  const deps = {
    callTool: createGatewayCaller({ baseUrl, token }),
    llmList: async (c: BacktestCase) => {
      const body = {
        contents: [{ role: "user", parts: [{ text: llmPrompt(c) }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2,
          responseSchema: { type: "OBJECT", required: ["items"], properties: { items: { type: "ARRAY", items: { type: "OBJECT", required: ["name"], properties: { name: { type: "STRING" } } } } } } },
      };
      const { model, json } = await generateJson(generate, models, body);
      usedModel = model;
      return cleanLlmList(json);
    },
  };

  const runAt = new Date().toISOString();
  const results = [];
  for (const c of cases) {
    const r = await runCase(c, deps);
    results.push(r);
    writeFileSync(args.out, `${JSON.stringify(buildResults(results, { runAt, model: usedModel, status: "partial" }), null, 2)}\n`);
    console.log(`${c.id}: ${METHODS.map((m) => { const x = r.results[m]; return `${m}=${x.status === "ok" ? (x.rank ?? "-") : x.reason}`; }).join(" ")}`);
  }
  const doc = buildResults(results, { runAt, model: usedModel, status: "complete" });
  writeFileSync(args.out, `${JSON.stringify(doc, null, 2)}\n`);
  for (const m of METHODS) console.log(`${m}: top10 ${doc.summary[m].hit10}/${doc.summary[m].scored}, top20 ${doc.summary[m].hit20}/${doc.summary[m].scored}`);
  console.log(`lost: ${doc.lost.join(", ") || "none"}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`backtest: ${String((err as Error)?.message ?? err)}`); process.exit(1); });
}
