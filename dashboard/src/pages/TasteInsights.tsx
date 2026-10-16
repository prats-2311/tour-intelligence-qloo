import { Download } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SampleBanner } from "@/components/qloo/SampleBanner";
import { ActivationBoxscore } from "@/components/insights/ActivationBoxscore";
import { DataQualityTiles } from "@/components/insights/DataQualityTiles";
import { FiltersPanel } from "@/components/insights/FiltersPanel";
import { WinnabilityMatrix } from "@/components/insights/WinnabilityMatrix";
import { dataQuality } from "@/lib/qloo/geometry";
import { applyFilters, boxscoreCsv, csvFilename, defaultFilters, type InsightsFilters } from "@/lib/qloo/insightsFilters";
import { useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { useIsDesktop } from "@/lib/useMediaQuery";

const TourMap = lazy(() => import("@/components/qloo/TourMap"));

const INTEGRITY = "Affinity signal from aggregate taste data — not a ticket forecast or a claim about individuals.";
const secondaryBtn = "inline-flex h-12 items-center justify-center gap-2 rounded-[10px] bg-paper-raised px-5 text-[15px] font-semibold text-canvas-text hover:bg-[#3a3932] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold lg:h-10";

export default function TasteInsights() {
  const { state } = useTourBoard();
  const isDesktop = useIsDesktop();
  const { cities, log, status, source, brief, artist } = state;
  const defaults = useMemo(() => defaultFilters(cities), [cities]);
  const streaming = status === "streaming";
  const runKey = `${status}|${source}|${brief?.artist ?? ""}|${brief?.regions.join(",") ?? ""}`;
  const [tagged, setTagged] = useState<{ key: string; f: InsightsFilters } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Filters re-initialise per run: once the run settles they start from that run's countries.
  useEffect(() => {
    if (streaming) return;
    setTagged({ key: runKey, f: defaultFilters(cities) });
    setSelectedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cities are read at settle time only
  }, [runKey, streaming]);

  const filters = streaming || !tagged || tagged.key !== runKey ? defaults : tagged.f;
  const visible = useMemo(() => applyFilters(cities, filters), [cities, filters]);
  const selected = visible.some((c) => c.id === selectedId) ? selectedId : null;
  const calls = dataQuality(log).calls;
  const artistName = artist?.name ?? brief?.artist;

  if (cities.length === 0 && !streaming) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 py-10 text-center">
        <h1 className="font-title text-[32px] leading-tight text-canvas-text">Taste Insights</h1>
        <h2 className="text-[18px] font-semibold text-canvas-text">Run a Tour Board to see insights</h2>
        <p className="text-[14px] text-canvas-muted">Winnability, activation and data quality are built from the markets a Tour Board run scores.</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link to="/tours/board?sample=1" className={secondaryBtn}>Try the showcase tour</Link>
          <Link to="/tours/board" className={secondaryBtn}>Plan your own</Link>
        </div>
      </div>
    );
  }

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([boxscoreCsv(visible)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFilename(artistName);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const panel = <FiltersPanel cities={cities} filters={filters} defaults={defaults} onChange={(f) => setTagged({ key: runKey, f })} />;
  const scored = `${cities.length} ${cities.length === 1 ? "market" : "markets"} scored`;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {source === "sample" && <SampleBanner />}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-title text-[32px] leading-[1.1] text-canvas-text lg:text-[40px]">Taste Insights</h1>
          <p className="mt-1 text-[13px] text-canvas-muted">
            {artistName && <span className="text-canvas-text">{artistName}</span>}{artistName && " · "}{scored}
            {brief?.regions.length ? ` · ${brief.regions.join(", ")}` : ""}{streaming && " · still scoring"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isDesktop && panel}
          <button type="button" onClick={exportCsv} disabled={visible.length === 0} className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-paper-raised px-4 text-[14px] font-semibold text-canvas-text hover:bg-[#3a3932] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-50 lg:h-10">
            <Download size={16} aria-hidden />Export CSV
          </button>
        </div>
      </header>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-12">
        {isDesktop && <div className="lg:col-span-3">{panel}</div>}
        <div className={`flex min-w-0 flex-col gap-4 ${isDesktop ? "lg:col-span-9" : "lg:col-span-12"}`}>
          <DataQualityTiles log={log} />
          <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-5">
            <div className="min-w-0 xl:col-span-3"><WinnabilityMatrix cities={visible} selectedId={selected} onSelect={setSelectedId} calls={calls} /></div>
            <section aria-label="Market map" className="flex min-w-0 flex-col gap-2 rounded-[14px] bg-paper p-3 lg:p-4 xl:col-span-2">
              <h2 className="font-title text-[20px] leading-tight text-canvas-text">Market map</h2>
              <p className="text-[12px] text-canvas-muted">{visible.length} {visible.length === 1 ? "market" : "markets"} in focus</p>
              <div className="relative h-[260px] overflow-hidden rounded-[10px] bg-canvas xl:h-full xl:min-h-[260px]">
                <Suspense fallback={<div className="size-full bg-canvas-raised" />}>
                  <TourMap cities={visible} selectedId={selected} onSelect={setSelectedId} zones={visible.find((c) => c.id === selected)?.zones} />
                </Suspense>
              </div>
            </section>
          </div>
          <ActivationBoxscore cities={visible} selectedId={selected} onSelect={setSelectedId} />
          <p className="px-1 pb-2 text-[12px] text-canvas-muted">{INTEGRITY}</p>
        </div>
      </div>
    </div>
  );
}
