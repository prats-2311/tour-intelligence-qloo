import type { ComponentName, ScoringConfig, Thresholds, Verdict } from "./types";

/** Display copy and encodings shared by every Qloo screen. One source, so they cannot drift. */
export const VERDICT_LABEL: Record<Verdict, string> = {
  play: "Play", hidden_goldmine: "Hidden goldmine", de_risk: "De-risk", consider: "Consider", skip: "Skip", insufficient_data: "Not enough data",
};

export const INTEGRITY_LINE = "Affinity signal from aggregate taste data — not a ticket forecast or a claim about individuals.";
export const SAMPLE_TEXT = "Sample data — illustrative, not Qloo output";
/** Label for a recorded run. A placeholder recording (no date) is honestly the sample. */
export const recordedText = (recordedAt: string | null): string => (recordedAt ? `Recorded Qloo run · ${recordedAt.slice(0, 10)} — not live` : SAMPLE_TEXT);

/** Activation component weights as the gateway applies them (display only). */
export const ACTIVATION_WEIGHTS: ReadonlyArray<{ key: ComponentName; label: string; short: string; weight: string }> = [
  { key: "sponsor_fit", label: "Sponsor fit", short: "Sponsor", weight: "0.30" },
  { key: "local_hooks", label: "Local hooks", short: "Hooks", weight: "0.25" },
  { key: "fan_concentration", label: "Fan concentration", short: "Concentration", weight: "0.25" },
  { key: "venue_fit", label: "Venue fit", short: "Venue", weight: "0.20" },
];

/** Mirrors the gateway's DEFAULT_SCORING; used only when a run carries no scoring event (sample data, older recordings). */
export const DEFAULT_SCORING_DISPLAY: ScoringConfig = {
  version: "default",
  weights: { sponsor_fit: 0.3, local_hooks: 0.25, fan_concentration: 0.25, venue_fit: 0.2 },
  affinityFloors: { sponsor_fit: 0, local_hooks: 0, venue_fit: 0 },
  concentration: "raw",
  thresholds: { playFan: 70, playAct: 60, goldmineFanMin: 45, goldmineFanMax: 70, goldmineAct: 75, deRiskFan: 70, deRiskAct: 45, considerWin: 55 },
};

export function ruleLines(t: Thresholds): Array<{ verdict: Verdict; rule: string }> {
  return [
    { verdict: "play", rule: `fan ≥${t.playFan} & activation ≥${t.playAct}` },
    { verdict: "hidden_goldmine", rule: `${t.goldmineFanMin}≤fan<${t.goldmineFanMax} & activation ≥${t.goldmineAct}` },
    { verdict: "de_risk", rule: `fan ≥${t.deRiskFan} & activation <${t.deRiskAct}` },
    { verdict: "consider", rule: `winnability ≥${t.considerWin}` },
    { verdict: "skip", rule: "otherwise" },
    { verdict: "insufficient_data", rule: "when inputs are missing" },
  ];
}

export function weightRows(s: ScoringConfig): Array<{ key: ComponentName; label: string; weight: string; dropped: boolean }> {
  return ACTIVATION_WEIGHTS.map(({ key, label }) => ({ key, label, weight: s.weights[key].toFixed(2), dropped: s.weights[key] === 0 }));
}

export const CLOSE_CALL_LABEL = "Close call";
export const DEFAULT_CLOSE_CALL_BAND = 2;
export const closeCallNote = (band: number = DEFAULT_CLOSE_CALL_BAND) => `Within ${band} points of a verdict line — treat as borderline.`;

/** Shown wherever an insufficient_data city has insufficientReason "location_unresolved" (Qloo resolved its name to another place). */
export const LOCATION_UNRESOLVED_NOTE = "Qloo couldn't place this city precisely, so we didn't score it.";
export const LOCATION_UNRESOLVED_SHORT = "Couldn't place this city";

export type VerdictShape = "circle" | "diamond" | "triangle" | "ring" | "x" | "square";
/** DESIGN.md section 2.5: shape carries the verdict on the map, the matrix and every legend. */
export const VERDICT_SHAPE: Record<Verdict, VerdictShape> = {
  play: "circle", hidden_goldmine: "diamond", de_risk: "triangle", consider: "ring", skip: "x", insufficient_data: "square",
};
