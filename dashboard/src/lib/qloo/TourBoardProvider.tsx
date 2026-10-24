import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { SAMPLE_ACCENT_ORDER } from "./cityAccent";
import { isSampleMode, streamTourBoard } from "./client";
import { runKey } from "./journey";
import { defaultShortlist } from "./ranking";
import { boardReducer, initialBoard, type BoardState } from "./tourBoardReducer";
import type { SampleSet, StrategistContext, TourBrief } from "./types";

type Ctx = { state: BoardState; strategistContext: StrategistContext; shortlist: string[]; accentOrder: string[]; /** The city whose playbook was opened last in the current run (null before any). */ lastOpenedId: string | null; setLastOpened(id: string): void; setShortlist(ids: string[]): void; toggleShortlist(id: string): void; run(brief: TourBrief, opts?: { sample?: boolean; sampleSet?: SampleSet }): void; abort(): void; reset(): void };
const TourBoardContext = createContext<Ctx | null>(null);

export function TourBoardProvider({ children, sampleDelayMs }: { children: ReactNode; sampleDelayMs?: number }) {
  const [state, dispatch] = useReducer(boardReducer, initialBoard);
  const controllerRef = useRef<AbortController | null>(null);
  // The last-opened playbook city, keyed by run so a choice never leaks into another run.
  const [opened, setOpened] = useState<Record<string, string>>({});
  const key = runKey(state.source, state.sampleSet, state.brief?.artist);
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

  const run = useCallback((brief: TourBrief, opts: { sample?: boolean; sampleSet?: SampleSet } = {}) => {
    silentAbort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const sample = opts.sample ?? isSampleMode();
    dispatch({ type: "start", brief, source: !sample ? "live" : opts.sampleSet === "showcase" ? "showcase" : "sample", sampleSet: opts.sampleSet });
    void (async () => {
      let terminal = false;
      try {
        for await (const event of streamTourBoard(brief, { signal: controller.signal, sample, sampleSet: opts.sampleSet, delayMs: sampleDelayMs })) {
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

  const shortlist = useMemo(() => state.shortlist ?? defaultShortlist(state.cities, state.brief?.maxStops ?? 8), [state.shortlist, state.cities, state.brief?.maxStops]);
  const accentOrder = useMemo(() => (state.source === "sample" ? SAMPLE_ACCENT_ORDER : state.cities.map((c) => c.id)), [state.source, state.cities]);
  const maxStops = state.brief?.maxStops ?? 8;
  const setShortlist = useCallback((ids: string[]) => dispatch({ type: "shortlist", ids: ids.slice(0, Math.max(0, maxStops)) }), [maxStops]);
  const toggleShortlist = useCallback((id: string) => {
    setShortlist(shortlist.includes(id) ? shortlist.filter((x) => x !== id) : [...shortlist, id]);
  }, [shortlist, setShortlist]);

  const strategistContext = useMemo<StrategistContext>(() => {
    const ctx: StrategistContext = {};
    if (state.artist) ctx.artist = { name: state.artist.name, entityId: state.artist.entityId };
    if (state.brief?.regions) ctx.regions = state.brief.regions;
    if (state.cities.length > 0) {
      ctx.cities = state.cities.slice(0, 20).map((c) => ({
        id: c.id, name: c.name, country: c.country, verdict: c.verdict,
        fanHeat: c.fanHeat?.value ?? null, activation: c.activation?.value ?? null, winnability: c.winnability?.value ?? null,
      }));
    }
    return ctx;
  }, [state.artist, state.brief?.regions, state.cities]);

  const value = useMemo(() => ({ state, strategistContext, shortlist, accentOrder, lastOpenedId, setLastOpened, setShortlist, toggleShortlist, run, abort, reset }), [state, strategistContext, shortlist, accentOrder, lastOpenedId, setLastOpened, setShortlist, toggleShortlist, run, abort, reset]);
  return <TourBoardContext.Provider value={value}>{children}</TourBoardContext.Provider>;
}

export function useTourBoard(): Ctx {
  const ctx = useContext(TourBoardContext);
  if (!ctx) throw new Error("useTourBoard must be used inside TourBoardProvider");
  return ctx;
}
