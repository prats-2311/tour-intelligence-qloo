import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { NavActionId } from "@/lib/nav/navConfig";
import { NavPanel } from "./NavPanel";

export const SIDEBAR_ID = "app-sidebar";

/** Desktop left rail: 240 px with labels, 64 px icons-only when collapsed. The grid column width is set by AppShell from the same state. */
export function Sidebar({ collapsed, onToggle, onAction }: { collapsed: boolean; onToggle: () => void; onAction: (a: NavActionId) => void }) {
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <aside
      id={SIDEBAR_ID} aria-label="Site sections" data-collapsed={collapsed}
      className={`sticky top-14 flex h-[calc(100dvh-3.5rem)] min-w-0 flex-col gap-4 self-start bg-canvas-raised py-4 ${collapsed ? "px-2" : "overflow-y-auto px-3"}`}
    >
      <NavPanel collapsed={collapsed} onAction={onAction} />
      <div className="group/item relative mt-auto">
        <button
          type="button" onClick={onToggle} aria-expanded={!collapsed} aria-controls={SIDEBAR_ID} aria-keyshortcuts="["
          className={`flex min-h-11 w-full items-center gap-3 rounded-[8px] font-sans text-[13px] font-medium text-canvas-muted outline-none transition-colors hover:bg-canvas-line hover:text-bone focus-visible:ring-2 focus-visible:ring-gold ${collapsed ? "justify-center" : "px-3"}`}
        >
          <Icon size={20} aria-hidden className="shrink-0" />
          <span className={collapsed ? "sr-only" : "flex-1 truncate text-left"}>{collapsed ? "Expand sidebar" : "Collapse sidebar"}</span>
          {!collapsed && <kbd aria-hidden className="rounded border border-canvas-line px-1.5 font-mono text-[11px] text-canvas-muted">[</kbd>}
        </button>
        {collapsed && (
          <span data-tooltip aria-hidden className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-[8px] bg-paper px-2.5 py-1.5 text-[12px] font-medium text-bone opacity-0 shadow-lg transition-opacity motion-reduce:transition-none group-focus-within/item:opacity-100 group-hover/item:opacity-100">Expand sidebar</span>
        )}
      </div>
    </aside>
  );
}
