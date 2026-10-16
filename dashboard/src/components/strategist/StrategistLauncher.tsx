import { useCallback, useState } from "react";
import { useLocation, matchPath } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { Sheet } from "@/components/qloo/Sheet";
import { SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { isSampleMode } from "@/lib/qloo/client";
import { useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { StrategistPanel } from "./StrategistPanel";

const STORAGE_KEY = "strategistOpen";
export const DOCK_WIDTH = 380;

/** Tour routes and Insights only; the legacy campaign pages never get the launcher. */
export const showsStrategist = (pathname: string): boolean => pathname === "/insights" || pathname === "/tours" || pathname.startsWith("/tours/") || pathname.startsWith("/insights/");

function readOpen(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
}
function writeOpen(open: boolean) {
  try { localStorage.setItem(STORAGE_KEY, open ? "1" : "0"); } catch { /* storage unavailable */ }
}

export function useStrategistDock(): { open: boolean; setOpen(open: boolean): void } {
  const [open, setOpenState] = useState(readOpen);
  const setOpen = useCallback((v: boolean) => { setOpenState(v); writeOpen(v); }, []);
  return { open, setOpen };
}

function useLauncherModel() {
  const { pathname, search } = useLocation();
  const { state, strategistContext } = useTourBoard();
  const sampleParam = new URLSearchParams(search).get("sample");
  const sample = state.source === "sample" || (state.status === "idle" && (isSampleMode() || sampleParam === "1" || sampleParam === "long"));
  const focusCityId = matchPath("/tours/playbook/:cityId", pathname)?.params.cityId;
  const cityName = focusCityId
    ? (state.cities.find((c) => c.id === focusCityId)?.name ?? (sample && state.cities.length === 0 ? SAMPLE_CITIES.find((c) => c.id === focusCityId)?.name : undefined))
    : undefined;
  const title = cityName ? `About ${cityName}` : state.artist ? `About ${state.artist.name}` : "Ask about a tour";
  const context = focusCityId ? { ...strategistContext, focusCityId } : strategistContext;
  return { sample, title, context };
}

/** Phones: a 56 px FAB above the tab bar that opens a full-height sheet. */
export function StrategistFab() {
  const [open, setOpen] = useState(false);
  const { sample, title, context } = useLauncherModel();
  return (
    <>
      <button
        type="button"
        aria-label="Ask the strategist"
        onClick={() => setOpen(true)}
        className="btn-gold fixed right-4 z-30 flex size-14 items-center justify-center rounded-full bottom-[calc(5rem+env(safe-area-inset-bottom))] outline-none focus-visible:ring-2 focus-visible:ring-bone"
      >
        <MessageSquare size={22} aria-hidden />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Ask the strategist" full>
        <div className="-mx-4 -mb-4 min-h-0 flex-1">
          <StrategistPanel context={context} sample={sample} title={title} hideHeading />
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
      onClick={onToggle}
      className={`flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-sans text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold ${open ? "text-gold" : "text-canvas-muted hover:text-bone"}`}
    >
      <MessageSquare size={15} aria-hidden /> Strategist
    </button>
  );
}

/** Desktop docked right panel; the main area pads itself to make room. */
export function StrategistDock({ onClose }: { onClose(): void }) {
  const { sample, title, context } = useLauncherModel();
  return (
    <aside aria-label="Ask the strategist" style={{ width: DOCK_WIDTH }} className="fixed bottom-0 right-0 top-14 z-20 border-l border-canvas-line bg-canvas">
      <StrategistPanel context={context} sample={sample} title={title} onClose={onClose} />
    </aside>
  );
}
