import { showcaseParam } from "@/lib/qloo/showcase";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, matchPath } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { Sheet } from "@/components/qloo/Sheet";
import { SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { isSampleMode } from "@/lib/qloo/client";
import { useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { StrategistPanel } from "./StrategistPanel";

const STORAGE_KEY = "strategistOpen";
export const DOCK_WIDTH = 380;
/** The guided tour dispatches this on `window` to open the Ask panel (see TourProvider); the dock and the phone sheet both listen. */
export const OPEN_ASK_EVENT = "tour:open-ask";
/** The tour leaves the chat step: the panel goes back to how it was before the tour opened it. */
export const CLOSE_ASK_EVENT = "tour:close-ask";
const SHOWCASE_IDLE_HINT = "Tap a recorded question to replay how the agent answered it.";

/** Tour routes and Taste only; the legacy campaign pages never get the launcher. */
export const showsStrategist = (pathname: string): boolean => pathname === "/insights" || pathname === "/tours" || pathname.startsWith("/tours/") || pathname.startsWith("/insights/");

/** Routes whose mobile layout ends in a sticky 64 px action footer above the tab bar; the FAB sits above it. */
export const hasStickyFooter = (pathname: string): boolean =>
  pathname === "/tours/board" || pathname === "/tours/book" || pathname.startsWith("/tours/playbook/");

/** Routes whose sticky footer reserves a right-hand gutter for the FAB: the button sits inside the footer band, never over the list. */
export const dockedInFooter = (pathname: string, search = ""): boolean =>
  (pathname === "/tours/board" && new URLSearchParams(search).get("mode") !== "without") || pathname.startsWith("/tours/playbook/");

function readOpen(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
}
function writeOpen(open: boolean) {
  try { localStorage.setItem(STORAGE_KEY, open ? "1" : "0"); } catch { /* storage unavailable */ }
}

export function useStrategistDock(): { open: boolean; setOpen(open: boolean): void } {
  const [open, setOpenState] = useState(readOpen);
  const setOpen = useCallback((v: boolean) => { setOpenState(v); writeOpen(v); }, []);
  const openRef = useRef(open);
  openRef.current = open;
  // The tour opens the panel for its chat step and puts it back afterwards: closed stays closed, open stays open.
  const before = useRef<boolean | null>(null);
  useEffect(() => {
    const on = () => { if (before.current === null) before.current = openRef.current; setOpen(true); };
    const off = () => { if (before.current === false) setOpen(false); before.current = null; };
    window.addEventListener(OPEN_ASK_EVENT, on);
    window.addEventListener(CLOSE_ASK_EVENT, off);
    return () => { window.removeEventListener(OPEN_ASK_EVENT, on); window.removeEventListener(CLOSE_ASK_EVENT, off); };
  }, [setOpen]);
  return { open, setOpen };
}

function useLauncherModel() {
  const { pathname, search } = useLocation();
  const { state, strategistContext } = useTourBoard();
  const sampleParam = new URLSearchParams(search).get("sample");
  const showcase = state.source === "showcase" || (state.status === "idle" && showcaseParam(new URLSearchParams(search).get("showcase")) !== null);
  const sample = showcase || state.source === "sample" || (state.status === "idle" && (isSampleMode() || sampleParam === "1" || sampleParam === "long"));
  const focusCityId = matchPath("/tours/playbook/:cityId", pathname)?.params.cityId;
  const cityName = focusCityId
    ? (state.cities.find((c) => c.id === focusCityId)?.name ?? (sample && state.cities.length === 0 ? SAMPLE_CITIES.find((c) => c.id === focusCityId)?.name : undefined))
    : undefined;
  const title = cityName ? `About ${cityName}` : state.artist ? `About ${state.artist.name}` : showcase ? SHOWCASE_IDLE_HINT : "Ask about a tour";
  const context = focusCityId ? { ...strategistContext, focusCityId } : strategistContext;
  return { sample, showcase, title, context };
}

/** Phones: a FAB above the tab bar (56 px; 48 px when docked in a footer) that opens a full-height sheet. */
export function StrategistFab() {
  const [open, setOpen] = useState(false);
  const { sample, showcase, title, context } = useLauncherModel();
  const { pathname, search } = useLocation();
  useEffect(() => {
    const on = () => setOpen(true);
    const off = () => setOpen(false);
    window.addEventListener(OPEN_ASK_EVENT, on);
    window.addEventListener(CLOSE_ASK_EVENT, off);
    return () => { window.removeEventListener(OPEN_ASK_EVENT, on); window.removeEventListener(CLOSE_ASK_EVENT, off); };
  }, []);
  const lift = dockedInFooter(pathname, search) ? "bottom-[calc(4.5rem+env(safe-area-inset-bottom))] size-12 right-3"
    : hasStickyFooter(pathname) && pathname !== "/tours/board" ? "bottom-[calc(9.5rem+env(safe-area-inset-bottom))] size-14 right-4" : "bottom-[calc(5rem+env(safe-area-inset-bottom))] size-14 right-4";
  return (
    <>
      <button
        type="button"
        aria-label="Ask about this tour"
        data-tour="ask"
        data-app-chrome
        onClick={() => setOpen(true)}
        className={`btn-gold fixed z-30 flex items-center justify-center rounded-full ${lift} outline-none focus-visible:ring-2 focus-visible:ring-bone`}
      >
        <MessageSquare size={22} aria-hidden />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Ask about this tour" full>
        <div className="-mx-4 -mb-4 min-h-0 flex-1">
          <StrategistPanel context={context} sample={sample} showcase={showcase} title={title} hideHeading />
        </div>
      </Sheet>
    </>
  );
}

/** Desktop top-bar toggle. */
export function StrategistToggle({ open, onToggle }: { open: boolean; onToggle(): void }) {
  return (
    <button
      type="button"
      aria-pressed={open}
      data-tour="ask"
      onClick={onToggle}
      className={`flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-sans text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold ${open ? "text-gold" : "text-canvas-muted hover:text-bone"}`}
    >
      <MessageSquare size={15} aria-hidden /> Ask about this tour
    </button>
  );
}

/** Desktop docked right panel; the main area pads itself to make room. */
export function StrategistDock({ onClose }: { onClose(): void }) {
  const { sample, showcase, title, context } = useLauncherModel();
  return (
    <aside aria-label="Ask about this tour" data-app-chrome style={{ width: DOCK_WIDTH }} className="fixed bottom-0 right-0 top-14 z-20 border-l border-canvas-line bg-canvas">
      <StrategistPanel context={context} sample={sample} showcase={showcase} title={title} onClose={onClose} />
    </aside>
  );
}
