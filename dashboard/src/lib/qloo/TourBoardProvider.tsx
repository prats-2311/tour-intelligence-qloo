import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { isSampleMode, streamTourBoard } from "./client";
import { boardReducer, initialBoard, type BoardState } from "./tourBoardReducer";
import type { TourBrief } from "./types";

type Ctx = { state: BoardState; run(brief: TourBrief, opts?: { sample?: boolean }): void; abort(): void; reset(): void };
const TourBoardContext = createContext<Ctx | null>(null);

export function TourBoardProvider({ children, sampleDelayMs }: { children: ReactNode; sampleDelayMs?: number }) {
  const [state, dispatch] = useReducer(boardReducer, initialBoard);
  const controllerRef = useRef<AbortController | null>(null);

  const silentAbort = useCallback((): boolean => {
    const c = controllerRef.current;
    controllerRef.current = null;
    if (!c) return false;
    c.abort();
    return true;
  }, []);

  const abort = useCallback(() => { if (silentAbort()) dispatch({ type: "interrupted", reason: "user" }); }, [silentAbort]);

  const run = useCallback((brief: TourBrief, opts: { sample?: boolean } = {}) => {
    silentAbort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const sample = opts.sample ?? isSampleMode();
    dispatch({ type: "start", brief, source: sample ? "sample" : "live" });
    void (async () => {
      let terminal = false;
      try {
        for await (const event of streamTourBoard(brief, { signal: controller.signal, sample, delayMs: sampleDelayMs })) {
          if (controller.signal.aborted) return;
          dispatch({ type: "event", event });
          if (event.type === "done" || event.type === "error" || event.type === "needs_input") terminal = true;
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      if (!terminal && !controller.signal.aborted) dispatch({ type: "interrupted" });
      if (controllerRef.current === controller) controllerRef.current = null;
    })();
  }, [silentAbort, sampleDelayMs]);

  const reset = useCallback(() => { silentAbort(); dispatch({ type: "reset" }); }, [silentAbort]);
  useEffect(() => () => { silentAbort(); }, [silentAbort]);

  const value = useMemo(() => ({ state, run, abort, reset }), [state, run, abort, reset]);
  return <TourBoardContext.Provider value={value}>{children}</TourBoardContext.Provider>;
}

export function useTourBoard(): Ctx {
  const ctx = useContext(TourBoardContext);
  if (!ctx) throw new Error("useTourBoard must be used inside TourBoardProvider");
  return ctx;
}
