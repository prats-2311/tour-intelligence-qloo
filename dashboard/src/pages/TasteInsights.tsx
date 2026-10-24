import { CircleAlert, Download, History } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { interruptedText, Notice, regionNoticeText } from "@/components/qloo/Notice";
import { SampleBanner } from "@/components/qloo/SampleBanner";
import { ActivationBoxscore } from "@/components/insights/ActivationBoxscore";
import { ArtistCompare } from "@/components/insights/ArtistCompare";
import { AudienceProfile } from "@/components/insights/AudienceProfile";
import { CrossDomainTaste } from "@/components/insights/CrossDomainTaste";
import { MomentumChart } from "@/components/insights/MomentumChart";
import { PromoZones } from "@/components/insights/PromoZones";
import { DataQualityTiles } from "@/components/insights/DataQualityTiles";
import { FiltersPanel } from "@/components/insights/FiltersPanel";
import { WinnabilityMatrix } from "@/components/insights/WinnabilityMatrix";
import { dataQuality } from "@/lib/qloo/geometry";
import { applyFilters, boxscoreCsv, csvFilename, defaultFilters, type InsightsFilters } from "@/lib/qloo/insightsFilters";
import { INTEGRITY_LINE } from "@/lib/qloo/labels";
import { TasteInsightsSkeleton } from "@/components/ui/Skeletons";
import { showcaseAvailable, showcaseBrief } from "@/lib/qloo/showcase";
import { sortCities } from "@/lib/qloo/ranking";
import { useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { useIsDesktop } from "@/lib/useMediaQuery";

const TourMap = lazy(() => import("@/components/qloo/TourMap"));

const secondaryBtn = "inline-flex h-12 items-center justify-center gap-2 rounded-[10px] bg-paper-raised px-5 text-[15px] font-semibold text-canvas-text hover:bg-[#3a3932] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold lg:h-10";

export default function TasteInsights() {
  const { state, run } = useTourBoard();
  const isDesktop = useIsDesktop();
  const { cities, log, profile, status, source, brief, artist, regionsEmpty, regionsUnavailable, error, interruptReason } = state;
  const streaming = status === "streaming";
  // Filters belong to a run's brief: changing them mid-stream sticks, a new brief resets them.
  const briefKey = `${source}|${brief?.artist ?? ""}|${brief?.regions.join(",") ?? ""}`;
  const [tagged, setTagged] = useState<{ key: string; f: InsightsFilters }>({ key: briefKey, f: defaultFilters() });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filters = tagged.key === briefKey ? tagged.f : defaultFilters();
  const setFilters = (f: InsightsFilters) => setTagged({ key: briefKey, f });
  useEffect(() => { setSelectedId(null); }, [briefKey]);

  // Opened directly with no run, the page shows the example run's taste data instead of an empty state.
  const autoStarted = useRef(false);
  const openExample = status === "idle" && cities.length === 0 && showcaseAvailable();
  useEffect(() => {
    if (!openExample || autoStarted.current) return;
    autoStarted.current = true;
    run(showcaseBrief(), { sample: true, sampleSet: "showcase" });
  }, [openExample, run]);

  const visible = useMemo(() => applyFilters(cities, filters), [cities, filters]);
  const selected = visible.some((c) => c.id === selectedId) ? selectedId : null;
  const calls = dataQuality(log).calls;
  const artistName = artist?.name ?? brief?.artist;
  // Panels follow the selected market; default to the most winnable one in focus.
  const focusCity = useMemo(
    () => visible.find((c) => c.id === selected) ?? sortCities(visible, "winnability")[0],
    [visible, selected],
  );

  if (openExample) return <TasteInsightsSkeleton />;

  if (cities.length === 0 && (status === "needs_input" || status === "interrupted")) {
    const message = status === "needs_input"
      ? "Choose the artist on the Tour Board"
      : interruptReason === "user" ? "Stopped before any market was scored" : "Connection lost before any market was scored";
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 py-10">
        <h1 className="font-title text-[32px] leading-tight text-canvas-text">Taste</h1>
        <h2 className="text-[18px] font-semibold text-canvas-text">{message}</h2>
        {status === "needs_input" && <p className="text-[14px] text-canvas-muted">Qloo found more than one match for {brief?.artist ?? "this artist"}. Pick one to score markets.</p>}
        <Link to="/tours/board" className={`${secondaryBtn} w-fit`}>Back to the Tour Board</Link>
      </div>
    );
  }

  if (cities.length === 0 && !streaming && status !== "idle") {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 py-10">
        <h1 className="font-title text-[32px] leading-tight text-canvas-text">Taste</h1>
        <h2 className="text-[18px] font-semibold text-canvas-text">No markets were scored</h2>
        <ul className="flex flex-col gap-1 text-[14px] text-canvas-text">
          {regionsEmpty.map((r) => <li key={`e-${r}`}>No Qloo signal in {r}</li>)}
          {regionsUnavailable.map((r) => <li key={`u-${r.region}`}>{r.region} unavailable: {r.message}</li>)}
          {error && <li>{error.message}</li>}
          {regionsEmpty.length === 0 && regionsUnavailable.length === 0 && !error && <li>Qloo returned no markets for this brief.</li>}
        </ul>
        <Link to="/tours/board" className={`${secondaryBtn} w-fit`}>Back to the Tour Board</Link>
      </div>
    );
  }

  if (cities.length === 0 && !streaming) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 py-10 text-center">
        <h1 className="font-title text-[32px] leading-tight text-canvas-text">Taste</h1>
        <h2 className="text-[18px] font-semibold text-canvas-text">Score a Tour Board to see taste by market</h2>
        <p className="text-[14px] text-canvas-muted">Winnability, activation and data quality are built from the markets a Tour Board run scores.</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link to="/tours/board?showcase=1" className={secondaryBtn}>See the example tour</Link>
          <Link to="/tours/board?new=1" className={secondaryBtn}>Try your own artist</Link>
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

  const panel = <FiltersPanel cities={cities} filters={filters} onChange={setFilters} />;
  const scored = `${cities.length} ${cities.length === 1 ? "market" : "markets"} scored`;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {source !== "live" && <SampleBanner source={source} />}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-title text-[32px] leading-[1.1] text-canvas-text lg:text-[40px]">Taste</h1>
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
      {status === "interrupted" && (
        <Notice><History size={14} className="text-state-stale" aria-hidden /><span className="min-w-0">{interruptedText(interruptReason)}</span></Notice>
      )}
      {status === "error" && error && (
        <Notice>
          <CircleAlert size={14} className="text-state-error" aria-hidden /><span className="min-w-0">{error.message}</span>
          {error.code === "BUDGET" && <Link to="/tours/board?showcase=1" className="inline-flex min-h-11 items-center rounded-[8px] bg-paper-raised px-3 text-[13px] font-semibold text-canvas-text hover:bg-[#3a3932]">See the example tour</Link>}
        </Notice>
      )}
      {(regionsEmpty.length > 0 || regionsUnavailable.length > 0) && (
        <Notice><span className="min-w-0">{regionNoticeText(regionsEmpty, regionsUnavailable)}</span></Notice>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-12">
        {isDesktop && <div className="lg:col-span-3">{panel}</div>}
        <div className={`flex min-w-0 flex-col gap-4 ${isDesktop ? "lg:col-span-9" : "lg:col-span-12"}`}>
          <DataQualityTiles log={log} />
          <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-5">
            <div className="min-w-0 xl:col-span-3"><WinnabilityMatrix cities={visible} thresholds={state.scoring?.thresholds} selectedId={selected} onSelect={setSelectedId} calls={calls} onReset={() => setFilters(defaultFilters())} /></div>
            <section aria-label="Market map" className="flex min-w-0 flex-col gap-2 rounded-[14px] bg-paper p-3 lg:p-4 xl:col-span-2">
              <h2 className="font-title text-[20px] leading-tight text-canvas-text">Market map</h2>
              <p className="text-[12px] text-canvas-muted">{visible.length} {visible.length === 1 ? "market" : "markets"} in focus</p>
              <div className="relative h-[260px] overflow-hidden rounded-[10px] bg-canvas xl:min-h-[260px] xl:flex-1">
                {visible.length === 0 ? (
                  <div className="flex size-full flex-col items-center justify-center gap-3 px-4 text-center">
                    <p className="text-[14px] text-canvas-text">No markets match the filters</p>
                    <button type="button" onClick={() => setFilters(defaultFilters())} className="min-h-11 rounded-[8px] bg-paper-raised px-4 text-[13px] font-semibold text-canvas-text hover:bg-[#3a3932]">Reset filters</button>
                  </div>
                ) : (
                  <Suspense fallback={<div className="size-full bg-canvas-raised" />}>
                    <TourMap cities={visible} selectedId={selected} onSelect={setSelectedId} zones={visible.find((c) => c.id === selected)?.zones} />
                  </Suspense>
                )}
              </div>
            </section>
          </div>
          {profile ? (
            <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
              <AudienceProfile profile={profile} />
              <MomentumChart profile={profile} />
            </div>
          ) : (
            <p className="rounded-[14px] bg-paper p-4 text-[14px] text-canvas-muted">{streaming ? "Loading the audience profile…" : "Qloo returned no audience profile for this artist"}</p>
          )}
          {focusCity && (
            <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
              <PromoZones city={focusCity} />
              {artist ? <CrossDomainTaste artist={artist} city={focusCity} source={source} /> : null}
            </div>
          )}
          {artist && <ArtistCompare artist={artist} source={source} />}
          <ActivationBoxscore cities={visible} selectedId={selected} onSelect={setSelectedId} />
          <p className="px-1 pb-2 text-[12px] text-canvas-muted">{INTEGRITY_LINE}</p>
        </div>
      </div>
    </div>
  );
}
