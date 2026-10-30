import { X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { NavActionId } from "@/lib/nav/navConfig";
import { NavPanel } from "./NavPanel";

export const DRAWER_ID = "app-nav-drawer";
const FOCUSABLE = "a[href],button:not([disabled]):not([aria-disabled='true']),input:not([disabled]),[tabindex]:not([tabindex='-1'])";

/** Off-canvas nav for tablet and phones: modal, Tab stays inside, Esc or the backdrop closes it, focus returns to the hamburger. */
export function NavDrawer({ open, onClose, returnFocusTo, onAction }: { open: boolean; onClose: () => void; returnFocusTo: RefObject<HTMLElement | null>; onAction: (a: NavActionId) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = returnFocusTo.current ?? (document.activeElement as HTMLElement | null);
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onCloseRef.current(); return; }
      if (e.key !== "Tab" || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) { e.preventDefault(); ref.current.focus(); return; }
      const first = items[0]!, last = items[items.length - 1]!, active = document.activeElement;
      if (e.shiftKey && (active === first || active === ref.current || !ref.current.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !ref.current.contains(active))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); opener?.focus?.(); };
  }, [open, returnFocusTo]);

  // A fade and a line under the last visible row while more rows are hidden below.
  useEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    const measure = () => setMore(el.scrollHeight > el.clientHeight + 1 && el.scrollTop + el.clientHeight < el.scrollHeight - 4);
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => { el.removeEventListener("scroll", measure); window.removeEventListener("resize", measure); };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 print:hidden">
      <div data-testid="nav-drawer-overlay" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        ref={ref} id={DRAWER_ID} role="dialog" aria-modal="true" aria-label="Site navigation" tabIndex={-1}
        className="nav-drawer-in absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col gap-3 overflow-y-auto bg-canvas-raised p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] outline-none"
      >
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="font-title text-[18px] font-semibold text-bone">Tour Intelligence</span>
          <button type="button" aria-label="Close navigation" onClick={onClose} className="inline-flex size-11 items-center justify-center rounded-[8px] text-canvas-muted outline-none hover:text-bone focus-visible:ring-2 focus-visible:ring-gold">
            <X size={18} aria-hidden />
          </button>
        </div>
        <NavPanel collapsed={false} onAction={(a) => { onClose(); onAction(a); }} onNavigate={onClose} />
        {more && <div data-testid="drawer-scroll-hint" aria-hidden className="pointer-events-none sticky bottom-0 -mx-3 mt-auto bg-gradient-to-t from-canvas-raised via-canvas-raised/90 to-transparent px-3 pb-2 pt-8 text-center text-[12px] text-canvas-muted">Scroll for more ↓</div>}
      </div>
    </div>
  );
}
