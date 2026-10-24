import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCities, type City } from "../geo/cities.js";
import { BOARD_MAX_STOPS, MAX_CANDIDATES, reanchorPlayed, runCityRank, type CityCase } from "./cityRank.js";
import { assemble, defaultIo, geminiModels, protocolCommit, privateOut, REPO_ROOT, writeJson, type CliIo } from "./proofCli.js";
import { createPermutationRanker } from "./proofShared.js";
import { StopMonitor } from "./proofStats.js";

/** Test A: `node dist/backtest/cityRankCli.js --batch 1|2 [--out private-data/backtest/proof-v3-city-batch<N>.json] [--dry-run]` */
export const PLANNED_TOTAL = 12;
/** Protocol budget: about 95 Qloo calls and 1-2 Gemini calls per artist. Worst case: fixed calls + 8 per candidate (2 location strings, 5 recs, 1 rank) at the 14-candidate cap. */
export const TYPICAL_QLOO_PER_ARTIST = 95;
export const WORST_QLOO_PER_ARTIST = 7 + 8 * MAX_CANDIDATES;

export interface CityRankArgs { batch: 1 | 2; out: string; dryRun: boolean }

export function parseArgs(argv: string[]): CityRankArgs {
  const get = (f: string) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
  const b = get("--batch");
  if (b !== "1" && b !== "2") throw new Error("pass --batch 1 or --batch 2");
  const batch = Number(b) as 1 | 2;
  const out = privateOut(get("--out") ?? resolve(REPO_ROOT, "private-data/backtest", `proof-v3-city-batch${batch}.json`));
  return { batch, out, dryRun: argv.includes("--dry-run") };
}

interface ArtistRow { position: number; artist: string; batch: number }

/** The batch's artists (from backtest/city/artists.json, fixed before any call) joined with their ground truth (backtest/city/cases.json). */
export function loadPlan(batch: number, root: string = REPO_ROOT): CityCase[] {
  const artists = JSON.parse(readFileSync(resolve(root, "backtest/city/artists.json"), "utf8")) as ArtistRow[];
  const cases = JSON.parse(readFileSync(resolve(root, "backtest/city/cases.json"), "utf8")) as CityCase[];
  const mine = artists.filter((a) => a.batch === batch).sort((a, b) => a.position - b.position);
  if (mine.length === 0) throw new Error(`no artists for batch ${batch}`);
  return mine.map((a) => {
    const c = cases.find((x) => x.position === a.position);
    if (!c || c.artist !== a.artist) throw new Error(`cases.json has no ground truth for position ${a.position} (${a.artist})`);
    return c;
  });
}

export function renderPlan(cases: CityCase[], args: CityRankArgs, models: string[], commit: string, cities?: City[]): string[] {
  const lines = [
    `Proof v3 Test A (city ranking), batch ${args.batch}: ${cases.length} artists. DRY RUN: no Qloo or Gemini call is made.`,
    `Protocol commit ${commit}; board maxStops ${BOARD_MAX_STOPS}, candidate cap ${MAX_CANDIDATES}; Gemini ${models.join(" -> ")}; output ${args.out}`,
    "Stop at once on: a Qloo 429, an error envelope or message matching rate/quota/limit, a stale answer, or an error rate above 10% over the last 20 calls (evaluated once 10 are seen). A region whose heat lookup fails drops the artist; all Gemini models failing stops the run.",
    "Candidates (Amendment 2): the board's cities, then played/unplayed-decoy pairs while the list is <= 14 and played cities <= half. Played cities are re-anchored with the board's anchoring function first.", "",
  ];
  for (const c of cases) {
    const re = cities ? reanchorPlayed(cities, c.played) : undefined;
    const played = re ? re.played.length : new Set(c.played.map((p) => p.city_id)).size;
    lines.push(`${c.position}. ${c.artist} - ${c.tour_title} (${c.first_show_year}); regions: ${c.regions.join(", ")}; ${played} played cities (${c.played.map((p) => p.name).join(", ")}); session proof-v3-city-${c.position}; ~${TYPICAL_QLOO_PER_ARTIST} Qloo calls (worst case ${WORST_QLOO_PER_ARTIST} of the 160 session budget), 1-2 Gemini calls`);
    if (re?.changes.length) lines.push(`   re-anchored played cities: ${re.changes.map((x) => `${x.from} -> ${x.to}`).join(", ")}`);
  }
  lines.push("", `Expected for the batch: ~${cases.length * TYPICAL_QLOO_PER_ARTIST} Qloo calls, ${cases.length}-${cases.length * 2} Gemini calls (hard ceiling ${cases.length * WORST_QLOO_PER_ARTIST} Qloo calls).`);
  return lines;
}

export async function main(argv: string[], io: CliIo = defaultIo()): Promise<number> {
  const args = parseArgs(argv);
  const cases = loadPlan(args.batch);
  const commit = protocolCommit();
  if (args.dryRun) { for (const l of renderPlan(cases, args, geminiModels(io.env), commit, loadCities())) io.log(l); return 0; }

  const clients = io.makeClients(io.env);
  const monitor = new StopMonitor();
  const ranker = createPermutationRanker({ generate: clients.generate, models: clients.models, monitor });
  const write = (section: Parameters<typeof assemble>[0]["sections"]["cityRank"], opts: { stop?: string; running?: boolean; geminiUsed?: string[] }) =>
    writeJson(args.out, assemble({ sections: { cityRank: section }, monitor, models: clients.models, geminiUsed: opts.geminiUsed ?? [], now: io.now(), commit, ...(opts.stop ? { stop: opts.stop } : {}), ...(opts.running ? { running: true } : {}) }));
  const run = await runCityRank({ cases, batch: args.batch, plannedTotal: PLANNED_TOTAL },
    { callTool: clients.callTool, cities: loadCities(), ranker, monitor, today: io.now().toISOString().slice(0, 10), log: io.log },
    (s) => write(s, { running: true }));
  write(run.section, { ...(run.stop ? { stop: run.stop } : {}), geminiUsed: run.geminiUsed });
  io.log(`calls: Qloo ${run.callCounts.qloo} (${run.callCounts.qlooErrors} errors), Gemini ${run.callCounts.gemini} (${run.callCounts.geminiErrors} errors)`);
  io.log(`wrote ${args.out}`);
  return run.stop ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => { console.error(`proof-v3 city rank: ${String((err as Error)?.message ?? err)}`); process.exit(1); });
}
