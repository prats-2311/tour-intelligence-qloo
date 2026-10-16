import type { Score } from "@/lib/qloo/types";

const Tick = ({ at }: { at: number }) => <span className="absolute top-[-2px] h-[10px] w-px bg-canvas-muted" style={{ left: `${at}%` }} aria-hidden />;

function Bar({ label, score, color, ticks, testId }: { label: string; score: Score; color: string; ticks: number[]; testId: string }) {
  const v = score.value === null ? null : Math.round(score.value);
  return (
    <div className="grid grid-cols-[84px_1fr_32px] items-center gap-2">
      <span className="whitespace-nowrap text-[13px] text-canvas-muted">{label}</span>
      <span
        role="meter"
        aria-label={v === null ? `${label}: not enough data` : `${label} ${v} of 100`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v ?? undefined}
        aria-valuetext={v === null ? "Not enough data" : `${v} of 100`}
        className="relative h-[6px] rounded-[3px] bg-[rgba(240,238,230,0.08)]"
      >
        {v !== null && <span data-testid={testId} className="absolute inset-y-0 left-0 rounded-[3px]" style={{ width: `${v}%`, background: color }} />}
        {ticks.map((t) => <Tick key={t} at={t} />)}
      </span>
      <span className="text-right font-mono text-[13px] font-bold text-canvas-text tabular">{v === null ? "—" : v}</span>
    </div>
  );
}

export function DualBars({ fanHeat, activation }: { fanHeat: Score; activation: Score }) {
  const insufficient = fanHeat.value === null || activation.value === null;
  return (
    <div className="flex flex-col gap-2">
      <Bar label="Fan heat" score={fanHeat} color="var(--color-bone)" ticks={[45, 70]} testId="bar-fanheat" />
      <Bar label="Activation" score={activation} color="var(--color-gold)" ticks={[45, 60, 75]} testId="bar-activation" />
      {insufficient && <span className="text-[12px] text-canvas-muted">Not enough data</span>}
    </div>
  );
}
