import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A horizontally scrolling box that keyboard users can reach (tabindex 0, named region) and everyone can see scrolls:
 * a fade on the right edge while more is hidden, and a one-line cue under it whenever the content overflows.
 */
export function ScrollRegion({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => { setOver(el.scrollWidth > el.clientWidth + 1); setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1); };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    window.addEventListener("resize", measure);
    return () => { el.removeEventListener("scroll", measure); ro?.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  return (
    <div className="relative min-w-0 max-w-full">
      <div ref={ref} role="region" tabIndex={0} aria-label={`${label}, scrolls sideways`} className={`max-w-full overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${className}`}>{children}</div>
      {over && !atEnd && <div aria-hidden="true" data-testid="scroll-fade" className="pointer-events-none absolute inset-y-0 right-0 w-10 rounded-r-[12px] bg-gradient-to-l from-paper to-transparent" />}
      {over && <p aria-hidden="true" data-testid="scroll-cue" className="m-0 mt-1 text-[12px] text-canvas-muted">Scroll sideways for more columns →</p>}
    </div>
  );
}
