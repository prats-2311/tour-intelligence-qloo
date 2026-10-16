import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { useIsDesktop } from "@/lib/useMediaQuery";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Sheet({ open, onClose, title, children, side }: { open: boolean; onClose: () => void; title: string; children: ReactNode; side?: "bottom" | "right" }) {
  const isDesktop = useIsDesktop();
  const reduce = useReducedMotion();
  const right = (side ?? (isDesktop ? "right" : "bottom")) === "right";
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        ref.current.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === ref.current || !ref.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !ref.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [open]);

  const dur = reduce ? 0 : 0.22;
  const initial = right ? { x: "100%" } : { y: "100%" };
  const shown = right ? { x: 0 } : { y: 0 };
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-black/60"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: dur }}
            onClick={onClose}
            data-testid="sheet-overlay"
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={initial} animate={shown} exit={initial}
            transition={{ duration: dur, ease: "easeOut" }}
            className={
              right
                ? "absolute inset-y-0 right-0 flex w-[400px] max-w-full flex-col overflow-y-auto bg-paper p-6 outline-none"
                : "absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col overflow-y-auto rounded-t-[18px] bg-paper p-4 outline-none"
            }
          >
            {!right && <span className="mx-auto mb-3 h-1 w-9 rounded-full bg-canvas-line" aria-hidden />}
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id={titleId} className="text-[18px] font-semibold text-canvas-text">{title}</h2>
              <button type="button" aria-label="Close" onClick={onClose} className="-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[4px] text-canvas-muted hover:text-canvas-text">
                <X size={18} aria-hidden />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
