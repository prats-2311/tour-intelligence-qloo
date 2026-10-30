import type { ReactNode } from "react";

const inputCls = "h-11 w-full min-w-0 rounded-[8px] border border-transparent bg-canvas px-3 text-[15px] tabular-nums text-canvas-text placeholder:text-canvas-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold";

/** A labelled input; the accessible name is "<label>, <context>" so it starts with the visible text. */
export function NumField({ label, context, value, onChange, mode = "decimal", suffix }: { label: string; context?: string; value: string; onChange: (v: string) => void; mode?: "decimal" | "numeric"; suffix?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[12px] text-canvas-muted">
      <span>{label}{suffix ? ` (${suffix})` : ""}</span>
      <input type="text" inputMode={mode} autoComplete="off" aria-label={context ? `${label}, ${context}` : label} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </label>
  );
}

/** One computed value: "—" plus the "Fill in X to see Y" hint while it cannot be worked out. */
export function Out({ label, value, hint, testId, hintId }: { label: string; value: string; hint?: string; testId: string; hintId?: string }) {
  const blank = value === "—";
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[12px] text-canvas-muted">{label}</dt>
      <dd className="text-[17px] font-semibold tabular-nums text-canvas-text" data-testid={testId}>{value}</dd>
      {blank && hint && <p data-testid={hintId} className="text-[12px] leading-snug text-canvas-muted">{hint}</p>}
    </div>
  );
}

export function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3 rounded-[14px] bg-canvas-raised p-4">
      <h2 id={id} className="font-title text-[20px] leading-tight text-canvas-text">{title}</h2>
      {children}
    </section>
  );
}
