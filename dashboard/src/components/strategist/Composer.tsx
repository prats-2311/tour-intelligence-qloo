import { ChevronDown, ChevronUp, Send, Square } from "lucide-react";
import { useEffect, useState } from "react";
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
  // Suggestions start open on an empty chat and fold away once an answer exists, so the answer keeps the room.
  const [sugOpen, setSugOpen] = useState(empty);
  const [docsOpen, setDocsOpen] = useState(false);
  useEffect(() => { if (!empty) setSugOpen(false); }, [empty]);
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
  const focus = context.cities?.find((c) => c.id === context.focusCityId);
  const draft = live && context.focusCityId ? (
    <button type="button" disabled={busy} onClick={() => onAsk(cityPlanPrompt(focus?.name ?? "this city"))} className="mb-2 min-h-11 rounded-[10px] border border-canvas-line px-3 text-[14px] font-semibold text-canvas-text outline-none hover:bg-canvas-raised focus-visible:ring-2 focus-visible:ring-gold/50 disabled:opacity-50">{CITY_PLAN_LABEL}</button>
  ) : null;
  const pick = (q: string) => { if (!busy) onAsk(q); };
  // Showcase: the recorded questions replay for free; a typed one runs live against the example's own context.
  const liveQs = replay ? liveAskSuggestions(SHOWCASE) : [];
  const chips = replay ? showcaseStrategist().map((r) => r.question) : empty ? (sample && !showcase ? [...SAMPLE_QUESTIONS] : liveSuggestions(context)) : [];
  const hasSuggestions = chips.length > 0 || liveQs.length > 0 || draft !== null || replay;
  const suggestions = (
    <>
      {chips.length > 0 && <SuggestionChips suggestions={chips} onPick={pick} />}
      {replay && <p className="mb-1.5 text-[13px] font-medium text-canvas-text">{LIVE_ASK_LABEL}</p>}
      {draft}
      {liveQs.length > 0 && (
        <div className="mt-1">
          <p className="mb-1.5 text-[13px] font-medium text-canvas-text">Ask live</p>
          <SuggestionChips suggestions={liveQs} onPick={pick} />
        </div>
      )}
    </>
  );
  const docCount = docs?.docs.length ?? 0;
  return (
    <div className="shrink-0 px-4 pb-4 pt-2">
      <div data-tour="chat-tools">
        <div className="flex flex-wrap gap-x-2">
          {hasSuggestions && <DisclosureToggle id="strategist-suggestions" label="Suggestions" open={sugOpen} onToggle={() => setSugOpen((o) => !o)} />}
          {docs && live && <DisclosureToggle id="strategist-documents" label={docCount > 0 ? `Your documents (${docCount})` : "Your documents"} open={docsOpen} onToggle={() => setDocsOpen((o) => !o)} />}
        </div>
        {hasSuggestions && <div id="strategist-suggestions" hidden={!sugOpen} className="max-h-[26vh] overflow-y-auto pb-1">{suggestions}</div>}
        {docs && live && <div id="strategist-documents" hidden={!docsOpen} className="max-h-[26vh] overflow-y-auto"><DocumentsBar docs={docs} /></div>}
      </div>
      {form}
    </div>
  );
}

function DisclosureToggle({ id, label, open, onToggle }: { id: string; label: string; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle} className="flex min-h-11 items-center gap-1 rounded-lg px-1 text-[14px] font-semibold text-canvas-text outline-none focus-visible:ring-2 focus-visible:ring-gold/50">
      {label}
      {open ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
    </button>
  );
}
