import type { Score, Verdict } from "../types.js";

const ok = (s: Score): s is Extract<Score, { value: number }> => typeof s.value === "number" && Number.isFinite(s.value);

export function winnability(fan: Score, act: Score): Score {
  if (!ok(fan) || !ok(act)) return { value: null, reason: "insufficient_data", refs: [...fan.refs, ...act.refs] };
  return { value: 0.5 * fan.value + 0.5 * act.value, refs: [...fan.refs, ...act.refs] };
}

export function verdict(fan: Score, act: Score, win: Score): Verdict {
  if (!ok(fan) || !ok(act) || !ok(win)) return "insufficient_data";
  if (fan.value >= 70 && act.value >= 60) return "play";
  if (fan.value >= 45 && fan.value < 70 && act.value >= 75) return "hidden_goldmine";
  if (fan.value >= 70 && act.value < 45) return "de_risk";
  if (win.value >= 55) return "consider";
  return "skip";
}

export function coBillLift(overlap: number, localAffinity: number): number {
  return Math.min(1, Math.max(0, overlap * localAffinity));
}
