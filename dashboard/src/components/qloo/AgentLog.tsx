import { motion, useReducedMotion } from "framer-motion";
import { Check, Circle, LoaderCircle, Radio, TriangleAlert } from "lucide-react";
import { toolLabel } from "@/lib/qloo/labels";
import { countQlooCalls, narrate, type LogStep } from "@/lib/qloo/narrate";
import type { GatewayEvent } from "@/lib/qloo/types";

/** `label` names whose calls these are: the board by default, "Playbook" on a playbook page. */
export function AgentLogChip({ events, onOpen, label: scope = "Board" }: { events: GatewayEvent[]; onOpen: () => void; label?: string }) {
  const { total } = countQlooCalls(events);
  const label = total === 1 ? "call" : "calls";
  return (
    <button type="button" onClick={onOpen} className="inline-flex h-11 items-center gap-2 rounded-md bg-canvas-raised px-3 text-[13px] text-canvas-text">
      <Radio size={16} aria-hidden />
      <span>{scope} · {total} Qloo {label}</span>
    </button>
  );
}

function Marker({ status }: { status: LogStep["status"] }) {
  const reduce = useReducedMotion();
  if (status === "success") {
    return <Check size={14} className="text-verdict-play-text" aria-hidden />;
  }
  if (status === "error") {
    return <TriangleAlert size={14} className="text-verdict-derisk-text" aria-hidden />;
  }
  if (status === "active") {
    return (
      <LoaderCircle
        size={14}
        className={`text-gold ${reduce ? "" : "animate-spin"}`}
        aria-hidden
      />
    );
  }
  return <Circle size={10} className="text-canvas-muted" aria-hidden />;
}

const statusLabel: Record<LogStep["status"], string> = {
  active: "in progress",
  success: "done",
  error: "error",
  info: "note",
};

/** `latest` keeps only the newest steps (the inline progress view), so a long run never makes the page grow. */
export function AgentLog({ events, latest }: { events: GatewayEvent[]; latest?: number }) {
  const reduce = useReducedMotion();
  const all = narrate(events);
  const steps = latest ? all.slice(-latest) : all;
  return (
    <ol className="flex flex-col gap-3" aria-label="Agent reasoning log">
      {steps.map((s) => (
        <motion.li key={s.id} initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
          <span className="mt-1" aria-hidden><Marker status={s.status} /></span>
          <div className="min-w-0">
            <span className="sr-only">{statusLabel[s.status]}: </span>
            <p className="text-[13px] text-canvas-text">{s.sentence}</p>
            {(s.tool || s.detail) && (
              <p className={`font-mono text-[11px] text-canvas-muted ${latest ? "h-4 truncate leading-4" : ""}`}>
                {latest && s.cached && <span className="mr-2">From cache</span>}
                {s.tool && <span>{toolLabel(s.tool)}</span>}{s.tool && s.detail && " · "}{s.detail}
                {!latest && s.cached && <span className="ml-2">From cache</span>}
                {s.stale && <span className="ml-2 text-state-stale">Stale</span>}
              </p>
            )}
          </div>
        </motion.li>
      ))}
    </ol>
  );
}
