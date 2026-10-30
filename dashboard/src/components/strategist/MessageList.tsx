import { useEffect, useRef } from "react";
import type { StrategistTurn } from "@/lib/qloo/strategistReducer";
import { ChatBubble, TypingIndicator } from "@/components/ui/ChatBits";
import { AnswerText, realUnsupportedNumbers } from "./AnswerText";
import { WorkLog } from "./WorkLog";

export function numbersNote(tokens: string[], citesFile = false): string {
  return `${tokens.length} ${tokens.length === 1 ? "number" : "numbers"} not found in ${citesFile ? "the cited page or tool results" : "tool results"}: ${tokens.join(", ")}`;
}

function Turn({ turn, onRetry, retryDisabled, logOpen, documentNames }: { documentNames?: Record<string, string>; turn: StrategistTurn; onRetry: (q: string) => void; retryDisabled: boolean; logOpen: boolean }) {
  const { answer } = turn;
  const failure = turn.status === "error" && turn.error ? turn.error.message : turn.status === "done" && !answer ? "No answer came back — try again" : undefined;
  // Recorded answers carry the gateway's flag as it was then; list markers and step ordinals it counted are dropped here.
  const unsupported = answer ? realUnsupportedNumbers(answer.text, answer.unsupportedNumbers) : [];
  return (
    <li className="flex flex-col gap-2">
      <ChatBubble role="user">{turn.question}</ChatBubble>
      {!answer && <WorkLog turn={turn} defaultOpen={logOpen} />}
      {answer && (
        <div className="flex flex-col gap-1.5">
          <ChatBubble role="assistant"><AnswerText text={answer.text} {...(documentNames ? { documentNames } : {})} /></ChatBubble>
          {unsupported.length > 0 && <p className="text-[13px] text-state-stale">{numbersNote(unsupported, /\[doc:[A-Za-z0-9_-]+ p\.\d+\]/.test(answer.text))}</p>}
          {answer.stoppedEarly && <p className="text-[13px] text-state-stale">Stopped after the tool limit</p>}
        </div>
      )}
      {answer && <WorkLog turn={turn} defaultOpen={logOpen} />}
      {turn.status === "streaming" && !answer && <TypingIndicator label="Strategist is typing" />}
      {turn.status === "interrupted" && <p className="text-[13px] text-canvas-muted">{turn.note}</p>}
      {failure && (
        <div className="flex flex-wrap items-center gap-3 rounded-[14px] bg-state-error-bg px-4 py-2 text-[14px] text-state-error">
          <p className="flex-1">{failure}</p>
          <button type="button" disabled={retryDisabled} onClick={() => onRetry(turn.question)} className="min-h-11 rounded-[10px] px-3 font-semibold underline outline-none focus-visible:ring-2 focus-visible:ring-gold/50 disabled:opacity-50">Try again</button>
        </div>
      )}
    </li>
  );
}

/** `replay`: recorded answers; only the first one starts with its work log open (live answers always do). */
export function MessageList({ turns, onRetry, busy, replay = false, documentNames }: { documentNames?: Record<string, string>; turns: StrategistTurn[]; onRetry: (q: string) => void; busy: boolean; replay?: boolean }) {
  const endRef = useRef<HTMLLIElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: "end" }); }, [turns]);
  return (
    <ol aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-3">
      {turns.map((t, i) => <Turn key={i} documentNames={documentNames} turn={t} onRetry={onRetry} retryDisabled={busy} logOpen={!replay || i === 0} />)}
      <li ref={endRef} aria-hidden />
    </ol>
  );
}
