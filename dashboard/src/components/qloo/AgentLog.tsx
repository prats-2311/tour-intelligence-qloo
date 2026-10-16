import { motion, useReducedMotion } from "framer-motion";
import { Check, Circle, Radio, TriangleAlert } from "lucide-react";
import { countQlooCalls, narrate, type LogStep } from "@/lib/qloo/narrate";
import type { GatewayEvent } from "@/lib/qloo/types";

export function AgentLogChip({ events, onOpen }: { events: GatewayEvent[]; onOpen: () => void }) {
  const { total } = countQlooCalls(events);
  return (
    <button type="button" onClick={onOpen} className="inline-flex h-11 items-center gap-2 rounded-md bg-canvas-raised px-3 text-[13px] text-canvas-text">
      <Radio size={16} aria-hidden />
      <span>Agent · {total} Qloo calls</span>
    </button>
  );
}

function Marker({ status }: { status: LogStep["status"] }) {
  if (status === "success") return <Check size={14} className="text-verdict-play-text" aria-label="done" />;
  if (status === "error") return <TriangleAlert size={14} className="text-verdict-derisk-text" aria-label="error" />;
  if (status === "active") return <Circle size={14} className="text-gold" aria-label="in progress" />;
  return <Circle size={10} className="text-canvas-muted" aria-hidden />;
}

export function AgentLog({ events }: { events: GatewayEvent[] }) {
  const reduce = useReducedMotion();
  const steps = narrate(events);
  return (
    <ol className="flex flex-col gap-3" aria-label="Agent reasoning log">
      {steps.map((s) => (
        <motion.li key={s.id} initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
          <span className="mt-1"><Marker status={s.status} /></span>
          <div className="min-w-0">
            <p className="text-[13px] text-canvas-text">{s.sentence}</p>
            {(s.tool || s.detail) && (
              <p className="font-mono text-[11px] text-canvas-muted">
                {s.tool && <span>{s.tool}</span>}{s.tool && s.detail && " · "}{s.detail}
                {s.cached && <span className="ml-2">From cache</span>}
                {s.stale && <span className="ml-2 text-state-stale">Stale</span>}
              </p>
            )}
          </div>
        </motion.li>
      ))}
    </ol>
  );
}
