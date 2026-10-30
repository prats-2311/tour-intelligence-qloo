import { X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/** How long a toast stays up, and how many can stack. */
export const TOAST_MS = 5000;
export const TOAST_MAX = 3;

export type ToastTone = "success" | "info" | "error";
export interface ToastInput {
  /** The words, passed in by the caller (this component has no copy of its own). */
  message: string;
  title?: string;
  /** Errors are announced assertively (role="alert"); everything else politely (role="status"). */
  tone?: ToastTone;
  /** Text the person may need to copy by hand (a link when the clipboard refused); shown in a read-only field. */
  selectable?: string;
  /** Overrides the 5 s default, in ms. */
  duration?: number;
}
interface ToastItemData extends ToastInput { id: number }
interface ToastApi { toast: (t: ToastInput) => number; dismiss: (id: number) => void }

const NOOP: ToastApi = { toast: () => -1, dismiss: () => undefined };
const ToastContext = createContext<ToastApi>(NOOP);

/** Shows a toast from anywhere under `ToastProvider`. Outside one it does nothing, so isolated component tests need no wrapper. */
export function useToast(): ToastApi { return useContext(ToastContext); }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItemData[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setItems((cur) => cur.filter((t) => t.id !== id)), []);
  const toast = useCallback((t: ToastInput) => {
    const id = next.current++;
    setItems((cur) => [...cur, { ...t, id }].slice(-TOAST_MAX));
    return id;
  }, []);
  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Out of flow (fixed), centred, above the mobile bottom stepper and the strategist FAB; only the toasts take clicks. */}
      <div data-toast-viewport className="pointer-events-none fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-[70] flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 flex-col items-stretch gap-2 lg:bottom-6">
        {items.map((t) => <ToastItem key={t.id} t={t} onDismiss={dismiss} />)}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ t, onDismiss }: { t: ToastItemData; onDismiss: (id: number) => void }) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const paused = hover || focus;
  const left = useRef(t.duration ?? TOAST_MS);
  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = setTimeout(() => onDismiss(t.id), left.current);
    return () => { clearTimeout(timer); left.current = Math.max(0, left.current - (Date.now() - started)); };
  }, [paused, t.id, onDismiss]);
  const error = t.tone === "error";
  return (
    <div
      role={error ? "alert" : "status"}
      aria-live={error ? "assertive" : "polite"}
      aria-atomic="true"
      data-toast={t.tone ?? "info"}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      className={`toast-item pointer-events-auto flex items-start gap-2 rounded-[10px] border bg-paper py-1 pl-3 pr-1 text-[13px] text-bone shadow-lg motion-safe:animate-[toast-in_160ms_ease-out] ${error ? "border-state-error" : "border-canvas-line"}`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-2.5">
        {t.title && <p className="font-semibold">{t.title}</p>}
        <p className="break-words leading-[1.4]">{t.message}</p>
        {t.selectable && <input readOnly value={t.selectable} onFocus={(e) => e.currentTarget.select()} aria-label="Text to copy" className="w-full rounded-[6px] border border-canvas-line bg-canvas px-2 py-1 text-[12px] text-canvas-text" />}
      </div>
      <button type="button" onClick={() => onDismiss(t.id)} aria-label="Dismiss notification" className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-[8px] text-canvas-muted hover:text-bone focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
