import { dataQuality } from "@/lib/qloo/geometry";
import type { GatewayEvent } from "@/lib/qloo/types";

/** Tiles keep label and value in one element so assistive tech reads them together. */
function Tile({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: "warn" | "error" }) {
  const valueCls = tone === "error" && value > 0 ? "text-state-error" : tone === "warn" && value > 0 ? "text-state-stale" : "text-canvas-text";
  return (
    <div className="min-w-[132px] shrink-0 rounded-[10px] bg-paper px-3.5 py-3 lg:min-w-0">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-canvas-muted">{label}</p>
      <p className={`mt-1.5 font-mono text-[26px] font-medium leading-none tabular ${valueCls}`}>{value}</p>
      {hint && <p className="mt-1.5 text-[12px] leading-tight text-canvas-muted">{hint}</p>}
    </div>
  );
}

export function DataQualityTiles({ log }: { log: GatewayEvent[] }) {
  const q = dataQuality(log);
  const cacheHint = q.calls > 0 ? `${Math.round((q.cached / q.calls) * 100)}% of calls` : undefined;
  return (
    <section aria-label="Data quality" tabIndex={0} className="flex gap-2 overflow-x-auto pb-1 focus-visible:outline-2 focus-visible:outline-gold lg:grid lg:grid-cols-5 lg:overflow-visible lg:pb-0">
      <Tile label="Qloo calls" value={q.calls} />
      <Tile label="From cache" value={q.cached} hint={cacheHint} />
      <Tile label="Partial" value={q.partial} tone="warn" />
      <Tile label="Empty" value={q.empty} tone="warn" />
      <Tile label="Errors" value={q.errors} tone="error" />
    </section>
  );
}
