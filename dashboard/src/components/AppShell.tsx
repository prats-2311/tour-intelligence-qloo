import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useIsDesktop } from "@/lib/useMediaQuery";
import { StrategistDock, StrategistFab, StrategistToggle, showsStrategist, useStrategistDock } from "./strategist/StrategistLauncher";
import { JourneyStepper } from "./JourneyStepper";

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isDesktop = useIsDesktop();
  const dock = useStrategistDock();
  const strategistRoute = showsStrategist(location.pathname);
  const docked = isDesktop && strategistRoute && dock.open;

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {isDesktop ? (
        <header data-app-shell className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between bg-canvas-raised px-8">
          <div className="flex items-center gap-8">
            <div className="flex items-baseline gap-2">
              <span className="font-title text-[18px] font-semibold text-bone">Tour Intelligence</span>
              <span className="font-sans text-[13px] font-medium text-canvas-muted">× Qloo</span>
            </div>
            <nav aria-label="Primary"><JourneyStepper variant="top" /></nav>
          </div>
          <div className="flex items-center gap-2">
            {strategistRoute && <StrategistToggle open={dock.open} onToggle={() => dock.setOpen(!dock.open)} />}
          </div>
        </header>
      ) : (
        <nav
          data-app-shell
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-40 bg-canvas-raised pb-[env(safe-area-inset-bottom)]"
        >
          <JourneyStepper variant="bottom" />
        </nav>
      )}

      <main className={`min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8 ${isDesktop ? "" : "pb-[calc(5rem+env(safe-area-inset-bottom))]"} ${docked ? "lg:pr-[380px]" : ""}`}>
        {children}
      </main>

      {strategistRoute && !isDesktop && <StrategistFab />}
      {docked && <StrategistDock onClose={() => dock.setOpen(false)} />}
    </div>
  );
}
