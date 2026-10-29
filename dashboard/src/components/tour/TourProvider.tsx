import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isRoutingBrief, SHOWCASE, showcaseAvailable } from "@/lib/qloo/showcase";
import { useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { readTourOutcome, writeTourOutcome, type TourOutcome } from "@/lib/tour/tourStorage";
import { buildTourSteps, type TourStep } from "@/lib/tour/tourSteps";
import { TourOverlay } from "./TourOverlay";
import { TourPrompt } from "./TourPrompt";
import { TourContext } from "./tourContext";

/** Guided tour of the recorded example: owns the step state, the stored outcome, the first-visit prompt and the overlay. */
export function TourProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { state } = useTourBoard();
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  // Seeded from storage once; the in-memory value keeps the prompt away for the rest of the visit even when storage throws.
  const [outcome, setOutcome] = useState<TourOutcome | null>(() => readTourOutcome());
  const returnFocus = useRef<HTMLElement | null>(null);

  const go = useCallback((list: TourStep[], i: number) => {
    setIndex(i);
    navigate(list[i]!.route);
  }, [navigate]);

  const start = useCallback(() => {
    const list = buildTourSteps(SHOWCASE);
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSteps(list);
    go(list, 0);
  }, [go]);

  const finish = useCallback((result: TourOutcome) => {
    setSteps(null);
    setOutcome(result);
    writeTourOutcome(result);
    const el = returnFocus.current;
    returnFocus.current = null;
    if (el && el.isConnected) el.focus();
  }, []);

  const dismissPrompt = useCallback(() => { setOutcome("dismissed"); writeTourOutcome("dismissed"); }, []);

  const active = steps !== null;
  const api = useMemo(() => ({ start, active }), [start, active]);
  const onRecordedPage = pathname === "/" || (pathname === "/tours/board" && state.source === "showcase" && !isRoutingBrief(state.brief));
  const showPrompt = !active && outcome === null && onRecordedPage && showcaseAvailable();

  return (
    <TourContext.Provider value={api}>
      {children}
      {showPrompt && <TourPrompt onStart={start} onDismiss={dismissPrompt} />}
      {steps && (
        <TourOverlay
          steps={steps}
          index={index}
          onBack={() => go(steps, Math.max(0, index - 1))}
          onNext={() => (index >= steps.length - 1 ? finish("completed") : go(steps, index + 1))}
          onSkip={() => finish("dismissed")}
        />
      )}
    </TourContext.Provider>
  );
}
