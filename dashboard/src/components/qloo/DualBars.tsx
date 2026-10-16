import type { Score } from "@/lib/qloo/types";

const Tick = ({ at }: { at: number }) => <span className="absolute top-[-2px] h-[10px] w-px bg-canvas-muted" style={{ left: `${at}%` }} aria-hidden />;

function Bar({ label, score, color, ticks, testId }: { label: string; score: Score; color: string; ticks: number[]; testId: string }) {
  const v = score.value === null || !Number.isFinite(score.value) ? null : Math.min(100, Math.max(0, Math.round(score.value)));
  const a11y =
    v === null
      ? { role: "img" as const, "aria-label": `${label}: not enough data` }
      : { role: "meter" as const, "aria-label": `${label} ${v} of 100`, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": v, "aria-valuetext": `${v} of 100` };
  return (
    <div className="grid grid-cols-[84px_1fr_auto] items-center gap-2">
      <span className="whitespace-nowrap text-[13px] text-canvas-muted">{label}</span>
      <span {...a11y} className="relative h-[6px] rounded-[3px] bg-[rgba(240,238,230,0.08)]">
        {v !== null && <span data-testid={testId} className="absolute inset-y-0 left-0 rounded-[3px]" style={{ width: `${v}%`, background: color }} />}
        {ticks.map((t) => <Tick key={t} at={t} />)}
      </span>
      {v === null ? (
        <span className="text-right text-[12px] text-canvas-muted">Not enough data</span>
      ) : (
        <span className="min-w-8 text-right font-mono text-[13px] font-bold text-canvas-text tabular">{v}</span>
      )}
    </div>
  );
}

export function DualBars({ fanHeat, activation }: { fanHeat: Score; activation: Score }) {
  return (
    <div className="flex flex-col gap-2">
      <Bar label="Fan heat" score={fanHeat} color="var(--color-bone)" ticks={[45, 70]} testId="bar-fanheat" />
      <Bar label="Activation" score={activation} color="var(--color-gold)" ticks={[45, 60, 75]} testId="bar-activation" />
    </div>
  );
}
