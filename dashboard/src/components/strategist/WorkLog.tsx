import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import type { StrategistTurn } from "@/lib/qloo/strategistReducer";
import { StrategistThinking } from "./StrategistThinking";
import { ToolChips } from "./ToolChips";

/**
 * The collapsible "Work log" of one answer: Gemini's own reasoning summary, then one line per Qloo call (plain tool name,
 * status, result count as the gateway reported it). The answer itself stays below it. Nothing here is invented: it shows only streamed events.
 */
export function WorkLog({ turn, defaultOpen }: { turn: StrategistTurn; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  if (turn.thinking.length === 0 && turn.tools.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="flex min-h-11 w-fit items-center gap-1.5 rounded-lg text-[13px] font-semibold text-canvas-muted outline-none hover:text-canvas-text focus-visible:ring-2 focus-visible:ring-gold/50">
        Work log
        <ChevronDown size={16} strokeWidth={1.75} aria-hidden className={open ? "rotate-180" : ""} />
      </button>
      <div id={id} hidden={!open} className="flex flex-col gap-2">
        <StrategistThinking summaries={turn.thinking} defaultOpen={defaultOpen} />
        <ToolChips tools={turn.tools} streaming={turn.status === "streaming"} />
      </div>
    </div>
  );
}
