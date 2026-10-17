/**
 * Pre-committed calibration rule (Plan 5 Task 5). Inputs are Tour Board recordings only — never backtest cases.
 * 1. Cities: finite fan heat and >= 2 raw components (activation.rawComponents, else activation.components).
 * 2. Affinity floors: floor(P10 x 100)/100 per affinity component; < 8 values -> 0.
 * 3. Concentration: vs_uniform.
 * 4. A component whose adjusted values span < 0.05 gets weight 0 ("dropped — no spread").
 * 5. playAct = round(P50 act), goldmineAct = round(P75 act), deRiskAct = round(P25 act), considerWin = round(P25 win); fan thresholds unchanged.
 * 6. Gates: >= 16 cities from >= 3 artists; all values finite; fragility(after) < fragility(before); IQR(act after) >= 2 x IQR(act before).
 * 7. Fragility: cities whose verdict changes under any of activation +-1 / fan +-1.
 * 8. Thin data: a city is thin when it has 2 or fewer components that are finite with weight > 0 and every one of those
 *    adjusted values is 0. A thin city's activation is insufficient_data, never 0. Applied identically in the live pipeline
 *    and in scoreCity (isThin). Under DEFAULT_SCORING (floors 0) no real city is thin.
 * 9. Close call: closeCall is true when the verdict changes under any of activation +-CLOSE_CALL_BAND or fan +-CLOSE_CALL_BAND
 *    (winnability recomputed). CLOSE_CALL_BAND = 2.
 */
import { activation, type ComponentName } from "./activation.js";
import { AFFINITY_COMPONENTS, concentrationValue, DEFAULT_SCORING, isThin, rescaleAffinity, type ScoringConfig } from "./config.js";
import { CLOSE_CALL_BAND, closeCall, verdict, winnability } from "./winnability.js";
import type { Verdict } from "../types.js";

export const MIN_CAL_CITIES = 16;
const MIN_ARTISTS = 3;
const MIN_SPREAD = 0.05;
const COMPONENTS: ComponentName[] = ["sponsor_fit", "local_hooks", "fan_concentration", "venue_fit"];

export interface CalCity { artist: string; city: string; fan: number; raw: Partial<Record<ComponentName, number>>; zoneShares: number[] }
export interface CalStats { actMin: number; actMax: number; actIqr: number; verdicts: Partial<Record<Verdict, number>>; fragility: number; closeCalls: number; thin: number }
export interface CalibrationReport {
  version: string; cities: number; artists: string[];
  floors: ScoringConfig["affinityFloors"]; spreads: Partial<Record<ComponentName, number>>; dropped: ComponentName[];
  thin: number; closeCalls: { before: number; after: number };
  before: CalStats; after: CalStats; gates: { passed: boolean; failures: string[] };
}

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function quantile(values: number[], q: number): number {
  const s = values.filter(fin).sort((a, b) => a - b);
  if (s.length === 0) return 0;
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos); const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

export function citiesFromRecording(rec: unknown): CalCity[] {
  const r = (rec ?? {}) as { artist?: unknown; boardEvents?: unknown };
  const artist = typeof r.artist === "string" ? r.artist : "unknown";
  const events = Array.isArray(r.boardEvents) ? r.boardEvents : [];
  return events.flatMap((e) => {
    const ev = e as { type?: string; city?: Record<string, unknown> };
    if (ev.type !== "city_scored" || !ev.city) return [];
    const c = ev.city as { name?: unknown; fanHeat?: { value?: unknown }; activation?: { rawComponents?: Record<string, unknown>; components?: Record<string, unknown> }; zones?: Array<{ share?: unknown }> };
    const fan = c.fanHeat?.value;
    const src = c.activation?.rawComponents ?? c.activation?.components ?? {};
    const raw = Object.fromEntries(COMPONENTS.filter((k) => fin(src[k])).map((k) => [k, src[k] as number])) as CalCity["raw"];
    if (!fin(fan) || Object.keys(raw).length < 2 || typeof c.name !== "string") return [];
    return [{ artist, city: c.name, fan, raw, zoneShares: (c.zones ?? []).map((z) => z.share).filter(fin) }];
  });
}

function adjusted(c: CalCity, config: ScoringConfig): Partial<Record<ComponentName, number>> {
  const out: Partial<Record<ComponentName, number>> = {};
  for (const k of AFFINITY_COMPONENTS) if (fin(c.raw[k])) out[k] = rescaleAffinity(c.raw[k]!, config.affinityFloors[k]);
  const conc = config.concentration === "raw" ? c.raw.fan_concentration : concentrationValue(c.zoneShares, "vs_uniform");
  if (fin(conc)) out.fan_concentration = conc;
  return out;
}

export function scoreCity(c: CalCity, config: ScoringConfig, nudge = { act: 0, fan: 0 }): { act: number | null; win: number | null; verdict: Verdict; closeCall: boolean; thin: boolean } {
  const adj = adjusted(c, config);
  const thin = isThin(adj, config.weights);
  const comps = Object.fromEntries(Object.entries(adj).map(([k, v]) => [k, { value: v, refs: [] }]));
  const a = activation(comps, config.weights);
  const act = a.value === null || thin ? null : a.value + nudge.act;
  const fanS = { value: c.fan + nudge.fan, refs: [] };
  const actS = act === null ? { value: null, reason: "insufficient_data" as const, refs: [] } : { value: act, refs: [] };
  const win = winnability(fanS, actS);
  return { act, win: win.value, verdict: verdict(fanS, actS, win, config.thresholds), closeCall: closeCall(fanS, actS, config.thresholds), thin };
}

