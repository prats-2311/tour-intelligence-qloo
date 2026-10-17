import type { Score, Verdict } from "../types.js";
import { DEFAULT_SCORING, type Thresholds } from "./config.js";

const ok = (s: Score): s is Extract<Score, { value: number }> => typeof s.value === "number" && Number.isFinite(s.value);

export function winnability(fan: Score, act: Score): Score {
  if (!ok(fan) || !ok(act)) return { value: null, reason: "insufficient_data", refs: [...fan.refs, ...act.refs] };
  return { value: 0.5 * fan.value + 0.5 * act.value, refs: [...fan.refs, ...act.refs] };
}

export function verdict(fan: Score, act: Score, win: Score, t: Thresholds = DEFAULT_SCORING.thresholds): Verdict {
  if (!ok(fan) || !ok(act) || !ok(win)) return "insufficient_data";
  if (fan.value >= t.playFan && act.value >= t.playAct) return "play";
  if (fan.value >= t.goldmineFanMin && fan.value < t.goldmineFanMax && act.value >= t.goldmineAct) return "hidden_goldmine";
  if (fan.value >= t.deRiskFan && act.value < t.deRiskAct) return "de_risk";
  if (win.value >= t.considerWin) return "consider";
  return "skip";
}

export function coBillLift(sharedTaste: number, localAffinity: number): number {
  return Math.min(1, Math.max(0, sharedTaste * localAffinity));
}

/** Rule 9: how far (in points) activation or fan heat may move before a verdict is called a close call. */
export const CLOSE_CALL_BAND = 2;

/** True when the verdict changes under activation +-band or fan +-band, with winnability recomputed. False when fan or act is not a number. */
export function closeCall(fan: Score, act: Score, t: Thresholds, band = CLOSE_CALL_BAND): boolean {
  if (!ok(fan) || !ok(act)) return false;
  const at = (f: number, a: number): Verdict => {
    const fs: Score = { value: f, refs: [] };
    const as: Score = { value: a, refs: [] };
    return verdict(fs, as, winnability(fs, as), t);
  };
  const base = at(fan.value, act.value);
  return [[0, band], [0, -band], [band, 0], [-band, 0]].some(([df, da]) => at(fan.value + df!, act.value + da!) !== base);
}
