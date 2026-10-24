import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GroundKey } from "./grounding.js";
import { ratingsFromCsv } from "./groundingSheet.js";
import { scoreGrounding, type GroundItemsFile } from "./groundingScore.js";
import { assemble, defaultIo, privateOut, REPO_ROOT, writeJson, type CliIo } from "./proofCli.js";
import { summarise } from "./proofResults.js";

/**
 * Test C scorer: `node dist/backtest/groundingScoreCli.js --csv <downloaded ratings.csv> [--key ...] [--items ...] [--out private-data/backtest/proof-v3-ground.json] [--allow-partial]`.
 * No network. Refuses to run when more than 5% of the rows are unrated unless --allow-partial.
 */
export interface ScoreArgs { csv: string; key: string; items: string; out: string; allowPartial: boolean }

export function parseArgs(argv: string[]): ScoreArgs {
  const get = (f: string) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
  const csv = get("--csv");
  if (!csv) throw new Error("pass --csv <the ratings file downloaded from the sheet>");
  const dir = resolve(REPO_ROOT, "private-data/backtest");
  return {
    csv: resolve(csv), key: resolve(get("--key") ?? resolve(dir, "proof-v3-ground-key.json")), items: resolve(get("--items") ?? resolve(dir, "proof-v3-ground-items.json")),
    out: privateOut(get("--out") ?? resolve(dir, "proof-v3-ground.json")), allowPartial: argv.includes("--allow-partial"),
  };
}

export async function run(args: ScoreArgs, io: CliIo = defaultIo()): Promise<number> {
  const key = JSON.parse(readFileSync(args.key, "utf8")) as GroundKey;
  const items = JSON.parse(readFileSync(args.items, "utf8")) as GroundItemsFile;
  const ratings = ratingsFromCsv(readFileSync(args.csv, "utf8"));
  const { summary: _s, ...section } = scoreGrounding({ key, items, ratings }, { allowPartial: args.allowPartial });
  const results = assemble({ sections: { grounding: section }, models: items.models, geminiUsed: items.geminiUsed, now: io.now(), commit: items.protocolCommit });
  // The call counts and stop status belong to the run that produced the names, not to this offline scoring.
  results.callCounts = { ...items.callCounts };
  results.stop = items.stop.status === "stopped" ? { status: "stopped", ...(items.stop.reason ? { reason: items.stop.reason } : {}) } : { status: "complete" };
  results.summary = summarise(results);
  writeJson(args.out, results);
  for (const line of results.summary) io.log(line);
  if (section.rows.unrated > 0) io.log(`WARNING: ${section.rows.unrated} of ${section.rows.total} rows are unrated.`);
  io.log(`wrote ${args.out}`);
  return 0;
}

export const main = (argv: string[], io: CliIo = defaultIo()): Promise<number> => run(parseArgs(argv), io);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => { console.error(`proof-v3 grounding score: ${String((err as Error)?.message ?? err)}`); process.exit(1); });
}
