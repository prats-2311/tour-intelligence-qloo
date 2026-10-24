import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCatchRate } from "./catchRate.js";
import { assemble, defaultIo, protocolCommit, privateOut, REPO_ROOT, writeJson, type CliIo } from "./proofCli.js";

/** Claim-checker catch rate (no network): `node dist/backtest/catchRateCli.js [private-data/showcase.json] [--out private-data/backtest/proof-v3-catch.json]` */
export function parseArgs(argv: string[]): { input: string; out: string } {
  const get = (f: string) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
  const positional = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--out");
  return {
    input: resolve(positional[0] ?? resolve(REPO_ROOT, "private-data/showcase.json")),
    out: privateOut(get("--out") ?? resolve(REPO_ROOT, "private-data/backtest/proof-v3-catch.json")),
  };
}

export async function main(argv: string[], io: CliIo = defaultIo()): Promise<number> {
  const args = parseArgs(argv);
  const section = runCatchRate(JSON.parse(readFileSync(args.input, "utf8")), args.input.startsWith(`${REPO_ROOT}/`) ? args.input.slice(REPO_ROOT.length + 1) : args.input);
  const results = assemble({ sections: { catchRate: section }, models: [], geminiUsed: [], now: io.now(), commit: protocolCommit() });
  writeJson(args.out, results);
  for (const line of results.summary) io.log(line);
  io.log(`wrote ${args.out}`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => { console.error(`proof-v3 catch rate: ${String((err as Error)?.message ?? err)}`); process.exit(1); });
}
