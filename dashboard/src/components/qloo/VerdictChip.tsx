import { CircleDashed, Gem, Play, Scale, SkipForward, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Verdict } from "@/lib/qloo/types";

const META: Record<Verdict, { label: string; Icon: LucideIcon; cls: string }> = {
  play: { label: "Play", Icon: Play, cls: "bg-[#243c35] text-verdict-play-text" },
  hidden_goldmine: { label: "Hidden goldmine", Icon: Gem, cls: "bg-verdict-goldmine text-on-gold" },
  de_risk: { label: "De-risk", Icon: TriangleAlert, cls: "bg-[#4b3130] text-verdict-derisk-text" },
  consider: { label: "Consider", Icon: Scale, cls: "bg-[#313846] text-verdict-consider-text" },
  skip: { label: "Skip", Icon: SkipForward, cls: "bg-[#3a3832] text-verdict-skip-text" },
  insufficient_data: { label: "Not enough data", Icon: CircleDashed, cls: "bg-canvas-raised text-canvas-muted" },
};

export function VerdictChip({ verdict, size = "sm" }: { verdict: Verdict; size?: "sm" | "md" }) {
  const { label, Icon, cls } = META[verdict];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-[4px] px-2 font-medium", size === "md" ? "h-7 text-[13px]" : "h-6 text-[12px]", cls)}>
      <Icon size={14} aria-hidden />{label}
    </span>
  );
}
