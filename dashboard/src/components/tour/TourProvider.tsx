import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isRoutingBrief, SHOWCASE, showcaseAvailable } from "@/lib/qloo/showcase";
import { useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { readOutcomeAt, writeOutcomeAt, writeV2TourOutcome, type TourOutcome } from "@/lib/tour/tourStorage";
import type { TourStep } from "@/lib/tour/tourSteps";
import { nextTour, TOURS, tourById, tourStorageKey, type TourId } from "@/lib/tour/tours";
import { useWorkspace } from "@/lib/collab/workspaceContext";
import { routeKeepingWs, routeMatches } from "@/lib/tour/tourRoute";
import { buildV2TourSteps } from "@/lib/tour/v2TourSteps";
import { CLOSE_ASK_EVENT, OPEN_ASK_EVENT } from "@/components/strategist/StrategistLauncher";
import { TourOverlay } from "./TourOverlay";
import { TourPrompt } from "./TourPrompt";
import { TourContext, type TourApi } from "./tourContext";

const MAX_RENAVIGATIONS = 5;
/** How long after the tour's own navigation a stray location change still counts as the race to correct, not the user. */
const NAV_WINDOW_MS = 2000;

/** Guided tour of the recorded example: owns the step state, the stored outcome, the first-visit prompt and the overlay. */
export function TourProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
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
  // The newest workspace id, read at navigation time so a step never drops it (and never waits on a render to see it).
  const wsNow = useRef<string | null>(null);
  wsNow.current = new URLSearchParams(search).get("ws") ?? workspace.ws;
  // Set by go(): the step's own navigation. Until its page is reached (or the window passes) a wrong location is a race to fix; after that it is the user.
  const stepNav = useRef({ route: "", reached: false, until: 0 });
  // Routes the tour itself navigated to in the last moments: a location that matches one is the tour still arriving (quick Next presses), not the user.
  const ownNavs = useRef<Array<{ route: string; at: number }>>([]);
  const go = useCallback((list: TourStep[], i: number) => {
    setIndex(i);
    const step = list[i]!;
    if (step.opens === "ask") { askOpened.current = true; window.dispatchEvent(new CustomEvent(OPEN_ASK_EVENT)); }
    else if (askOpened.current) { askOpened.current = false; window.dispatchEvent(new CustomEvent(CLOSE_ASK_EVENT)); }
    // Same page as the previous step and already reached there: nothing to wait for. Anything else waits for its own navigation (a stale location would lie).
    const prev = stepNav.current;
    stepNav.current = { route: step.route, reached: prev.route === step.route && prev.reached, until: Date.now() + NAV_WINDOW_MS };
    ownNavs.current = [...ownNavs.current.filter((n) => Date.now() - n.at < NAV_WINDOW_MS), { route: step.route, at: Date.now() }];
    navigate(routeKeepingWs(step.route, wsNow.current));
  }, [navigate]);

  // Another navigation (the workspace id being written into the URL, a late redirect) can land right after the step's own and leave
  // the page behind: within a short window the step re-navigates. Once its page was reached or the window passed, a location that is
  // not the step's is the user (a link, Back): the tour ends and leaves them where they went.
  const stepRoute = steps?.[index]?.route ?? null;
  const onStepPage = stepRoute === null || routeMatches(stepRoute, pathname, search);
  const tries = useRef({ route: "", n: 0 });
  const endByUser = useRef<() => void>(() => undefined);
  useEffect(() => {
    if (stepRoute === null) return;
    if (onStepPage) { stepNav.current = { ...stepNav.current, reached: true }; return; }
    if (ownNavs.current.some((n) => Date.now() - n.at < NAV_WINDOW_MS && routeMatches(n.route, pathname, search))) return;
    if (stepNav.current.reached || Date.now() > stepNav.current.until) { endByUser.current(); return; }
    if (tries.current.route !== stepRoute) tries.current = { route: stepRoute, n: 0 };
    if (tries.current.n >= MAX_RENAVIGATIONS) return;
    tries.current.n += 1;
    navigate(routeKeepingWs(stepRoute, wsNow.current), { replace: true });
  }, [stepRoute, onStepPage, pathname, search, navigate]);

  const begin = useCallback((id: TourId | "v2", list: TourStep[]) => {
    setRunning(id);
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSteps(list);
    stepNav.current = { route: "", reached: false, until: 0 };
    go(list, 0);
  }, [go]);

  const startTour = useCallback((id: TourId) => {
    const def = tourById(id);
    if (def) begin(id, def.steps(SHOWCASE));
  }, [begin]);

  const finish = useCallback((result: TourOutcome, byUser = false) => {
    setSteps(null);
    if (askOpened.current) { askOpened.current = false; window.dispatchEvent(new CustomEvent(CLOSE_ASK_EVENT)); }
    if (running === "v2") writeV2TourOutcome(result);
    else if (running && byUser && outcomes[running] === "completed") { /* walked away from a tour already finished: keep the tick */ }
    else if (running) { setOutcomes((o) => ({ ...o, [running]: result })); writeOutcomeAt(tourStorageKey(running), result); }
    setRunning(null);
    const el = returnFocus.current;
    returnFocus.current = null;
    // The user clicked somewhere else: only take focus back if it was left on nothing or on the closing popover.
    const a = document.activeElement;
    if (byUser && a && a !== document.body && !a.closest("[data-testid='tour-overlay']")) return;
    // Started from the phone drawer, the button that was focused is gone by now: the hamburger that opened the drawer is the next best place.
    const target = el && el.isConnected ? el : document.querySelector<HTMLElement>("[data-nav-toggle]");
    target?.focus();
  }, [running, outcomes]);
  endByUser.current = () => finish("dismissed", true);

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
          loading={!onStepPage}
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
