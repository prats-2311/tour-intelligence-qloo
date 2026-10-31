import { RotateCw } from "lucide-react";

/** Stand-in for a city chapter whose playbook is still building or could not be built. It holds the chapter's final slot so the order never jumps. */
export function PendingChapter({ id, city, failed, onRetry }: { id: string; city: string; failed: boolean; onRetry: () => void }) {
  return (
    <section id={`chapter-${id}`} aria-labelledby={`title-${id}`} data-testid={`pending-chapter-${id}`} className="book-chapter flex min-w-0 flex-col gap-3 px-4 lg:px-0">
      <h2 id={`title-${id}`} className="font-title break-words text-[24px] leading-[1.1] text-canvas-text">
        {failed ? city : `${city}: building this chapter…`}
      </h2>
      {failed ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[15px] text-canvas-text">Couldn't build this chapter.</p>
          <button type="button" onClick={onRetry} aria-label={`Retry ${city}`} className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-paper-raised px-4 text-[14px] font-semibold text-canvas-text hover:bg-[#3a3932] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
            <RotateCw size={16} aria-hidden />Retry
          </button>
        </div>
      ) : (
        <div className="skeleton h-[120px] w-full rounded-[18px]" aria-hidden />
      )}
    </section>
  );
}
