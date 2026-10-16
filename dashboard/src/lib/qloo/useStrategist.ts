import { useCallback, useEffect, useReducer, useRef } from "react";
import { streamStrategist } from "./client";
import { LOST_NOTE, STOPPED_NOTE, strategistReducer, type StrategistState } from "./strategistReducer";
import type { ChatMessage, StrategistContext } from "./types";

const MAX_MESSAGES = 12;

export function useStrategist(context: StrategistContext, opts: { sample: boolean }): { state: StrategistState; ask(question: string): void; stop(): void; reset(): void; busy: boolean } {
  const [state, dispatch] = useReducer(strategistReducer, { turns: [] });
  const stateRef = useRef(state);
  stateRef.current = state;
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const ctxRef = useRef({ context, sample: opts.sample });
  ctxRef.current = { context, sample: opts.sample };

  const ask = useCallback((question: string) => {
    const q = question.trim();
    if (!q || busyRef.current) return;
    busyRef.current = true;
    const messages: ChatMessage[] = [];
    for (const t of stateRef.current.turns) {
      if (t.answer) messages.push({ role: "user", text: t.question }, { role: "assistant", text: t.answer.text });
    }
    messages.push({ role: "user", text: q });
    const ac = new AbortController();
    abortRef.current = ac;
    dispatch({ type: "ask", question: q });
    void (async () => {
      let finished = false;
      try {
        for await (const event of streamStrategist({ messages: messages.slice(-MAX_MESSAGES), context: ctxRef.current.context }, { signal: ac.signal, sample: ctxRef.current.sample })) {
          if (ac.signal.aborted) break;
          dispatch({ type: "event", event });
          if (event.type === "done") finished = true;
        }
        if (!finished && !ac.signal.aborted) dispatch({ type: "interrupted", note: LOST_NOTE });
      } catch {
        dispatch({ type: "interrupted", note: ac.signal.aborted ? STOPPED_NOTE : LOST_NOTE });
      } finally {
        if (abortRef.current === ac) abortRef.current = null;
        busyRef.current = false;
      }
    })();
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "interrupted", note: STOPPED_NOTE });
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "reset" });
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const last = state.turns[state.turns.length - 1];
  return { state, ask, stop, reset, busy: last?.status === "streaming" };
}
