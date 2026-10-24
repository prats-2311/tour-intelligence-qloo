import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCities } from "../geo/cities.js";
import { buildKey, buildRows, CAPS, EXPECTED_CITIES, groundingOut, QLOO_CEILING, runGrounding, selectCities, type GroundItemsFile } from "./grounding.js";
import { ratingsTemplateCsv, renderSheet } from "./groundingSheet.js";
import { defaultIo, geminiModels, protocolCommit, REPO_ROOT, writeJson, type CliIo } from "./proofCli.js";
import { countryLabel } from "./proofShared.js";
import { sha256Hex, StopMonitor } from "./proofStats.js";
import { writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Test C runner: `node dist/backtest/groundingCli.js [--showcase private-data/showcase.json] [--out-dir private-data/backtest] [--dry-run]`.
 * Writes proof-v3-ground-{items,key}.json, proof-v3-ground-sheet.html and proof-v3-ground-sheet.csv, only under private-data/.
 */
export interface GroundingArgs { showcase: string; outDir: string; dryRun: boolean }

export function parseArgs(argv: string[]): GroundingArgs {
  const get = (f: string) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
  const outDir = groundingOut(get("--out-dir") ?? resolve(REPO_ROOT, "private-data/backtest"));
  return { showcase: resolve(get("--showcase") ?? resolve(REPO_ROOT, "private-data/showcase.json")), outDir, dryRun: argv.includes("--dry-run") };
}

const names = { items: "proof-v3-ground-items.json", key: "proof-v3-ground-key.json", sheet: "proof-v3-ground-sheet.html", csv: "proof-v3-ground-sheet.csv" };
export function outputPaths(outDir: string) {
  const p = (name: string) => groundingOut(resolve(outDir, name));
  return { items: p(names.items), key: p(names.key), sheet: p(names.sheet), csv: p(names.csv) };
}
/** The same names without the path check; for tests that write to a temp dir through `mainWith`. */
export const outputPathsUnchecked = (outDir: string) => ({ items: resolve(outDir, names.items), key: resolve(outDir, names.key), sheet: resolve(outDir, names.sheet), csv: resolve(outDir, names.csv) });

/** Rough per-city worst case: location checks (2), 5 activation lookups, 1 venue rank, up to 3 compares, tags, popularity list, up to 5 describes, 1 rank, 1 compare. */
const QLOO_PER_CITY_TYPICAL = 12;
const QLOO_PER_CITY_MAX = 22;

function writeText(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

/** Keeps a stopped (or crashed) run's items file: renamed to `*.stopped-<n>.json` before a new run can write to the same path. */
export function preserveStopped(itemsPath: string): string | undefined {
  if (!existsSync(itemsPath)) return undefined;
  let status: string | undefined;
  try { status = (JSON.parse(readFileSync(itemsPath, "utf8")) as { stop?: { status?: string } }).stop?.status; } catch { status = "unreadable"; }
  if (status === "complete") return undefined;
  for (let n = 1; ; n += 1) {
    const dest = itemsPath.replace(/\.json$/, `.stopped-${n}.json`);
    if (!existsSync(dest)) { renameSync(itemsPath, dest); return dest; }
  }
}

export const main = (argv: string[], io: CliIo = defaultIo()): Promise<number> => mainWith(parseArgs(argv), io);

export async function mainWith(args: GroundingArgs, io: CliIo): Promise<number> {
  const paths = outputPathsUnchecked(args.outDir);
  const showcase = JSON.parse(readFileSync(args.showcase, "utf8")) as Parameters<typeof selectCities>[0];
  const sel = selectCities(showcase);
  const commit = protocolCommit();
  const models = geminiModels(io.env);
  const differs = sel.difference.missing.length > 0 || sel.difference.extra.length > 0;

  if (args.dryRun) {
    io.log(`Proof v3 Test C (grounding): ${sel.cities.length} cities for ${sel.artist.name}. DRY RUN: no Qloo or Gemini call is made and nothing is written.`);
    io.log(`Protocol commit ${commit}; Gemini ${models.join(" -> ")}; caps per city: ${CAPS.venue} venues, ${CAPS.brand} brands, ${CAPS.local_act} local acts; output dir ${args.outDir}`);
    io.log("Cities (every city on the recorded board with fan heat and winnability, ordered by sha256(city id), at most 10):");
    for (const c of sel.cities) io.log(`- ${c.name}, ${countryLabel(c.country)} (id ${c.id}); session proof-v3-ground-${c.id}; ~${QLOO_PER_CITY_TYPICAL} Qloo calls (up to ${QLOO_PER_CITY_MAX}, some cached), 2 Gemini calls (local act suggestions + LLM-only list)`);
    io.log(differs
      ? `The recorded board differs from the protocol's expected ${EXPECTED_CITIES.length} cities. Missing from the recording: ${sel.difference.missing.join(", ") || "none"}. Extra in the recording: ${sel.difference.extra.join(", ") || "none"}. The recorded board wins.`
      : `The recorded board matches the protocol's expected ${EXPECTED_CITIES.length} cities.`);
    io.log("Stop at once on: a Qloo 429, any quota/rate-limit/limit text, a stale answer, or a Qloo error rate above 10% over the last 20 Qloo calls (evaluated once 10 are seen; Gemini errors are not in that rate). A city whose playbook is LOCATION_UNRESOLVED or errors is excluded and listed.");
    io.log(`Expected: ~${sel.cities.length * QLOO_PER_CITY_TYPICAL} Qloo calls (the run stops at ${QLOO_CEILING} real Qloo calls; protocol estimate 60-110), ~${sel.cities.length * 2} Gemini calls (protocol estimate 10-30).`);
    io.log(`Would write: ${paths.items}, ${paths.key}, ${paths.sheet}, ${paths.csv}`);
    return 0;
  }

  if (differs) io.log(`NOTE: the recorded board differs from the protocol's expected list (missing: ${sel.difference.missing.join(", ") || "none"}; extra: ${sel.difference.extra.join(", ") || "none"}). The recorded board is used.`);
  const kept = preserveStopped(paths.items);
  if (kept) io.log(`kept the earlier unfinished run as ${kept}`);
  const clients = io.makeClients(io.env);
  const monitor = new StopMonitor();
  const runId = sha256Hex(`${commit}\u0000${io.now().toISOString()}\u0000${sel.cities.map((c) => c.id).join(",")}`).slice(0, 16);
  const file = (run: Awaited<ReturnType<typeof runGrounding>>, status: "running" | "complete" | "stopped"): GroundItemsFile => ({
    schemaVersion: 1, runId, generatedAt: io.now().toISOString(), protocolCommit: commit, artist: sel.artist.name, models: clients.models, geminiUsed: run.geminiUsed,
    callCounts: { ...monitor.counts }, stop: status === "stopped" ? { status, reason: run.stop ?? "stop rule" } : { status },
    cityDifference: sel.difference, excluded: run.excluded, notRun: run.notRun, cities: run.cityStatus, items: run.items,
  });
  const run = await runGrounding({ artist: sel.artist, cities: sel.cities },
    { callTool: clients.callTool, generate: clients.generate, models: clients.models, monitor, cities: loadCities(), log: io.log },
    (partial) => writeJson(paths.items, file(partial, "running")));
  writeJson(paths.items, file(run, run.stop ? "stopped" : "complete"));
  io.log(`calls: Qloo ${monitor.counts.qloo} (${monitor.counts.qlooErrors} errors), Gemini ${monitor.counts.gemini} (${monitor.counts.geminiErrors} errors)`);
  for (const e of run.excluded) io.log(`excluded: ${e.city} (${e.reason})`);
  if (run.stop) {
    io.log(`STOPPED: ${run.stop}. Finished cities are in ${paths.items}; no review sheet is written for a partial run.`);
    return 1;
  }
  const rows = buildRows(run.items);
  const { html, hash } = renderSheet(rows);
  writeJson(paths.key, buildKey(rows, runId));
  writeText(paths.sheet, html);
  writeText(paths.csv, ratingsTemplateCsv(rows));
  io.log(`${rows.length} rows (sheet ${hash}); wrote ${paths.items}, ${paths.key}, ${paths.sheet}, ${paths.csv}`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => { console.error(`proof-v3 grounding: ${String((err as Error)?.message ?? err)}`); process.exit(1); });
}
