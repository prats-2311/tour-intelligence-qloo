import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { citiesFromRecording, deriveCalibration, renderCalibrationTs, renderReport } from "./calibrate.js";

export function parseCalArgs(argv: string[]): { inputs: string[]; write: string; report: string; version: string } {
  const inputs: string[] = [];
  let write = ""; let report = ""; let version = `calibrated-${new Date().toISOString().slice(0, 10)}`;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--in") { while (argv[i + 1] && !argv[i + 1]!.startsWith("--")) inputs.push(argv[++i]!); }
    else if (a === "--write") write = argv[++i] ?? "";
    else if (a === "--report") report = argv[++i] ?? "";
    else if (a === "--version") version = argv[++i] ?? version;
  }
  if (!inputs.length || !write || !report) throw new Error("usage: calibrateCli --in <rec.json>... --write <calibration.ts> --report <report.md> [--version <id>]");
  return { inputs, write, report, version };
}

function main() {
  const args = parseCalArgs(process.argv.slice(2));
  const cities = args.inputs.flatMap((p) => citiesFromRecording(JSON.parse(readFileSync(p, "utf8"))));
  const { config, report } = deriveCalibration(cities, args.version);
  const md = renderReport(report);
  console.log(md);
  if (!report.gates.passed) { console.error("calibration gates failed — nothing written"); process.exit(1); }
  writeFileSync(args.write, renderCalibrationTs(config));
  writeFileSync(args.report, md);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
