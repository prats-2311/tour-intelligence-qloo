import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { SAMPLE_ACCENT_ORDER } from "./cityAccent";
import { isSampleMode, streamTourBoard } from "./client";
import { runKey } from "./journey";
import { buildStrategistContext } from "./strategistContext";
import { variantOfBrief } from "./showcase";
import { defaultShortlist } from "./ranking";
import { boardReducer, initialBoard, type BoardState } from "./tourBoardReducer";
import { seedPlaybooks, type SavedRun } from "../tours/savedRun";
import type { SampleSet, StrategistContext, TourBrief } from "./types";

type Ctx = { state: BoardState; strategistContext: StrategistContext; shortlist: string[]; accentOrder: string[]; /** The city whose playbook was opened last in the current run (null before any). */ lastOpenedId: string | null; setLastOpened(id: string): void; setShortlist(ids: string[]): void; toggleShortlist(id: string): void; run(brief: TourBrief, opts?: { sample?: boolean; sampleSet?: SampleSet; delayMs?: number }): void; /** Re-runs the held recorded run step by step at the recorded pace. */ replay(): void; abort(): void; reset(): void; /** Opens a saved tour: the board finishes at once from its stored events, with no Qloo call. */ loadSaved(run: SavedRun, tourId?: string): void };
const TourBoardContext = createContext<Ctx | null>(null);

let runCounter = 0; // module-wide: every run, in any provider, gets its own id

/** A recorded run opens finished; Replay passes this pace to watch the agent work. */
export const REPLAY_DELAY_MS = 60;

export function TourBoardProvider({ children, sampleDelayMs }: { children: ReactNode; sampleDelayMs?: number }) {
  const [state, dispatch] = useReducer(boardReducer, initialBoard);
  const controllerRef = useRef<AbortController | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  // The last-opened playbook city, keyed by run so a choice never leaks into another run.
  const [opened, setOpened] = useState<Record<string, string>>({});
  const key = runKey(state.source, state.sampleSet, state.brief?.artist, state.source === "showcase" && variantOfBrief(state.brief) === "routing");
  const lastOpenedId = opened[key] ?? null;
  const setLastOpened = useCallback((id: string) => setOpened((o) => (o[key] === id ? o : { ...o, [key]: id })), [key]);

  const silentAbort = useCallback((): boolean => {
    const c = controllerRef.current;
    controllerRef.current = null;
    if (!c) return false;
    c.abort();
    return true;
  }, []);

  const abort = useCallback(() => { if (silentAbort()) dispatch({ type: "interrupted", reason: "user" }); }, [silentAbort]);

  const run = useCallback((brief: TourBrief, opts: { sample?: boolean; sampleSet?: SampleSet; delayMs?: number } = {}) => {
    silentAbort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const sample = opts.sample ?? isSampleMode();
    dispatch({ type: "start", runId: ++runCounter, brief, source: !sample ? "live" : opts.sampleSet === "showcase" ? "showcase" : "sample", sampleSet: opts.sampleSet });
    void (async () => {
      let terminal = false;
      try {
        for await (const event of streamTourBoard(brief, { signal: controller.signal, sample, sampleSet: opts.sampleSet, delayMs: opts.delayMs ?? sampleDelayMs ?? (sample && opts.sampleSet === "showcase" ? 0 : undefined) })) {
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

  const replay = useCallback(() => {
    const brief = stateRef.current.brief;
    if (brief && stateRef.current.source === "showcase") run(brief, { sample: true, sampleSet: "showcase", delayMs: REPLAY_DELAY_MS });
  }, [run]);

  const reset = useCallback(() => { silentAbort(); dispatch({ type: "reset" }); }, [silentAbort]);
  const loadSaved = useCallback((saved: SavedRun, tourId?: string) => {
    silentAbort();
    dispatch({ type: "load", brief: saved.brief, events: saved.boardEvents, shortlist: saved.shortlist, savedId: tourId, runId: ++runCounter });
    const entity = saved.boardEvents.find((e) => e.type === "resolve");
    if (entity?.type === "resolve") seedPlaybooks(entity.entity.entityId, saved.boardEvents.flatMap((e) => (e.type === "city_scored" ? [e.city] : [])), saved.playbooks);
  }, [silentAbort]);
  useEffect(() => () => { silentAbort(); }, [silentAbort]);

  const shortlist = useMemo(() => state.shortlist ?? defaultShortlist(state.cities, state.brief?.maxStops ?? 8), [state.shortlist, state.cities, state.brief?.maxStops]);
  const accentOrder = useMemo(() => (state.source === "sample" ? SAMPLE_ACCENT_ORDER : state.cities.map((c) => c.id)), [state.source, state.cities]);
  const maxStops = state.brief?.maxStops ?? 8;
  const setShortlist = useCallback((ids: string[]) => dispatch({ type: "shortlist", ids: ids.slice(0, Math.max(0, maxStops)) }), [maxStops]);
  const toggleShortlist = useCallback((id: string) => {
    setShortlist(shortlist.includes(id) ? shortlist.filter((x) => x !== id) : [...shortlist, id]);
  }, [shortlist, setShortlist]);

  const strategistContext = useMemo<StrategistContext>(() => buildStrategistContext(state.artist, state.brief, state.cities), [state.artist, state.brief, state.cities]);

  const value = useMemo(() => ({ state, strategistContext, shortlist, accentOrder, lastOpenedId, setLastOpened, setShortlist, toggleShortlist, run, replay, abort, reset, loadSaved }), [state, strategistContext, shortlist, accentOrder, lastOpenedId, setLastOpened, setShortlist, toggleShortlist, run, abort, reset, loadSaved]);
  return <TourBoardContext.Provider value={value}>{children}</TourBoardContext.Provider>;
}

export function useTourBoard(): Ctx {
  const ctx = useContext(TourBoardContext);
  if (!ctx) throw new Error("useTourBoard must be used inside TourBoardProvider");
  return ctx;
}
