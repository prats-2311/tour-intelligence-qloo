import { useEffect, useRef, useState } from "react";
import { useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { getTour, ToursError } from "./api";
import { parseSavedRun } from "./savedRun";

export type OpenSavedStatus = "none" | "loading" | "ready" | "error";

/**
 * Opens the saved tour `id` (the board's `?saved=` param): fetches it once, then hands the stored run to the board provider,
 * which finishes the run from the stored events with no Qloo call. A board that already holds this tour does not fetch.
 */
export function useOpenSavedTour(id: string | null): { status: OpenSavedStatus; message: string | null } {
  const { state, loadSaved } = useTourBoard();
  const tried = useRef<string | null>(null);
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null);
  const held = !!id && state.savedId === id;

  useEffect(() => {
    if (!id || held || tried.current === id) return;
    tried.current = id;
    const ctl = new AbortController();
    getTour(id, { signal: ctl.signal })
      .then((t) => {
        const run = parseSavedRun(t.run);
        if (!run) throw new ToursError("server", "This saved tour couldn't be opened. It may have been saved by a different version.");
        loadSaved(run, id);
      })
      .catch((e: unknown) => {
        if (ctl.signal.aborted) return;
        tried.current = null;
        setFailed({ id, message: e instanceof ToursError ? e.message : "This saved tour couldn't be opened." });
      });
    return () => { ctl.abort(); if (tried.current === id && state.savedId !== id) tried.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, held]);

  if (!id) return { status: "none", message: null };
  if (held) return { status: "ready", message: null };
  if (failed && failed.id === id) return { status: "error", message: failed.message };
  return { status: "loading", message: null };
}
