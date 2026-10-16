import type { ReactNode } from "react";

/** Inline status notice for partial, stopped or failed runs (Tour Board and Taste Insights). */
export function Notice({ children }: { children: ReactNode }) {
  return <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] bg-canvas px-3 py-2 text-[13px] text-canvas-text">{children}</div>;
}

export const interruptedText = (reason: "user" | "connection" | undefined) =>
  reason === "user" ? "Stopped — results so far shown" : "Connection lost — results so far shown";

export const regionNoticeText = (empty: string[], unavailable: Array<{ region: string }>) =>
  [...empty.map((r) => `No Qloo signal in ${r}`), ...unavailable.map((r) => `${r.region} unavailable`)].join(" · ");
