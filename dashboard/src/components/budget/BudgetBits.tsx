import type { ReactNode } from "react";

/** Fields get a 1px border at 3:1 or more against the card (WCAG 1.4.11), so an empty field is visible; --color-field-border in index.css. */
export const FIELD_BORDER = "border border-field-border";
const inputCls = `h-11 w-full min-w-0 rounded-[8px] ${FIELD_BORDER} bg-canvas px-3 text-[15px] tabular-nums text-canvas-text placeholder:text-canvas-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold`;

/** A labelled input; the accessible name is "<label>, <context>" so it starts with the visible text. */
export function NumField({ label, context, value, onChange, mode = "decimal", suffix, prefix, placeholder }: { label: string; context?: string; value: string; onChange: (v: string) => void; mode?: "decimal" | "numeric"; suffix?: string; /** A currency or unit shown inside the field, before the number. */ prefix?: string; /** Defaults to an example amount ("e.g. 10,000") or a count ("e.g. 4"). */ placeholder?: string }) {
  const hint = placeholder ?? (mode === "numeric" ? "e.g. 4" : "e.g. 10,000");
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[12px] text-canvas-muted">
      <span>{label}{suffix ? ` (${suffix})` : ""}</span>
      <span className="relative flex min-w-0">
        {prefix && <span data-testid="field-prefix" aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-[12px] text-canvas-muted">{prefix}</span>}
        <input type="text" inputMode={mode} autoComplete="off" placeholder={hint} aria-label={context ? `${label}, ${context}` : label} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} ${prefix ? "pl-12" : ""}`} />
      </span>
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
