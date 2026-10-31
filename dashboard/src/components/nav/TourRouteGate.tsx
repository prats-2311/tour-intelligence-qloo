import { useEffect, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { PlaybookSkeleton } from "@/components/ui/Skeletons";
import { showcaseQuery } from "@/lib/qloo/showcase";
import { useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { useOpenSavedTour } from "@/lib/tours/useOpenSaved";

// The board has its own bare-URL behaviour and its own `?saved=` opening; "My tours" is a list.
const GATED = /^\/tours\/(playbook|pitch|book|budget|insights)(\/|$)/;
const btn = "inline-flex h-12 min-h-11 items-center rounded-[8px] bg-paper-raised px-3 text-[13px] font-semibold text-canvas-text hover:bg-[#3a3932] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

function EmptyTour({ ws, message }: { ws: string | null; message?: string | null }) {
  const wsQ = ws ? `&ws=${encodeURIComponent(ws)}` : "";
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-start gap-3 py-10">
      <h1 className="font-title text-[24px] leading-tight text-canvas-text">This tour isn't open in this tab</h1>
      <p className="text-[13px] text-canvas-muted">Tours you build stay in the tab that built them. Open one from your saved tours, or look at the example.</p>
      {message && <p role="alert" className="text-[13px] text-canvas-muted">{message}</p>}
      <div className="flex flex-wrap gap-3">
        <Link to={`/tours/mine${ws ? `?ws=${encodeURIComponent(ws)}` : ""}`} className={btn}>My tours</Link>
        <Link to={`/tours/board${showcaseQuery(false)}${wsQ}`} className={btn}>See the example tour</Link>
      </div>
    </div>
  );
}

/**
 * Guards the tour pages that need a run: with `?saved=<id>` and nothing open it loads that saved tour first (skeleton meanwhile);
 * with no saved id, no showcase and no sample it says the tour is not open here, instead of silently showing the example.
 * Also keeps `saved=<id>` on the address while the board holds a saved run, whatever link got the reader here.
 */
export function TourRouteGate({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  const { state } = useTourBoard();
  const navigate = useNavigate();
  const q = new URLSearchParams(search);
  const savedParam = q.get("saved");
  const gated = GATED.test(pathname);
  const explicit = q.has("showcase") || q.has("sample");
  const opened = useOpenSavedTour(gated && !explicit ? savedParam : null);
  const holdId = state.source === "live" && /^\/tours\//.test(pathname) && pathname !== "/tours/mine" && !explicit ? state.savedId : undefined;

  useEffect(() => {
    if (!holdId || savedParam === holdId) return;
    const n = new URLSearchParams(search);
    n.set("saved", holdId);
    navigate({ pathname, search: `?${n.toString()}` }, { replace: true });
  }, [holdId, savedParam, pathname, search, navigate]);

  if (!gated || explicit) return <>{children}</>;
  if (savedParam) {
    if (opened.status === "loading") return <PlaybookSkeleton />;
    if (opened.status === "error") return <EmptyTour ws={q.get("ws")} message={opened.message} />;
    return <>{children}</>;
  }
  if (state.status === "idle" && state.cities.length === 0) return <EmptyTour ws={q.get("ws")} />;
  return <>{children}</>;
}
