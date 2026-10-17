import { Crosshair } from "lucide-react";
import { CLOSE_CALL_LABEL } from "@/lib/qloo/labels";

/** Borderline flag. Icon plus text, never colour alone; wraps rather than overflowing narrow rows. */
export function CloseCallChip() {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-[4px] border border-canvas-line px-2 text-[12px] font-medium text-canvas-text">
      <Crosshair size={14} aria-hidden />{CLOSE_CALL_LABEL}
    </span>
  );
}
