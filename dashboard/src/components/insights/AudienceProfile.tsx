import { fit } from "@/components/playbook/format";
import { toDemographicBars } from "@/lib/qloo/adapters";
import type { ArtistProfile } from "@/lib/qloo/types";

const fmt = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(2)}`;

export function AudienceProfile({ profile }: { profile: ArtistProfile }) {
  const bars = toDemographicBars(profile.demographics);
  const max = Math.max(0.01, ...bars.map((b) => Math.abs(b.index)));
  const tags = (profile.tags ?? []).filter((t) => t && typeof t.name === "string");
  return (
    <section aria-label="Audience profile" className="flex min-w-0 flex-col gap-3 rounded-[14px] bg-paper p-3 lg:p-4">
      <h2 className="font-title text-[20px] leading-tight text-canvas-text">Audience profile</h2>
      {bars.length === 0 ? (
        <p className="text-[14px] text-canvas-muted">Qloo returned no age breakdown for this artist</p>
      ) : (
        <>
          <p className="text-[12px] text-canvas-muted">Index vs. the average listener: over-index to the right, under-index to the left.</p>
          <ul className="flex flex-col gap-2">
            {bars.map((b) => {
              const over = b.index >= 0;
              const w = (Math.abs(b.index) / max) * 50;
              return (
                <li key={b.label} data-testid="demo-bar" className="grid min-h-8 grid-cols-[3.5rem_1fr_6.5rem] items-center gap-2 text-[13px]">
                  <span className="text-canvas-text">{b.label}</span>
                  <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-3 w-full" role="img" aria-label={`${b.label}: ${over ? "over" : "under"}-index ${fmt(b.index)}`}>
                    <rect x="0" y="0" width="100" height="10" fill="var(--color-canvas)" />
                    <rect x={over ? 50 : 50 - w} y="1" width={w} height="8" fill={over ? "var(--color-bone)" : "var(--color-heat-3)"} />
                    <line x1="50" x2="50" y1="0" y2="10" stroke="var(--color-canvas-muted)" strokeWidth="0.5" />
                  </svg>
                  <span className="font-mono text-[12px] tabular text-canvas-muted">{fmt(b.index)} {over ? "over" : "under"}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-canvas-muted">Taste tags</h3>
          {tags.some((t) => typeof t.affinity === "number" && Number.isFinite(t.affinity)) && <span className="text-[12px] text-canvas-muted">Affinity (0–1)</span>}
        </div>
        {tags.length === 0 ? (
          <p className="text-[14px] text-canvas-muted">Qloo returned no taste tags for this artist</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <li key={t.name} className="inline-flex min-h-8 items-center gap-2 rounded-full bg-paper-raised px-3 text-[13px] text-canvas-text">
                <span>{t.name}</span>
                {typeof t.affinity === "number" && Number.isFinite(t.affinity) && <span aria-label={`affinity ${fit(t.affinity)}`} className="font-mono text-[12px] tabular text-canvas-muted">{fit(t.affinity)} fit</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
