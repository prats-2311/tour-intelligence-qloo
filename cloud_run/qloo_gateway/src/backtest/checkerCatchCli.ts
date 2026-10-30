import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCheckers } from "./checkerCatch.js";
import { defaultIo, privateOut, protocolCommit, REPO_ROOT, writeJson, type CliIo } from "./proofCli.js";

/** Catch rates for the product's other checkers (Amendment 10; offline): `node dist/backtest/checkerCatchCli.js [--out private-data/backtest/proof-v3-checkers.json]` */
export function parseArgs(argv: string[]): { out: string } {
  const i = argv.indexOf("--out");
  return { out: privateOut(i === -1 ? resolve(REPO_ROOT, "private-data/backtest/proof-v3-checkers.json") : argv[i + 1] ?? "") };
}

export async function main(argv: string[], io: CliIo = defaultIo()): Promise<number> {
  const { out } = parseArgs(argv);
  const result = runCheckers();
  const summary = result.checkers.map((c) => `${c.checker}: caught ${c.caught} of ${c.planted}, false alarms ${c.falseAlarms} of ${c.controls}`);
  const n = result.sponsorNameRuleOnly;
  summary.push(`${n.checker} (secondary): caught ${n.caught} of ${n.planted}, false alarms ${n.falseAlarms} of ${n.controls}`);
  writeJson(out, { protocol: { commit: protocolCommit(), amendment: 10 }, generatedAt: io.now().toISOString(), ...result, summary });
  for (const line of summary) io.log(line);
  io.log(`wrote ${out}`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => { console.error(`proof-v3 checkers: ${String((err as Error)?.message ?? err)}`); process.exit(1); });
}
