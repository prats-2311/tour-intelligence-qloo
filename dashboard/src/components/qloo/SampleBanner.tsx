import { FlaskConical } from "lucide-react";
import { SAMPLE_TEXT } from "@/lib/qloo/labels";

/** Sample-mode label. `compact` sits inside a card (Landing proof card) instead of spanning the page. */
export function SampleBanner({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact
      ? "inline-flex w-fit items-center gap-1.5 rounded-[6px] bg-canvas-raised px-2 py-1 text-[12px] text-canvas-muted"
      : "flex w-full items-center gap-2 bg-canvas-raised px-4 py-2 text-[13px] text-canvas-muted"}>
      <FlaskConical size={14} aria-hidden />
      <span>{SAMPLE_TEXT}</span>
    </div>
  );
}
