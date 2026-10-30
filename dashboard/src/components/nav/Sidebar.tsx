import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { NavActionId } from "@/lib/nav/navConfig";
import { NavPanel } from "./NavPanel";
import { Tipped } from "./NavList";

export const SIDEBAR_ID = "app-sidebar";

/**
 * Desktop left rail: 240 px with labels, 64 px icons-only when collapsed. The grid column width is set by AppShell from the same state.
 * The rail scrolls on its own (every item stays reachable on a short screen) and the collapse toggle is pinned at its top.
 */
export function Sidebar({ collapsed, onToggle, onAction }: { collapsed: boolean; onToggle: () => void; onAction: (a: NavActionId) => void }) {
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
  return (
    <aside
      id={SIDEBAR_ID} aria-label="Site sections" data-collapsed={collapsed}
      className={`sticky top-14 flex h-[calc(100dvh-3.5rem)] min-w-0 flex-col gap-4 self-start overflow-y-auto overflow-x-hidden bg-canvas-raised pb-4 ${collapsed ? "px-2" : "px-3"}`}
    >
      <Tipped as="div" tip={label} collapsed={collapsed} className="sticky top-0 z-10 -mx-1 bg-canvas-raised px-1 pb-1 pt-4">
        <button
          type="button" onClick={onToggle} aria-expanded={!collapsed} aria-controls={SIDEBAR_ID} aria-keyshortcuts="["
          className={`flex min-h-11 w-full items-center gap-3 rounded-[8px] font-sans text-[13px] font-medium text-canvas-muted outline-none transition-colors hover:bg-canvas-line hover:text-bone focus-visible:ring-2 focus-visible:ring-gold ${collapsed ? "justify-center" : "px-3"}`}
        >
          <Icon size={20} aria-hidden className="shrink-0" />
          <span className={collapsed ? "sr-only" : "flex-1 truncate text-left"}>{label}</span>
          {!collapsed && <kbd aria-hidden className="rounded border border-canvas-line px-1.5 font-mono text-[11px] text-canvas-muted">[</kbd>}
        </button>
      </Tipped>
      <NavPanel collapsed={collapsed} onAction={onAction} />
    </aside>
  );
}
