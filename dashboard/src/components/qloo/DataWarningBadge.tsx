import { TriangleAlert } from "lucide-react";
import type { DataWarning } from "@/lib/qloo/types";

function labelFor(warnings: DataWarning[]): string {
  if (warnings.some((w) => w.kind === "error")) return "Qloo error";
  if (warnings.some((w) => w.kind === "partial" || w.kind === "degraded")) return "Partial data";
  return "From cache";
}

export function DataWarningBadge({ warnings }: { warnings: DataWarning[] }) {
  if (warnings.length === 0) return null;
  const title = warnings.map((w) => w.message ?? `${w.tool}: ${w.kind}`).join(" · ");
  return (
    <span title={title} className="inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-[4px] bg-canvas-raised px-2 text-[12px] font-medium text-state-stale">
      <TriangleAlert size={14} aria-hidden />{labelFor(warnings)}
    </span>
  );
}
