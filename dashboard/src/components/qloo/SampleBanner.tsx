import { FlaskConical } from "lucide-react";
import { SAMPLE_TEXT } from "@/lib/qloo/labels";
import { showcaseBannerText } from "@/lib/qloo/showcase";
import type { Source } from "@/lib/qloo/types";

/** Sample-mode label. `compact` sits inside a card (Landing proof card) instead of spanning the page. */
export function SampleBanner({ compact = false, source = "sample" }: { compact?: boolean; source?: Source }) {
  return (
    <div className={compact
      ? "inline-flex w-fit items-center gap-1.5 rounded-[6px] bg-canvas-raised px-2 py-1 text-[12px] text-canvas-muted"
      : "flex w-full items-center gap-2 bg-canvas-raised px-4 py-2 text-[13px] text-canvas-muted"}
      {...(compact ? {} : { "data-app-chrome": "" })}>
      <FlaskConical size={14} aria-hidden />
      <span>{source === "showcase" ? showcaseBannerText() : SAMPLE_TEXT}</span>
    </div>
  );
}
