import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useIsDesktop, useMediaQuery } from "@/lib/useMediaQuery";
import type { TourStep } from "@/lib/tour/tourSteps";
import { bestCorner, clampRing, scrollDelta } from "@/lib/tour/placement";

interface Box { top: number; left: number; width: number; height: number }
interface Pos { top: number; left: number }

const POP_W = 360;
const GAP = 12;
const RING_PAD = 6;
const HEADER = 72; // desktop sticky header plus breathing room
const HEADER_BAR = 56; // the sticky header itself: a ring never draws under it
const PHONE_TOP = 16; // phones: the top bar scrolls away, so only a small margin
const PHONE_BOTTOM_NAV = 72; // bottom stepper plus margin
const SHEET_GAP = 12;

/** True when the element or an ancestor is position:fixed or sticky (a floating button, the header): scrolling cannot move it, so the sheet moves instead. */
function isFixed(el: HTMLElement): boolean {
  for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) { const pos = getComputedStyle(n).position; if (pos === "fixed" || pos === "sticky") return true; }
  return false;
}

/** The first element carrying one of these `data-tour` values that is actually on screen (hidden copies of a target are skipped). */
function findTarget(ids: string[]): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>("[data-tour]"));
  for (const id of ids) {
    const el = all.find((e) => e.dataset.tour === id && e.getClientRects().length > 0);
    if (el) return el;
  }
  return null;
}

const same = (a: Box | null, b: Box | null): boolean => a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);

/** Desktop popover placement beside the target when there is room, else below or above; null when nothing fits (the caller anchors it to a corner). */
function place(b: Box, popH: number, vw: number, vh: number): Pos | null {
  const clampTop = (t: number) => Math.min(Math.max(t, HEADER), Math.max(HEADER, vh - popH - GAP));
  if (vw - (b.left + b.width) >= POP_W + GAP * 2) return { top: clampTop(b.top), left: b.left + b.width + RING_PAD + GAP };
  if (b.left >= POP_W + GAP * 2) return { top: clampTop(b.top), left: b.left - RING_PAD - GAP - POP_W };
  const left = Math.min(Math.max(b.left, GAP), vw - POP_W - GAP);
  if (vh - (b.top + b.height) >= popH + GAP * 2) return { top: b.top + b.height + RING_PAD + GAP, left };
  if (b.top - HEADER >= popH + GAP * 2) return { top: b.top - RING_PAD - GAP - popH, left };
  return null;
}

