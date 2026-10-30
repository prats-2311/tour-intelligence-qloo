import { Send, Square } from "lucide-react";
import { useState } from "react";
import type { useDocuments } from "@/lib/docs/useDocuments";
import { SAMPLE_QUESTIONS } from "@/lib/qloo/fixtures/strategistSample";
import { liveAskSuggestions } from "@/lib/qloo/liveAskSuggestions";
import { SHOWCASE, showcaseStrategist } from "@/lib/qloo/showcase";
import { liveSuggestions } from "@/lib/qloo/strategistSuggestions";
import type { StrategistContext } from "@/lib/qloo/types";
import { CITY_PLAN_LABEL, cityPlanPrompt } from "@/lib/qloo/cityPlanPrompt";
import { DocumentsBar } from "./DocumentsBar";
import { CHAT_INPUT_CLASS, CHAT_SEND_CLASS, MicButton, SuggestionChips } from "@/components/ui/ChatBits";

export const LIVE_ASK_LABEL = "Ask your own question — runs live, about 30 seconds";

export function Composer({ docs, replay = false, busy, empty, sample, showcase = false, context, onAsk, onStop }: { docs?: ReturnType<typeof useDocuments>; replay?: boolean; busy: boolean; empty: boolean; sample: boolean; showcase?: boolean; context: StrategistContext; onAsk: (q: string) => void; onStop: () => void }) {
  const [text, setText] = useState("");
  function send() {
    const q = text.trim();
    if (!q || busy) return;
    onAsk(q);
    setText("");
  }
  const form = (
    <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
      <input type="text" aria-label="Ask a question about this tour" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about a city, a sponsor or a co-bill" className={`${CHAT_INPUT_CLASS} min-h-11`} />
      {!replay && <MicButton onTranscript={(t) => setText((cur) => (cur ? `${cur} ${t}` : t))} />}
      {busy && (
        <button type="button" aria-label="Stop" onClick={onStop} className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-canvas-raised text-canvas-text outline-none focus-visible:ring-2 focus-visible:ring-gold/50">
          <Square size={16} aria-hidden />
        </button>
      )}
      <button type="submit" aria-label="Send" disabled={busy || !text.trim()} className={`${CHAT_SEND_CLASS} size-11`}>
        <Send size={16} aria-hidden />
      </button>
    </form>
  );
  // Documents only make sense where answers are live; the scripted sample board ignores them.
  const live = !sample || showcase;
  const bar = docs && live ? <DocumentsBar docs={docs} /> : null;
  const focus = context.cities?.find((c) => c.id === context.focusCityId);
  const draft = live && context.focusCityId ? (
    <button type="button" disabled={busy} onClick={() => onAsk(cityPlanPrompt(focus?.name ?? "this city"))} className="mb-2 min-h-11 rounded-[10px] border border-canvas-line px-3 text-[14px] font-semibold text-canvas-text outline-none hover:bg-canvas-raised focus-visible:ring-2 focus-visible:ring-gold/50 disabled:opacity-50">{CITY_PLAN_LABEL}</button>
  ) : null;
  if (replay) {
    const live = liveAskSuggestions(SHOWCASE);
    // Showcase: the recorded questions replay for free; a typed one runs live against the example's own context.
    return (
      <div className="px-4 pb-4 pt-2">
        <SuggestionChips suggestions={showcaseStrategist().map((r) => r.question)} onPick={(q) => { if (!busy) onAsk(q); }} />
        <p className="mb-1.5 mt-3 text-[13px] font-medium text-canvas-text">{LIVE_ASK_LABEL}</p>
        <div data-tour="chat-tools">{draft}{bar}</div>
        {form}
        {live.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-[13px] font-medium text-canvas-text">Ask live</p>
            <SuggestionChips suggestions={live} onPick={(q) => { if (!busy) onAsk(q); }} />
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="px-4 pb-4 pt-2">
      {empty && <SuggestionChips suggestions={sample && !showcase ? [...SAMPLE_QUESTIONS] : liveSuggestions(context)} onPick={(q) => { if (!busy) onAsk(q); }} />}
      <div data-tour="chat-tools">{draft}{bar}</div>
      {form}
    </div>
  );
}
