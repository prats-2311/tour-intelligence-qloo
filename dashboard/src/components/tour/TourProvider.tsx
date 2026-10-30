import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isRoutingBrief, SHOWCASE, showcaseAvailable } from "@/lib/qloo/showcase";
import { useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { readOutcomeAt, writeOutcomeAt, writeV2TourOutcome, type TourOutcome } from "@/lib/tour/tourStorage";
import type { TourStep } from "@/lib/tour/tourSteps";
import { nextTour, TOURS, tourById, tourStorageKey, type TourId } from "@/lib/tour/tours";
import { useWorkspace } from "@/lib/collab/workspaceContext";
import { buildV2TourSteps } from "@/lib/tour/v2TourSteps";
import { CLOSE_ASK_EVENT, OPEN_ASK_EVENT } from "@/components/strategist/StrategistLauncher";
import { TourOverlay } from "./TourOverlay";
import { TourPrompt } from "./TourPrompt";
import { TourContext, type TourApi } from "./tourContext";


/** Guided tour of the recorded example: owns the step state, the stored outcome, the first-visit prompt and the overlay. */
export function TourProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { state } = useTourBoard();
  const workspace = useWorkspace();
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  // Seeded from storage once; the in-memory values keep the prompt and the ticks right for the rest of the visit even when storage throws.
  const [outcomes, setOutcomes] = useState<Record<TourId, TourOutcome | null>>(() => Object.fromEntries(TOURS.map((t) => [t.id, readOutcomeAt(tourStorageKey(t.id))])) as Record<TourId, TourOutcome | null>);
  const returnFocus = useRef<HTMLElement | null>(null);
  // Which tour is running: an id for the registry tours, "v2" for the /v2 page tour (its own storage), null when idle.
  const [running, setRunning] = useState<TourId | "v2" | null>(null);

  // True while the tour has the Ask panel open for a step; it is closed again on the next step that does not need it, or when the tour ends.
  const askOpened = useRef(false);
  const go = useCallback((list: TourStep[], i: number) => {
    setIndex(i);
    const step = list[i]!;
    if (step.opens === "ask") { askOpened.current = true; window.dispatchEvent(new CustomEvent(OPEN_ASK_EVENT)); }
    else if (askOpened.current) { askOpened.current = false; window.dispatchEvent(new CustomEvent(CLOSE_ASK_EVENT)); }
    navigate(step.route);
  }, [navigate]);

  const begin = useCallback((id: TourId | "v2", list: TourStep[]) => {
    setRunning(id);
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSteps(list);
    go(list, 0);
  }, [go]);

  const startTour = useCallback((id: TourId) => {
    const def = tourById(id);
    if (def) begin(id, def.steps(SHOWCASE));
  }, [begin]);

  const finish = useCallback((result: TourOutcome) => {
    setSteps(null);
    if (askOpened.current) { askOpened.current = false; window.dispatchEvent(new CustomEvent(CLOSE_ASK_EVENT)); }
    if (running === "v2") writeV2TourOutcome(result);
    else if (running) { setOutcomes((o) => ({ ...o, [running]: result })); writeOutcomeAt(tourStorageKey(running), result); }
    setRunning(null);
    const el = returnFocus.current;
    returnFocus.current = null;
    // Started from the phone drawer, the button that was focused is gone by now: the hamburger that opened the drawer is the next best place.
    const target = el && el.isConnected ? el : document.querySelector<HTMLElement>("[data-nav-toggle]");
    target?.focus();
  }, [running]);

  const available = useCallback((t: { requires?: "workspace" }) => t.requires !== "workspace" || workspace.enabled, [workspace.enabled]);
  const successor = running && running !== "v2" ? nextTour(running, available) : null;
  const takeOffer = useCallback(() => {
    if (!successor || !running || running === "v2") return;
    setOutcomes((o) => ({ ...o, [running]: "completed" }));
    writeOutcomeAt(tourStorageKey(running), "completed");
    begin(successor.id, successor.steps(SHOWCASE));
  }, [successor, running, begin]);

  const startV1 = useCallback(() => startTour("essentials"), [startTour]);
  const startV2 = useCallback(() => begin("v2", buildV2TourSteps(SHOWCASE)), [begin]);

  const dismissPrompt = useCallback(() => { setOutcomes((o) => ({ ...o, essentials: "dismissed" })); writeOutcomeAt(tourStorageKey("essentials"), "dismissed"); }, []);

  const active = steps !== null;
  const completed = useMemo(() => Object.fromEntries(TOURS.map((t) => [t.id, outcomes[t.id] === "completed"])) as Record<TourId, boolean>, [outcomes]);
  const api = useMemo<TourApi>(() => ({ start: startV1, startTour, startV2, active, completed }), [startV1, startTour, startV2, active, completed]);
  const onRecordedPage = pathname === "/" || (pathname === "/tours/board" && state.source === "showcase" && !isRoutingBrief(state.brief));
  const showPrompt = !active && outcomes.essentials === null && onRecordedPage && showcaseAvailable();

  return (
    <TourContext.Provider value={api}>
      {children}
      {showPrompt && <TourPrompt onStart={startV1} onDismiss={dismissPrompt} />}
      {steps && (
        <TourOverlay
          steps={steps}
          index={index}
          next={successor ? { title: successor.title, steps: successor.steps(SHOWCASE).length } : null}
          onNextTour={takeOffer}
          onBack={() => go(steps, Math.max(0, index - 1))}
          onNext={() => (index >= steps.length - 1 ? finish("completed") : go(steps, index + 1))}
          onSkip={() => finish("dismissed")}
        />
      )}
    </TourContext.Provider>
  );
}