export function fragility(cities: CalCity[], config: ScoringConfig): number {
  const nudges = [{ act: 1, fan: 0 }, { act: -1, fan: 0 }, { act: 0, fan: 1 }, { act: 0, fan: -1 }];
  return cities.filter((c) => {
    const base = scoreCity(c, config).verdict;
    return nudges.some((n) => scoreCity(c, config, n).verdict !== base);
  }).length;
}

function stats(cities: CalCity[], config: ScoringConfig): CalStats {
  const scored = cities.map((c) => scoreCity(c, config));
  const acts = scored.map((s) => s.act).filter(fin);
  const verdicts: Partial<Record<Verdict, number>> = {};
  for (const s of scored) verdicts[s.verdict] = (verdicts[s.verdict] ?? 0) + 1;
  return { actMin: acts.length ? Math.min(...acts) : 0, actMax: acts.length ? Math.max(...acts) : 0, actIqr: quantile(acts, 0.75) - quantile(acts, 0.25), verdicts, fragility: fragility(cities, config), closeCalls: scored.filter((s) => s.closeCall).length, thin: scored.filter((s) => s.thin).length };
}

export function deriveCalibration(cities: CalCity[], version: string): { config: ScoringConfig; report: CalibrationReport } {
  const floors = { ...DEFAULT_SCORING.affinityFloors };
  for (const k of AFFINITY_COMPONENTS) {
    const vals = cities.map((c) => c.raw[k]).filter(fin);
    floors[k] = vals.length >= 8 ? Math.floor(quantile(vals, 0.1) * 100) / 100 : 0;
  }
  const draft: ScoringConfig = { ...DEFAULT_SCORING, version, affinityFloors: floors, concentration: "vs_uniform", weights: { ...DEFAULT_SCORING.weights }, thresholds: { ...DEFAULT_SCORING.thresholds } };
  const spreads: Partial<Record<ComponentName, number>> = {};
  const dropped: ComponentName[] = [];
  for (const k of COMPONENTS) {
    const vals = cities.map((c) => adjusted(c, draft)[k]).filter(fin);
    spreads[k] = vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
    if (spreads[k]! < MIN_SPREAD) { draft.weights[k] = 0; dropped.push(k); }
  }
  const scored = cities.map((c) => scoreCity(c, draft));
  const acts = scored.map((s) => s.act).filter(fin);
  const wins = scored.map((s) => s.win).filter(fin);
  const t = draft.thresholds;
  if (acts.length) { t.playAct = Math.round(quantile(acts, 0.5)); t.goldmineAct = Math.round(quantile(acts, 0.75)); t.deRiskAct = Math.round(quantile(acts, 0.25)); }
  if (wins.length) t.considerWin = Math.round(quantile(wins, 0.25));

  const before = stats(cities, DEFAULT_SCORING);
  const after = stats(cities, draft);
  const artists = [...new Set(cities.map((c) => c.artist))];
  const failures: string[] = [];
  if (cities.length < MIN_CAL_CITIES) failures.push(`need >= ${MIN_CAL_CITIES} scored cities, have ${cities.length}`);
  if (artists.length < MIN_ARTISTS) failures.push(`need >= ${MIN_ARTISTS} artists, have ${artists.length}`);
  if (![...Object.values(t), ...Object.values(floors)].every(fin)) failures.push("non-finite floor or threshold");
  if (!(after.fragility < before.fragility)) failures.push(`fragility did not improve (${before.fragility} -> ${after.fragility})`);
  if (!(after.actIqr >= 2 * before.actIqr)) failures.push(`activation IQR did not double (${before.actIqr.toFixed(2)} -> ${after.actIqr.toFixed(2)})`);
  return { config: draft, report: { version, cities: cities.length, artists, floors, spreads, dropped, thin: after.thin, closeCalls: { before: before.closeCalls, after: after.closeCalls }, before, after, gates: { passed: failures.length === 0, failures } } };
}

export function renderCalibrationTs(config: ScoringConfig): string {
  return [
    "// Generated by `node dist/scoring/calibrateCli.js` (Plan 5 Task 5). Do not edit by hand; re-run the calibration instead.",
    'import type { ScoringConfig } from "./config.js";',
    "",
    `export const SCORING: ScoringConfig = ${JSON.stringify(config, null, 2)};`,
    "",
  ].join("\n");
}

export function renderReport(r: CalibrationReport): string {
  const row = (label: string, s: CalStats) => `| ${label} | ${s.actMin.toFixed(1)}–${s.actMax.toFixed(1)} | ${s.actIqr.toFixed(2)} | ${s.fragility} | ${Object.entries(s.verdicts).map(([k, v]) => `${k} ${v}`).join(", ")} |`;
  return [
    `# Activation calibration — ${r.version}`,
    "",
    `Inputs: ${r.cities} scored cities from ${r.artists.length} recorded Tour Board runs (${r.artists.join(", ")}). Backtest cases were not used.`,
    "",
    "| Config | Activation range | IQR | Fragile cities (±1 point) | Verdicts |",
    "|---|---|---|---|---|",
    row("Before (default)", r.before),
    row("After (calibrated)", r.after),
    "",
    `Affinity floors: ${Object.entries(r.floors).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(", ")}.`,
    `Dropped (no spread across calibration cities): ${r.dropped.join(", ") || "none"}.`,
    `Thin-data cities made insufficient_data (rule 8): ${r.thin}.`,
    `Close calls (verdict changes within ±${CLOSE_CALL_BAND} points): ${r.closeCalls.before} before, ${r.closeCalls.after} after.`,
    `Gates: ${r.gates.passed ? "passed" : `FAILED — ${r.gates.failures.join("; ")}`}.`,
    "",
  ].join("\n");
}
