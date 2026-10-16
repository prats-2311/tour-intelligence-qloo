import { VERDICT_LABEL } from "@/lib/qloo/labels";
import type { Verdict } from "@/lib/qloo/types";

export interface IndexItem { id: string; label: string; accent?: string; verdict?: Verdict }

// Page-like markers: city accent swatch + name + short verdict. `current` marks the chapter in view (desktop rail).
export function ChapterIndex({ items, current, onJump }: { items: IndexItem[]; current?: string; onJump: (id: string) => void }) {
  return (
    <nav aria-label="Chapters">
      <ul className="flex flex-col gap-0.5">
        {items.map((it) => {
          const on = it.id === current;
          return (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => onJump(it.id)}
                aria-current={on ? "true" : undefined}
                className={`relative flex min-h-11 w-full items-center gap-3 rounded-[8px] px-3 text-left text-[14px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${on ? "bg-bone/10 text-bone" : "text-canvas-text hover:bg-paper-raised"}`}
              >
                {on && <span aria-hidden className="absolute inset-y-1 left-0 w-0.5 bg-gold" />}
                <span aria-hidden className="size-2 shrink-0" style={it.accent ? { backgroundColor: it.accent } : undefined} />
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {it.verdict && <span className="shrink-0 text-[12px] text-canvas-muted">{VERDICT_LABEL[it.verdict]}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