export function TourOverlay({ steps, index, next, onNextTour, onBack, onNext, onSkip }: { steps: TourStep[]; index: number; /** The tour that follows this one, offered on the last step. */ next?: { title: string; steps: number } | null; onNextTour?: () => void; onBack: () => void; onNext: () => void; onSkip: () => void }) {
  const step = steps[index]!;
  const last = index === steps.length - 1;
  const isDesktop = useIsDesktop();
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  const titleId = useId();
  const bodyId = useId();
  const popRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  /** The ring, cut to the viewport and the band the popover leaves free. */
  const [ring, setRing] = useState<Box | null>(null);
  /** Phones: which edge the sheet sits on. It moves to the top when the target is a floating button near the bottom. */
  const [corner, setCorner] = useState(false);
  const [side, setSide] = useState<"bottom" | "top">("bottom");
  const targetRef = useRef<HTMLElement | null>(null);

  // Keep the latest handlers reachable from the document listener without re-subscribing every render.
  const handlers = useRef({ onBack, onNext, onSkip, index });
  handlers.current = { onBack, onNext, onSkip, index };

  // A new step forgets the previous target and brings the popover into focus.
  useLayoutEffect(() => {
    targetRef.current = null;
    setBox(null);
    setRing(null);
    setPos(null);
    setSide("bottom");
  }, [step.id, step.route]);
  useEffect(() => { popRef.current?.focus(); }, [index]);

  /** The band of the screen the popover leaves free: [topLimit, bottomLimit] in viewport pixels. */
  const freeBand = useCallback((sideNow: "bottom" | "top", rect?: { left: number; width: number }) => {
    const vh = window.innerHeight, vw = window.innerWidth;
    if (isDesktop) {
      // A target too wide to leave room beside it gets the popover below it, so the band stops above the popover.
      const beside = !rect || vw - (rect.left + rect.width) >= POP_W + GAP * 2 || rect.left >= POP_W + GAP * 2;
      const popH = popRef.current?.offsetHeight ?? 0;
      return { topLimit: HEADER, bottomLimit: beside ? vh - 8 : vh - popH - GAP * 2 - 8 };
    }
    const sheetRect = popRef.current?.getBoundingClientRect();
    if (sideNow === "top") return { topLimit: (sheetRect?.bottom ?? 0) + SHEET_GAP, bottomLimit: vh - PHONE_BOTTOM_NAV };
    return { topLimit: PHONE_TOP, bottomLimit: (sheetRect && sheetRect.height > 0 ? sheetRect.top : vh) - SHEET_GAP };
  }, [isDesktop]);

  const scrollToTarget = useCallback((el: HTMLElement, sideNow: "bottom" | "top") => {
    const behavior: ScrollBehavior = reduce ? "auto" : "smooth";
    // A floating button cannot be scrolled; everything else is brought fully into the band the popover leaves free, with the page title above it when both fit.
    if (isFixed(el)) return;
    try { el.scrollIntoView({ block: "nearest", inline: "center", behavior: "auto" }); } catch { /* old engines: the ring still tracks the element */ }
    const r = el.getBoundingClientRect();
    const h1 = document.querySelector<HTMLElement>("main h1");
    const t = h1 && h1.getClientRects().length > 0 ? h1.getBoundingClientRect() : null;
    const { topLimit, bottomLimit } = freeBand(sideNow, r);
    const delta = scrollDelta({ target: { top: r.top, height: r.height }, title: t ? { top: t.top } : null, topLimit, bottomLimit });
    if (delta !== 0 && typeof window.scrollBy === "function") window.scrollBy({ top: delta, behavior });
  }, [reduce, freeBand]);

  // Follow the target every frame: it may mount late (after navigation), move (scroll, resize, animation) or disappear. No target means a centred step.
  useEffect(() => {
    let raf = 0;
    let scrolledFor: HTMLElement | null = null;
    let sideNow: "bottom" | "top" = "bottom";
    let scrolledAt = 0;
    const startedAt = performance.now();
    const tick = () => {
      let el = targetRef.current;
      if (!el || !el.isConnected) { el = step.targets.length ? findTarget(step.targets) : null; targetRef.current = el; }
      let next: Box | null = null;
      if (el) {
        if (scrolledFor !== el) {
          scrolledFor = el;
          const fixedLow = !isDesktop && isFixed(el) && el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2 > window.innerHeight / 2;
          sideNow = fixedLow ? "top" : "bottom";
          setSide(sideNow);
          scrolledAt = performance.now();
          scrollToTarget(el, sideNow);
        } else if (performance.now() - startedAt < 3000 && performance.now() - scrolledAt > 600 && !isFixed(el)) {
          // Lazy content and the popover's own size settle after the first scroll: look once more and nudge the target back into the free band.
          const r = el.getBoundingClientRect();
          const { topLimit, bottomLimit } = freeBand(sideNow, r);
          const fits = r.height <= bottomLimit - topLimit;
          const outside = fits ? r.top < topLimit - 4 || r.top + r.height > bottomLimit + 4 : r.top > bottomLimit - 40 || r.top + r.height < topLimit + 40 || r.top < topLimit - 4;
          if (outside) { scrolledAt = performance.now(); scrollToTarget(el, sideNow); }
        }
        const r = el.getBoundingClientRect();
        next = { top: r.top, left: r.left, width: r.width, height: r.height };
      }
      setBox((prev) => (same(prev, next) ? prev : next));
      const fixedTarget = el ? isFixed(el) : false;
      const nextRing = next ? (() => {
        const band = freeBand(sideNow);
        return clampRing({ top: next.top - RING_PAD, left: next.left - RING_PAD, width: next.width + RING_PAD * 2, height: next.height + RING_PAD * 2 }, { vw: window.innerWidth, topLimit: isDesktop && !fixedTarget ? HEADER_BAR : 4, bottomLimit: isDesktop ? window.innerHeight - 4 : band.bottomLimit + (sideNow === "top" ? 4 : SHEET_GAP - 4) });
      })() : null;
      setRing((prev) => (same(prev, nextRing) ? prev : nextRing));
      if (next && isDesktop && popRef.current) {
        const popH = popRef.current.offsetHeight;
        const p = place(next, popH, window.innerWidth, window.innerHeight);
        // No room beside, below or above: the corner the target overlaps least, instead of a fixed bottom-right one.
        const q = p ?? bestCorner(next, { popW: POP_W, popH, vw: window.innerWidth, vh: window.innerHeight, header: HEADER, margin: 24 });
        setCorner(!p);
        setPos((prev) => (prev?.top === q.top && prev?.left === q.left ? prev : q));
      } else setPos((prev) => (prev === null ? prev : null));
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [step.id, step.route, step.targets, isDesktop, scrollToTarget, freeBand]);

  // Esc skips, arrows move, Tab never leaves the popover. The page stays usable otherwise (no modal).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      const typing = !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || ["tab", "slider", "textbox", "combobox"].includes(t.getAttribute("role") ?? ""));
      const h = handlers.current;
      if (e.key === "Escape") { e.preventDefault(); h.onSkip(); return; }
      if (e.key === "ArrowRight" && !typing) { e.preventDefault(); h.onNext(); return; }
      if (e.key === "ArrowLeft" && !typing) { e.preventDefault(); if (h.index > 0) h.onBack(); return; }
      if (e.key === "Tab" && popRef.current) {
        const items = Array.from(popRef.current.querySelectorAll<HTMLElement>("button:not([disabled])"));
        if (items.length === 0) { e.preventDefault(); popRef.current.focus(); return; }
        const first = items[0]!;
        const lastEl = items[items.length - 1]!;
        const at = document.activeElement;
        if (!popRef.current.contains(at) || at === popRef.current) { e.preventDefault(); (e.shiftKey ? lastEl : first).focus(); }
        else if (e.shiftKey && at === first) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && at === lastEl) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const sheet = !isDesktop;
  const centred = box === null;
  const layout = sheet ? (side === "top" ? "sheet-top" : "sheet") : centred ? "centred" : pos ? (corner ? "corner" : "beside") : "corner";
  const motion = reduce ? "" : "transition-[top,left,width,height] duration-200 ease-out";
  const popClass = sheet
    ? side === "top" ? "fixed inset-x-0 top-0 max-h-[55dvh] overflow-y-auto rounded-b-[18px]" : "fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] max-h-[55dvh] overflow-y-auto rounded-t-[18px]"
    : centred ? "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[14px]"
    : pos ? "fixed rounded-[14px]" : "fixed bottom-6 right-6 rounded-[14px]";
  const popStyle = !sheet && !centred && pos ? { top: pos.top, left: pos.left, width: POP_W } : sheet ? undefined : { width: POP_W };
  const btn = "inline-flex h-11 items-center justify-center rounded-[10px] px-4 text-[14px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-40 lg:h-10";

  return (
    <div data-testid="tour-overlay" className="pointer-events-none fixed inset-0 z-[60] print:hidden">
      {box && ring && ring.height > 0 && (
        <div
          aria-hidden
          data-testid="tour-ring"
          className={`fixed rounded-[12px] border-2 border-gold shadow-[0_0_0_4px_rgba(255,204,0,0.22)] ${motion}`}
          style={{ top: ring.top, left: ring.left, width: ring.width, height: ring.height }}
        />
      )}
      <div
        ref={popRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        data-testid="tour-popover"
        data-layout={layout}
        data-motion={reduce ? "reduced" : "full"}
        style={popStyle}
        className={`pointer-events-auto flex flex-col gap-3 bg-paper-raised p-4 shadow-xl outline-none ${popClass} ${motion}`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 id={titleId} className="font-title text-[18px] leading-tight text-canvas-text">{step.title}</h2>
          <span aria-live="polite" className="shrink-0 font-mono text-[12px] tabular-nums text-canvas-muted">{index + 1} of {steps.length}</span>
        </div>
        <p id={bodyId} className="text-[14px] leading-[1.5] text-canvas-text">{step.body}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onBack} disabled={index === 0} className={`${btn} bg-paper text-canvas-text hover:bg-paper-raised`}>Back</button>
          {last && next && onNextTour
            ? <button type="button" onClick={onNextTour} className={`btn-gold ${btn}`}>{`Next: ${next.title} (${next.steps} ${next.steps === 1 ? "step" : "steps"})`}</button>
            : null}
          <button type="button" onClick={onNext} className={`${last && next ? "bg-paper text-canvas-text hover:bg-paper-raised" : "btn-gold"} ${btn}`}>{last ? "Done" : "Next"}</button>
          <button type="button" onClick={onSkip} className={`${btn} ml-auto text-canvas-muted hover:text-canvas-text`}>Skip</button>
        </div>
      </div>
    </div>
  );
}
