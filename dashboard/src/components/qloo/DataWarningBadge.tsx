import { CircleAlert, CircleDashed, History, type LucideIcon } from "lucide-react";
import type { DataWarning } from "@/lib/qloo/types";

export function warningLabel(warnings: DataWarning[]): string | null {
  return warnings.length === 0 ? null : metaFor(warnings).label;
}

function metaFor(warnings: DataWarning[]): { label: string; Icon: LucideIcon; cls: string } {
  if (warnings.some((w) => w.kind === "error")) return { label: "Qloo error", Icon: CircleAlert, cls: "bg-state-error-bg text-state-error" };
  if (warnings.some((w) => w.kind === "partial" || w.kind === "degraded")) return { label: "Partial data", Icon: CircleDashed, cls: "bg-canvas-raised text-state-stale" };
  return { label: "From cache", Icon: History, cls: "bg-canvas-raised text-state-stale" };
}

export function DataWarningBadge({ warnings }: { warnings: DataWarning[] }) {
  if (warnings.length === 0) return null;
  const { label, Icon, cls } = metaFor(warnings);
  const title = warnings.map((w) => w.message ?? `${w.tool}: ${w.kind}`).join(" · ");
  return (
    <span title={title} className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-[4px] px-2 text-[12px] font-medium ${cls}`}>
      <Icon size={14} aria-hidden />{label}
    </span>
  );
}
