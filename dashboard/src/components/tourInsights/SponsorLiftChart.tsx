import { SPONSOR_LIFT_CAPTION, sponsorLiftRows } from "@/lib/qloo/tourInsights";
import type { PlaybookCard, ScoredCity } from "@/lib/qloo/types";
import { ChartFrame } from "./ChartFrame";

/** Top sponsors by fan rank for one city, with the city's own rank for each (or "not in the city's top 20"). Rank-based, so no amounts. */
export function SponsorLiftChart({ city, card, status }: { city: ScoredCity; card: PlaybookCard | null; status: "ready" | "loading" | "none" | "unloaded" }) {
  const rows = status === "ready" ? sponsorLiftRows(card ?? undefined) : [];
  const axis = Math.max(20, ...rows.map((r) => r.fanRank), ...rows.map((r) => r.cityRank ?? 0));
  const at = (rank: number): string => `${(Math.min(rank, axis) / axis) * 100}%`;
  const message =
    status === "loading" ? <p role="status" className="text-[14px] text-canvas-muted">Loading the playbook for {city.name}…</p>
    : status === "unloaded" ? <p className="text-[14px] text-canvas-muted">Open the {city.name} playbook first; this page only shows sponsor ranks that are already loaded and never starts a lookup.</p>
    : status === "none" ? <p className="text-[14px] text-canvas-muted">No recorded playbook for {city.name}, so there are no sponsor ranks to chart.</p>
    : rows.length === 0 ? <p className="text-[14px] text-canvas-muted">No sponsor ranks in this playbook.</p> : undefined;
  return (
    <ChartFrame
      title={`Sponsor lift · ${city.name}`}
      caption={SPONSOR_LIFT_CAPTION}
      table={{ head: ["Sponsor", "Fan rank", "City rank"], rows: rows.map((r) => [r.name, r.fanRank, r.cityRank === null ? "Not in the city's top 20" : r.cityRank]) }}
      empty={message}
    >
      <div className="flex flex-col gap-2">
        <span className="text-[12px] text-canvas-muted">Rank, 1 is highest (a shorter bar is a higher fan rank). Diamond: the city's own rank.</span>
        <div role="img" aria-label={`Sponsors fans rank highest in ${city.name}: ${rows.map((r) => `${r.name}, fans #${r.fanRank}, ${r.cityRank === null ? "not in the city's top 20" : `city #${r.cityRank}`}`).join("; ")}`} className="flex flex-col gap-2">
          {rows.map((r) => (
            <div key={r.name} data-testid="lift-row" aria-hidden className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-[14px]">
                <span className="min-w-0 truncate text-canvas-text">{r.name}</span>
                <span className="shrink-0 font-mono text-[12px] text-canvas-muted tabular">Fans #{r.fanRank}</span>
              </div>
              <div className="relative h-3 rounded-full bg-canvas">
                <div className="h-full rounded-full bg-bone" style={{ width: at(r.fanRank) }} />
                {r.cityRank !== null && (
                  <span data-testid="lift-city-marker" data-rank={r.cityRank} className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-canvas bg-gold" style={{ left: at(r.cityRank) }} />
                )}
              </div>
              <span className="text-[12px] text-canvas-muted">{r.cityText}</span>
            </div>
          ))}
        </div>
      </div>
    </ChartFrame>
  );
}
