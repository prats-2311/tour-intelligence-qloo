import { Send, Square } from "lucide-react";
import { useState } from "react";
import { SAMPLE_QUESTIONS } from "@/lib/qloo/fixtures/strategistSample";
import { SHOWCASE_ASK_NOTE } from "@/lib/qloo/client";
import { showcaseStrategist } from "@/lib/qloo/showcase";
import { liveSuggestions } from "@/lib/qloo/strategistSuggestions";
import type { StrategistContext } from "@/lib/qloo/types";
import { CHAT_INPUT_CLASS, CHAT_SEND_CLASS, MicButton, SuggestionChips } from "@/components/ui/ChatBits";

export function Composer({ replay = false, busy, empty, sample, showcase = false, context, onAsk, onStop }: { replay?: boolean; busy: boolean; empty: boolean; sample: boolean; showcase?: boolean; context: StrategistContext; onAsk: (q: string) => void; onStop: () => void }) {
  const [text, setText] = useState("");
  function send() {
    const q = text.trim();
    if (!q || busy) return;
    onAsk(q);
    setText("");
  }
  if (replay) {
    // Showcase: the recorded questions are the whole input. No text field, so nothing typed can reach a gateway.
    return (
      <div className="px-4 pb-4 pt-2">
        <SuggestionChips suggestions={showcaseStrategist().map((r) => r.question)} onPick={(q) => { if (!busy) onAsk(q); }} />
        <p className="text-[13px] text-canvas-muted">{SHOWCASE_ASK_NOTE}</p>
      </div>
    );
  }
  return (
    <div className="px-4 pb-4 pt-2">
      {empty && <SuggestionChips suggestions={sample && !showcase ? [...SAMPLE_QUESTIONS] : liveSuggestions(context)} onPick={(q) => { if (!busy) onAsk(q); }} />}
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input type="text" aria-label="Ask a question about this tour" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about a city, a sponsor or a co-bill" className={`${CHAT_INPUT_CLASS} min-h-11`} />
        <MicButton onTranscript={(t) => setText((cur) => (cur ? `${cur} ${t}` : t))} />
        {busy && (
          <button type="button" aria-label="Stop" onClick={onStop} className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-canvas-raised text-canvas-text outline-none focus-visible:ring-2 focus-visible:ring-gold/50">
            <Square size={16} aria-hidden />
          </button>
        )}
        <button type="submit" aria-label="Send" disabled={busy || !text.trim()} className={`${CHAT_SEND_CLASS} size-11`}>
          <Send size={16} aria-hidden />
        </button>
      </form>
    </div>
  );
}
