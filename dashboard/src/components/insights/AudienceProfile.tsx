import { fit } from "@/components/playbook/format";
import { toDemographicBars, type DemographicBar } from "@/lib/qloo/adapters";
import type { ArtistProfile } from "@/lib/qloo/types";

const MAX_SKEWS = 2;

/** The strongest over-indexed groups in words ("Skews female", "Skews 25–29"); numbers and under-indexes stay out of the way. */
export function skewWords(bars: DemographicBar[]): string[] {
  return bars.filter((b) => b.index > 0).sort((x, y) => y.index - x.index).slice(0, MAX_SKEWS).map((b) => `Skews ${b.group === "gender" ? (b.label === "Women" ? "female" : "male") : b.label}`);
}

export function AudienceProfile({ profile }: { profile: ArtistProfile }) {
  const bars = toDemographicBars(profile.demographics);
  const skews = skewWords(bars);
  const tags = (profile.tags ?? []).filter((t) => t && typeof t.name === "string");
  return (
    <section aria-label="Audience profile" className="flex min-w-0 flex-col gap-3 rounded-[14px] bg-paper p-3 lg:p-4">
      <h2 className="font-title text-[20px] leading-tight text-canvas-text">Audience profile</h2>
      {bars.length === 0 ? (
        <p className="text-[14px] text-canvas-muted">Qloo returned no age or gender breakdown for this artist</p>
      ) : (
        <>
          <p className="text-[12px] text-canvas-muted">Relative to Qloo's average audience (−1 to +1)</p>
          {skews.length === 0 ? (
            <p className="text-[14px] text-canvas-muted">No clear audience skew in Qloo's data.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {skews.map((w) => <li key={w} data-testid="demo-skew" className="text-[15px] text-canvas-text">{w}</li>)}
            </ul>
          )}
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
