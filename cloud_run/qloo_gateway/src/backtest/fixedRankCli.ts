import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCases, type BacktestCase } from "./cases.js";
import { runFixedRank } from "./fixedRank.js";
import { assemble, defaultIo, protocolCommit, privateOut, REPO_ROOT, writeJson, type CliIo } from "./proofCli.js";
import { createPermutationRanker } from "./proofShared.js";
import { StopMonitor } from "./proofStats.js";

/** Test B: `node dist/backtest/fixedRankCli.js [--out private-data/backtest/proof-v3-fixed.json] [--dry-run]` */
export interface FixedArgs { out: string; dryRun: boolean; cases: string[] }

export function parseArgs(argv: string[]): FixedArgs {
  const get = (f: string) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
  const cases = get("--cases");
  return {
    out: privateOut(get("--out") ?? resolve(REPO_ROOT, "private-data/backtest/proof-v3-fixed.json")),
    dryRun: argv.includes("--dry-run"),
    cases: cases ? cases.split(",") : [resolve(REPO_ROOT, "backtest/cases.json"), resolve(REPO_ROOT, "backtest/cases-run2.json")],
  };
}

/** The reviewed activation cases of the listed files, in order (the protocol's 27: 14 + 13). */
export function loadCases(paths: string[]): BacktestCase[] {
  const out: BacktestCase[] = [];
  for (const p of paths) {
    const { cases, errors } = validateCases(JSON.parse(readFileSync(p, "utf8")));
    if (errors.length) throw new Error(`invalid cases in ${p}:\n${errors.join("\n")}`);
    out.push(...cases);
  }
  const ids = new Set(out.map((c) => c.id));
  if (ids.size !== out.length) throw new Error("duplicate case ids across the case files");
  return out;
}

export async function main(argv: string[], io: CliIo = defaultIo()): Promise<number> {
  const args = parseArgs(argv);
  const cases = loadCases(args.cases);
  const commit = protocolCommit();
  if (args.dryRun) {
    io.log(`Proof v3 Test B (fixed candidates): ${cases.length} cases. DRY RUN: no Qloo or Gemini call is made.`);
    io.log(`Protocol commit ${commit}; output ${args.out}`);
    io.log("Stop at once on: a Qloo 429, any quota/rate-limit/limit text, or a Qloo error rate above 10% over the last 20 Qloo calls (evaluated once 10 are seen; Gemini errors are not in that rate).");
    for (const c of cases) io.log(`- ${c.id}: ${c.artist} in ${c.city}, ${c.country} (${c.activationType}); real pick ${c.realEntity.name}; session proof-v3-fixed-${c.id}; 4 Qloo calls (2 describes, popularity list, rank), 1-2 Gemini calls`);
    io.log(`Expected: ~${cases.length * 4} Qloo calls at most (popularity lists and describes may be cached; protocol estimate 60-90), ${cases.length}-${cases.length * 2} Gemini calls.`);
    return 0;
  }
  const clients = io.makeClients(io.env);
  const monitor = new StopMonitor();
  const ranker = createPermutationRanker({ generate: clients.generate, models: clients.models, monitor });
  const write = (section: Parameters<typeof assemble>[0]["sections"]["fixedRank"], opts: { stop?: string; running?: boolean; geminiUsed?: string[] }) =>
    writeJson(args.out, assemble({ sections: { fixedRank: section }, monitor, models: clients.models, geminiUsed: opts.geminiUsed ?? [], now: io.now(), commit, ...(opts.stop ? { stop: opts.stop } : {}), ...(opts.running ? { running: true } : {}) }));
  const run = await runFixedRank({ cases }, { callTool: clients.callTool, ranker, monitor, log: io.log }, (s) => write(s, { running: true }));
  write(run.section, { ...(run.stop ? { stop: run.stop } : {}), geminiUsed: run.geminiUsed });
  io.log(`calls: Qloo ${run.callCounts.qloo} (${run.callCounts.qlooErrors} errors), Gemini ${run.callCounts.gemini} (${run.callCounts.geminiErrors} errors)`);
  io.log(`wrote ${args.out}`);
  return run.stop ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => { console.error(`proof-v3 fixed rank: ${String((err as Error)?.message ?? err)}`); process.exit(1); });
}
