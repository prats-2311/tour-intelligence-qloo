import { DEFAULT_WEIGHTS, fanConcentration, type ComponentName } from "./activation.js";

export type AffinityComponent = "sponsor_fit" | "local_hooks" | "venue_fit";
export const AFFINITY_COMPONENTS: readonly AffinityComponent[] = ["sponsor_fit", "local_hooks", "venue_fit"];
export interface Thresholds {
  playFan: number; playAct: number;
  goldmineFanMin: number; goldmineFanMax: number; goldmineAct: number;
  deRiskFan: number; deRiskAct: number;
  considerWin: number;
}
export interface ScoringConfig {
  version: string;
  weights: Record<ComponentName, number>;
  affinityFloors: Record<AffinityComponent, number>;
  concentration: "raw" | "vs_uniform";
  thresholds: Thresholds;
}

/** The original §5.2/§5.3 constants. Scores computed with this config are identical to the pre-calibration pipeline. */
export const DEFAULT_SCORING: ScoringConfig = {
  version: "default",
  weights: { ...DEFAULT_WEIGHTS },
  affinityFloors: { sponsor_fit: 0, local_hooks: 0, venue_fit: 0 },
  concentration: "raw",
  thresholds: { playFan: 70, playAct: 60, goldmineFanMin: 45, goldmineFanMax: 70, goldmineAct: 75, deRiskFan: 70, deRiskAct: 45, considerWin: 55 },
};

/** Qloo affinities for top recommendations sit near 1; rescaling from a calibrated floor spreads them out. */
export function rescaleAffinity(value: number, floor: number): number {
  if (!Number.isFinite(value)) return Number.NaN;
  if (floor <= 0) return value;
  return Math.min(1, Math.max(0, (value - floor) / (1 - floor)));
}

/** "raw" is the top-3 zone share; "vs_uniform" is how far the top 3 sit above an even spread (0 = even, 1 = all heat in 3 zones). */
export function concentrationValue(shares: number[], mode: ScoringConfig["concentration"]): number | null {
  const top3 = fanConcentration(shares);
  if (top3 === null || mode === "raw") return top3;
  if (shares.length <= 3) return null;
  const even = 3 / shares.length;
  return Math.min(1, Math.max(0, (top3 - even) / (1 - even)));
}
