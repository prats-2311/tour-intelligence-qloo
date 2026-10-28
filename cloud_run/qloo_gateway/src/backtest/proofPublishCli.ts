import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildProofV3, parseAmendments, type Amendment } from "./proofPublish.js";
import { defaultIo, privateOut, protocolCommit, PROTOCOL_PATH, REPO_ROOT, writeJson, type CliIo } from "./proofCli.js";
import type { ProofV3Results } from "./proofResults.js";

/**
 * Combines the private Proof v3 results into the `proofV3` key of the private backtest file the dashboard's /proof page loads:
 * `node dist/backtest/proofPublishCli.js [--dir private-data] [--out private-data/backtest.json]`.
 * Reads `<dir>/backtest/proof-v3-{city-batch1,city-batch2,fixed,fixed.stopped-N,catch,ground}.json` (Test C only if its file exists) and rewrites only the out file, keeping `runs` as they are.
 */
export function parseArgs(argv: string[]): { dir: string; out: string } {
  const get = (f: string) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
  const dir = resolve(get("--dir") ?? resolve(REPO_ROOT, "private-data"));
  privateOut(resolve(dir, "backtest.json")); // the directory itself must be private-data/ or below (or outside the repo)
  return { dir, out: privateOut(get("--out") ?? resolve(dir, "backtest.json")) };
}

export interface Deps { amendments: () => Amendment[]; protocolCommit: () => string }
const git = (args: string[]): string => execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
export const realDeps: Deps = {
  protocolCommit: () => protocolCommit(),
  /** The commit that first added each "## Amendment N" heading. */
  amendments: () => parseAmendments(readFileSync(resolve(REPO_ROOT, PROTOCOL_PATH), "utf8"), (n) => git(["log", "-S", `## Amendment ${n}`, "--format=%H", "--", PROTOCOL_PATH]).split("\n").filter(Boolean).at(-1) ?? ""),
};

const readRun = (path: string): ProofV3Results => JSON.parse(readFileSync(path, "utf8")) as ProofV3Results;
const readIf = (path: string): ProofV3Results | undefined => (existsSync(path) ? readRun(path) : undefined);

export async function main(argv: string[], io: CliIo = defaultIo(), deps: Deps = realDeps): Promise<number> {
  const { dir, out } = parseArgs(argv);
  const bt = (name: string) => resolve(dir, "backtest", name);
  const need = (name: string): ProofV3Results => { if (!existsSync(bt(name))) throw new Error(`missing ${bt(name)}`); return readRun(bt(name)); };
  const stopped: ProofV3Results[] = [];
  for (let n = 1; existsSync(bt(`proof-v3-fixed.stopped-${n}.json`)); n += 1) stopped.push(readRun(bt(`proof-v3-fixed.stopped-${n}.json`)));
  const proofV3 = buildProofV3({
    protocolCommit: deps.protocolCommit(), amendments: deps.amendments(), batches: [need("proof-v3-city-batch1.json"), need("proof-v3-city-batch2.json")],
    fixed: need("proof-v3-fixed.json"), fixedStopped: stopped, catchRate: need("proof-v3-catch.json"), grounding: readIf(bt("proof-v3-ground.json")), now: io.now(),
  });
  const existing = existsSync(out) ? (JSON.parse(readFileSync(out, "utf8")) as Record<string, unknown>) : {};
  writeJson(out, { ...existing, proofV3 });
  for (const t of proofV3.tests) { io.log(`## ${t.id}: ${t.title} (${t.status})`); for (const c of t.claims) io.log(c); }
  io.log(`wrote proofV3 (${proofV3.tests.map((t) => t.id).join(", ")}) into ${out}`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => { console.error(`proof-v3 publish: ${String((err as Error)?.message ?? err)}`); process.exit(1); });
}
