import { useEffect, useRef } from "react";

/**
 * First-visit invitation. Not modal and never auto-starts. A bottom bar (above the stepper on phones) that publishes its height as
 * `--tour-prompt-h`, which the app shell reserves under the page, so it never sits on top of body text or links.
 */
export function TourPrompt({ onStart, onDismiss }: { onStart: () => void; onDismiss: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty("--tour-prompt-h", `${el.offsetHeight}px`);
    publish();
    window.addEventListener("resize", publish);
    return () => { window.removeEventListener("resize", publish); root.style.removeProperty("--tour-prompt-h"); };
  }, []);
  const btn = "inline-flex h-11 items-center justify-center rounded-[10px] px-4 text-[14px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold lg:h-10";
  return (
    <section
      ref={ref}
      aria-label="Guided tour"
      data-testid="tour-prompt"
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onDismiss(); } }}
      className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-[45] flex flex-wrap items-center gap-x-4 gap-y-2 bg-paper-raised px-4 py-3 shadow-[0_-6px_18px_rgba(0,0,0,0.35)] print:hidden lg:bottom-0 lg:justify-center lg:px-8"
    >
      <p className="text-[15px] font-semibold leading-snug text-canvas-text">New here? Take the 2-minute tour</p>
      <div className="flex gap-2">
        <button type="button" onClick={onStart} className={`btn-gold ${btn}`}>Start tour</button>
        <button type="button" onClick={onDismiss} className={`${btn} text-canvas-muted hover:text-canvas-text`}>No thanks</button>
      </div>
    </section>
  );
}
