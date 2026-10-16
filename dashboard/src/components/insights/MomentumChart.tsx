import { toTrendSeries } from "@/lib/qloo/adapters";
import type { ArtistProfile } from "@/lib/qloo/types";

const W = 320, H = 120, PX = 12, PY = 14;
const fmtV = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(2));

export function MomentumChart({ profile }: { profile: ArtistProfile }) {
  const s = toTrendSeries(profile.trends);
  return (
    <section aria-label="Momentum" className="flex min-w-0 flex-col gap-3 rounded-[14px] bg-paper p-3 lg:p-4">
      <h2 className="font-title text-[20px] leading-tight text-canvas-text">Momentum</h2>
      {s.length === 0 ? (
        <p className="text-[14px] text-canvas-muted">No trend data from Qloo for this window</p>
      ) : (() => {
        const vs = s.map((p) => p.value);
        const lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
        const x = (i: number) => (s.length === 1 ? W / 2 : PX + (i * (W - 2 * PX)) / (s.length - 1));
        const y = (v: number) => H - PY - ((v - lo) / span) * (H - 2 * PY);
        const d = s.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
        const first = s[0]!, last = s[s.length - 1]!;
        const label = `Momentum line from ${fmtV(first.value)} on ${first.date} to ${fmtV(last.value)} on ${last.date}, ${s.length} points`;
        return (
          <>
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full">
              <line x1={PX} x2={W - PX} y1={H - PY} y2={H - PY} stroke="var(--color-canvas-line)" />
              <path d={d} fill="none" stroke="var(--color-gold)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={x(0)} cy={y(first.value)} r="3" fill="var(--color-gold)" />
              <circle cx={x(s.length - 1)} cy={y(last.value)} r="3" fill="var(--color-gold)" />
            </svg>
            <dl className="flex justify-between gap-3 text-[13px]">
              <div><dt className="text-[12px] text-canvas-muted">{first.date}</dt><dd className="font-mono tabular text-canvas-text">{fmtV(first.value)}</dd></div>
              <div className="text-right"><dt className="text-[12px] text-canvas-muted">{last.date}</dt><dd className="font-mono tabular text-canvas-text">{fmtV(last.value)}</dd></div>
            </dl>
          </>
        );
      })()}
    </section>
  );
}
