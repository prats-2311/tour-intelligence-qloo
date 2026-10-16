import type { GatewayEvent, Narrative, PlaybookCard, Source } from "./types";

export type PlaybookState = {
  status: "idle" | "streaming" | "done" | "error" | "interrupted"; source: Source;
  cards: PlaybookCard[]; narrative?: Narrative; log: GatewayEvent[]; error?: { code: string; message: string };
};
export type PlaybookAction = { type: "start"; source: Source } | { type: "event"; event: GatewayEvent } | { type: "interrupted" };
export const initialPlaybook: PlaybookState = { status: "idle", source: "live", cards: [], log: [] };

export function playbookReducer(s: PlaybookState, a: PlaybookAction): PlaybookState {
  if (a.type === "start") return { ...initialPlaybook, status: "streaming", source: a.source };
  if (a.type === "interrupted") return s.status === "streaming" ? { ...s, status: "interrupted" } : s;
  const e = a.event;
  switch (e.type) {
    case "tool_call": case "tool_result": return { ...s, log: [...s.log, e] };
    case "playbook": return { ...s, cards: e.playbook.cards };
    case "narrative": return { ...s, narrative: e.narrative };
    case "done": return { ...s, status: "done" };
    case "error": return { ...s, status: "error", error: { code: e.code, message: e.message } };
    default: return s;
  }
}
