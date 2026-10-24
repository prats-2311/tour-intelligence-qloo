import { clockLine, verdictClocks } from "@/lib/qloo/clocks";
import type { DateWindow } from "@/lib/qloo/types";

/** "on-sale in 23 days · posters by 12 Feb · confirm sponsor by 22 Jan", from the brief's tour window. Renders nothing without a window. */
export function VerdictClockLine({ window, now, className = "" }: { window?: DateWindow; now?: Date; className?: string }) {
  const clocks = verdictClocks(window, now);
  if (!clocks) return null;
  return <p data-testid="verdict-clocks" className={`text-[13px] text-canvas-text ${className}`}>{clockLine(clocks)}</p>;
}
