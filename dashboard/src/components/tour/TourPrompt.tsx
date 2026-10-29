/** First-visit invitation. Not modal and never auto-starts: it sits above the bottom bar on phones and in the corner on desktop. */
export function TourPrompt({ onStart, onDismiss }: { onStart: () => void; onDismiss: () => void }) {
  const btn = "inline-flex h-11 items-center justify-center rounded-[10px] px-4 text-[14px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold lg:h-10";
  return (
    <section
      aria-label="Guided tour"
      data-testid="tour-prompt"
      className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[45] flex flex-col gap-3 rounded-[14px] bg-paper-raised p-4 shadow-lg print:hidden lg:inset-x-auto lg:bottom-6 lg:left-6 lg:w-[340px]"
    >
      <p className="text-[15px] font-semibold leading-snug text-canvas-text">New here? Take the 60-second tour</p>
      <div className="flex gap-2">
        <button type="button" onClick={onStart} className={`btn-gold ${btn}`}>Start tour</button>
        <button type="button" onClick={onDismiss} className={`${btn} text-canvas-muted hover:text-canvas-text`}>No thanks</button>
      </div>
    </section>
  );
}
