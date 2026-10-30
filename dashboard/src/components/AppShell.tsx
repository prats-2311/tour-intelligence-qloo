import { Menu } from "lucide-react";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useIsDesktop } from "@/lib/useMediaQuery";
import { StrategistDock, StrategistFab, StrategistToggle, showsStrategist, useStrategistDock } from "./strategist/StrategistLauncher";
import { JourneyStepper } from "./JourneyStepper";
import { ActivityPanel } from "./collab/TeamBar";
import { Breadcrumbs } from "./nav/Breadcrumbs";
import { DRAWER_ID, NavDrawer } from "./nav/NavDrawer";
import { Sidebar } from "./nav/Sidebar";
import { useWorkspace } from "@/lib/collab/workspaceContext";
import { ToastProvider, useToast } from "./ui/Toast";
import { shareToast } from "./collab/useCollabWrite";
import type { NavActionId } from "@/lib/nav/navConfig";
import { useNavCollapsed } from "@/lib/nav/useNavCollapsed";
import { useTourBoard } from "@/lib/qloo/TourBoardProvider";

/** The shell owns the one toast viewport for every page under it. */
export function AppShell({ children }: { children: ReactNode }) {
  return <ToastProvider><Shell>{children}</Shell></ToastProvider>;
}

function Shell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isDesktop = useIsDesktop();
  const dock = useStrategistDock();
  const strategistRoute = showsStrategist(location.pathname);
  const docked = isDesktop && strategistRoute && dock.open;
  const landing = location.pathname === "/";
  const showSidebar = isDesktop && !landing;
  const { collapsed, toggle } = useNavCollapsed(showSidebar);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const { toast } = useToast();
  const hamburger = useRef<HTMLButtonElement>(null);
  const workspace = useWorkspace();
  const { state } = useTourBoard();
  const onAction = (a: NavActionId) => {
    if (a === "activity") setActivityOpen(true);
    else void workspace.share().then((r) => toast(shareToast(r, workspace.error)));
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <a
        href="#main-content"
        onClick={(e) => { e.preventDefault(); const m = document.getElementById("main-content"); m?.focus(); m?.scrollIntoView?.({ block: "start" }); }}
        className="fixed left-2 top-2 z-[60] -translate-y-[200%] rounded-[8px] bg-gold px-4 py-3 text-[14px] font-semibold text-on-gold outline-none focus:translate-y-0 focus-visible:ring-2 focus-visible:ring-bone print:hidden"
      >Skip to main content</a>
      {isDesktop ? (
        <header data-app-shell className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between bg-canvas-raised px-8">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <img src="/favicon.svg" alt="" width={20} height={20} className="size-5 shrink-0 self-center" />
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
        <>
        {!landing && (
          <div data-mobile-bar data-app-chrome className="flex h-11 shrink-0 items-center gap-1 bg-canvas-raised pr-2">
            <button ref={hamburger} type="button" aria-label="Open navigation" aria-expanded={drawerOpen} aria-controls={DRAWER_ID} onClick={() => setDrawerOpen(true)} className="inline-flex size-11 items-center justify-center rounded-[8px] text-bone outline-none focus-visible:ring-2 focus-visible:ring-gold">
              <Menu size={20} aria-hidden />
            </button>
            <Breadcrumbs inline />
          </div>
        )}
        <nav
          data-app-shell
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-40 bg-canvas-raised pb-[env(safe-area-inset-bottom)]"
        >
          <JourneyStepper variant="bottom" />
        </nav>
        </>
      )}

      <div
        data-nav-grid
        style={showSidebar ? ({ "--nav-w": collapsed ? "64px" : "240px" } as CSSProperties) : undefined}
        className={showSidebar ? "grid flex-1 grid-cols-[var(--nav-w)_minmax(0,1fr)] transition-[grid-template-columns] duration-200 motion-reduce:transition-none" : "flex flex-1 flex-col"}
      >
        {showSidebar && <Sidebar collapsed={collapsed} onToggle={toggle} onAction={onAction} />}
        <div className="flex min-w-0 flex-1 flex-col">
      {!landing && isDesktop && <Breadcrumbs />}
      <main id="main-content" tabIndex={-1} className={`min-w-0 flex-1 outline-none px-4 ${landing ? "pt-6 lg:pt-8" : "pt-2 lg:pt-3"} ${isDesktop ? "pb-8" : "pb-[calc(5rem+env(safe-area-inset-bottom))]"} lg:px-8 ${docked ? "lg:pr-[380px]" : ""}`}>
        {children}
      </main>
        </div>
      </div>

      {!isDesktop && !landing && <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} returnFocusTo={hamburger} onAction={onAction} />}
      {workspace.enabled && <ActivityPanel open={activityOpen} onClose={() => setActivityOpen(false)} cities={state.cities} />}

      {strategistRoute && !isDesktop && <StrategistFab />}
      {docked && <StrategistDock onClose={() => dock.setOpen(false)} />}
    </div>
  );
}
