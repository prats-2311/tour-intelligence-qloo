import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCases } from "./fixedRankCli.js";
import {
  fuseCity, fuseFixed, type FusionFile, postCutoffCity, postCutoffFixed, RRF_K, verifyCity, verifyFixed, type FusionSummary, type Subset,
} from "./fusion.js";
import { defaultIo, privateOut, REPO_ROOT, writeJson, type CliIo } from "./proofCli.js";
import type { CityRankArtist, ProofV3Results } from "./proofResults.js";

/**
 * Amendment 7, offline (no Qloo or Gemini call): `node dist/backtest/fusionCli.js [--dir private-data] [--out private-data/backtest/proof-v3-fusion.json]`.
 * Reads the stored Test A and B results, fuses Gemini/LLM with Qloo by reciprocal rank fusion (k = 60), and writes the result under private-data/ only.
 */
export function parseArgs(argv: string[]): { dir: string; out: string } {
  const get = (f: string) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
  const dir = resolve(get("--dir") ?? resolve(REPO_ROOT, "private-data"));
  return { dir, out: privateOut(get("--out") ?? resolve(dir, "backtest", "proof-v3-fusion.json")) };
}

const read = (p: string): ProofV3Results => JSON.parse(readFileSync(p, "utf8")) as ProofV3Results;
const f2 = (v: number | null) => (v === null ? "n/a" : v.toFixed(3));
const line = (title: string, s: FusionSummary, ref: string) =>
  `${title}: n=${s.n}; ${Object.entries(s.means).map(([k, v]) => `${k} ${f2(v)}`).join(", ")}; fusion vs ${ref} ${s.signTest.wins}W-${s.signTest.losses}L-${s.signTest.ties}T p=${s.signTest.p.toFixed(5)}; claim ${s.claim ? "YES" : "no"}; excluded ${s.exclusions.length}${s.exclusions.length ? ` (${s.exclusions.map((e) => `${e.id}: ${e.reason}`).join("; ")})` : ""}`;

export async function main(argv: string[], io: CliIo = defaultIo()): Promise<number> {
  const { dir, out } = parseArgs(argv);
  const bt = (n: string) => resolve(dir, "backtest", n);
  const fixed = read(bt("proof-v3-fixed.json")).fixedRank;
  if (!fixed) throw new Error("proof-v3-fixed.json has no fixedRank section");
  const batches = [read(bt("proof-v3-city-batch1.json")), read(bt("proof-v3-city-batch2.json"))].map((b) => {
    if (!b.cityRank) throw new Error("a city batch has no cityRank section");
    return b.cityRank;
  });

  // Sanity: the stored numbers must reproduce before anything new is computed.
  verifyFixed(fixed.cases, fixed.stats);
  for (const b of batches) verifyCity(b.artists, b.stats);

  const dates = new Map(loadCases([resolve(REPO_ROOT, "backtest/cases.json"), resolve(REPO_ROOT, "backtest/cases-run2.json")]).map((c) => [c.id, c.date] as const));
  const fullB = fuseFixed(fixed.cases);
  const artists: CityRankArtist[] = batches.flatMap((b) => b.artists).sort((a, b) => a.position - b.position);
  const fullA = fuseCity(artists);
  const result: FusionFile = {
    schemaVersion: 1, generatedAt: io.now().toISOString(), rule: { name: "rrf", k: RRF_K, tieBreak: "llm-rank" }, sanity: { testB: "passed", testA: "passed" },
    testB: { planned: fixed.plannedCases, scored: fixed.cases.length, full: fullB, postCutoff: postCutoffFixed(fullB, dates) },
    testA: { artists: artists.length, full: fullA, postCutoff: postCutoffCity(fullA, new Map(artists.map((a) => [a.artist, { year: a.firstShowYear, model: a.llmModel }]))) },
  };
  writeJson(out, result);
  io.log("sanity: stored per-arm means reproduce (Test B MRR, Test A R-precision, every file)");
  io.log(line("Test B", result.testB.full, "gemini"));
  io.log(line("Test B post-cutoff (exploratory)", result.testB.postCutoff, "gemini"));
  io.log(line("Test A", result.testA.full, "llm"));
  io.log(line("Test A post-cutoff (exploratory)", result.testA.postCutoff, "llm"));
  io.log(`wrote ${out}`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => { console.error(`proof-v3 fusion: ${String((err as Error)?.message ?? err)}`); process.exit(1); });
}
