import type { ComponentName, Verdict } from "./types";

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

export type VerdictShape = "circle" | "diamond" | "triangle" | "ring" | "x" | "square";
/** DESIGN.md section 2.5: shape carries the verdict on the map, the matrix and every legend. */
export const VERDICT_SHAPE: Record<Verdict, VerdictShape> = {
  play: "circle", hidden_goldmine: "diamond", de_risk: "triangle", consider: "ring", skip: "x", insufficient_data: "square",
};
