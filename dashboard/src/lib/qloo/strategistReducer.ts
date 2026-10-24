import type { GatewayEvent, StrategistToolStatus } from "./types";

export interface ToolChip { id: string; name: string; args: Record<string, unknown>; status?: StrategistToolStatus; summary?: string; resultCount?: number; cached?: boolean }
export interface StrategistTurn {
  question: string;
  thinking: string[];
  tools: ToolChip[];
  answer?: { text: string; unsupportedNumbers: string[]; stoppedEarly: boolean; model: string };
  error?: { code: string; message: string };
  /** Why an interrupted turn stopped ("Stopped" or "Connection lost — partial answer shown"). */
  note?: string;
  status: "streaming" | "done" | "error" | "interrupted";
}
export interface StrategistState { turns: StrategistTurn[] }
export type StrategistAction =
  | { type: "ask"; question: string }
  | { type: "event"; event: GatewayEvent }
  | { type: "interrupted"; note?: string }
  | { type: "reset" };

export const LOST_NOTE = "Connection lost — partial answer shown";
export const STOPPED_NOTE = "Stopped";

function updateLast(s: StrategistState, f: (t: StrategistTurn) => StrategistTurn): StrategistState {
  const last = s.turns[s.turns.length - 1];
  if (!last) return s;
  return { turns: [...s.turns.slice(0, -1), f(last)] };
}

export function strategistReducer(s: StrategistState, a: StrategistAction): StrategistState {
  switch (a.type) {
    case "reset": return { turns: [] };
    case "ask": return { turns: [...s.turns, { question: a.question, thinking: [], tools: [], status: "streaming" }] };
    case "interrupted": return updateLast(s, (t) => (t.status === "streaming" ? { ...t, status: "interrupted", note: a.note ?? LOST_NOTE } : t));
    case "event": break;
  }
  const e = a.event;
  switch (e.type) {
    case "strategist_thinking": return updateLast(s, (t) => ({ ...t, thinking: [...t.thinking, e.summary] }));
    case "strategist_tool_call": return updateLast(s, (t) => ({ ...t, tools: [...t.tools, { id: e.id, name: e.name, args: e.args }] }));
    case "strategist_tool_result":
      return updateLast(s, (t) => ({ ...t, tools: t.tools.map((c) => (c.id === e.id ? { ...c, status: e.status, summary: e.summary, resultCount: e.resultCount, cached: e.cached } : c)) }));
    case "strategist_message":
      return updateLast(s, (t) => ({ ...t, answer: { text: e.text, unsupportedNumbers: e.unsupportedNumbers, stoppedEarly: e.stoppedEarly, model: e.model } }));
    case "strategist_error": return updateLast(s, (t) => ({ ...t, status: "error", error: { code: e.code, message: e.message } }));
    case "error": return updateLast(s, (t) => ({ ...t, status: "error", error: { code: e.code, message: e.message } }));
    case "done": return updateLast(s, (t) => (t.status === "streaming" ? { ...t, status: "done" } : t));
    default: return s;
  }
}
