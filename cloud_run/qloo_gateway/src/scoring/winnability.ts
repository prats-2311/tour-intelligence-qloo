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
