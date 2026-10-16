import { X } from "lucide-react";
import { SampleBanner } from "@/components/qloo/SampleBanner";
import { useStrategist } from "@/lib/qloo/useStrategist";
import type { StrategistContext } from "@/lib/qloo/types";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";

export function StrategistPanel({ context, sample, showcase = false, title, onClose, hideHeading }: { context: StrategistContext; sample: boolean; showcase?: boolean; title: string; onClose?: () => void; hideHeading?: boolean }) {
  const { state, ask, stop, busy } = useStrategist(context, { sample, showcase });
  return (
    <section aria-label="Strategist" className="flex h-full min-h-0 flex-col bg-canvas text-canvas-text">
      <header className="flex items-start justify-between gap-3 px-4 pt-4">
        <div>
          {!hideHeading && <h2 className="font-title text-[20px] leading-tight">Ask the strategist</h2>}
          <p className={hideHeading ? "text-[13px] text-canvas-muted" : "mt-0.5 text-[13px] text-canvas-muted"}>{title}</p>
        </div>
        {onClose && (
          <button type="button" aria-label="Close" onClick={onClose} className="flex size-11 shrink-0 items-center justify-center rounded-lg text-canvas-muted outline-none hover:text-canvas-text focus-visible:ring-2 focus-visible:ring-gold/50">
            <X size={18} aria-hidden />
          </button>
        )}
      </header>
      {sample && <div className="px-4 pt-2"><SampleBanner compact source={showcase ? "showcase" : "sample"} /></div>}
      <MessageList turns={state.turns} onRetry={ask} busy={busy} />
      <Composer busy={busy} empty={state.turns.length === 0} sample={sample} showcase={showcase} context={context} onAsk={ask} onStop={stop} />
    </section>
  );
}
