import { useEffect, useRef } from "react";
import { showcaseAvailable, showcaseBrief } from "./showcase";
import { useTourBoard } from "./TourBoardProvider";

/**
 * True when a page was opened with no run at all and a recorded example exists. Pages show their
 * skeleton while this holds and `useOpenExampleRun` starts the replay, so nobody is stranded on an empty page.
 */
export function useWantsExample(extraConditionsMet: boolean): boolean {
  const { state } = useTourBoard();
  return extraConditionsMet && state.status === "idle" && state.cities.length === 0 && showcaseAvailable();
}

/** Starts the recorded showcase once when `want` becomes true (zero network: it replays from memory). */
export function useOpenExampleRun(want: boolean): void {
  const { run } = useTourBoard();
  const started = useRef(false);
  useEffect(() => {
    if (!want || started.current) return;
    started.current = true;
    run(showcaseBrief(), { sample: true, sampleSet: "showcase" });
  }, [want, run]);
}
