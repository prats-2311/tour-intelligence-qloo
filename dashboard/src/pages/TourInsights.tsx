import { lazy, Suspense, useEffect, useMemo, useRef } from "react";
import { ChevronLeft } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { SampleBanner } from "@/components/qloo/SampleBanner";
import { ShowcaseUnavailable } from "@/components/qloo/ShowcaseUnavailable";
import { AgeMatrix } from "@/components/tourInsights/AgeMatrix";
import { CityScoresChart } from "@/components/tourInsights/CityScoresChart";
import { FiltersBar } from "@/components/tourInsights/FiltersBar";
import { QuadrantChart } from "@/components/tourInsights/QuadrantChart";
import { SponsorLiftChart } from "@/components/tourInsights/SponsorLiftChart";
import { TeamOverview } from "@/components/tourInsights/TeamOverview";
import { VerdictMix } from "@/components/tourInsights/VerdictMix";
import { ZoneShareChart } from "@/components/tourInsights/ZoneShareChart";
import { TasteInsightsSkeleton } from "@/components/ui/Skeletons";
import { STATUS_LABEL } from "@/lib/collab/types";
import { useWorkspace } from "@/lib/collab/workspaceContext";
import { LONG_NAMES_BRIEF, SAMPLE_BRIEF } from "@/lib/qloo/fixtures/lumenVale";
import { SAMPLE_PLAYBOOK_CITY_IDS, samplePlaybookEvents } from "@/lib/qloo/fixtures/lumenValePlaybooks";
import { allFansFromCard } from "@/lib/qloo/ageMatrix";
import { cityHasPlaybook, sourceQuery } from "@/lib/qloo/journey";
import { DEFAULT_SCORING_DISPLAY, INTEGRITY_LINE } from "@/lib/qloo/labels";
import { getPlaybook, playbookKey, usePlaybook, usePlaybookSnapshot, type PlaybookRequest } from "@/lib/qloo/playbookStore";
import { isRoutingBrief, setShowcaseVariant, showcaseAvailable, showcaseBrief, showcaseParam, showcasePlaybookEvents, showcaseRoutingAvailable, variantOfBrief, type ShowcaseVariant } from "@/lib/qloo/showcase";
import { applyTourFilters, defaultTourFilters, hasActiveFilters, parseTourFilters, topCityId, writeTourFilters, type TourFilters } from "@/lib/qloo/tourInsights";
import { useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { useOpenExampleRun, useWantsExample } from "@/lib/qloo/useOpenExampleRun";
import type { PlaybookCard, ScoredCity } from "@/lib/qloo/types";

const TourMap = lazy(() => import("@/components/qloo/TourMap"));
const linkBtn = "inline-flex min-h-11 items-center gap-1.5 rounded-[8px] bg-paper-raised px-3 text-[13px] font-semibold text-canvas-text hover:bg-[#3a3932] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

export default function TourInsights() {
  const [params] = useSearchParams();
  if (showcaseParam(params.get("showcase")) !== null && !showcaseAvailable()) return <ShowcaseUnavailable sampleHref="/tours/insights?sample=1" />;
  return <InsightsPage />;
}

function InsightsPage() {
  const { state, run } = useTourBoard();
  const ws = useWorkspace();
  const [params, setParams] = useSearchParams();
  const sampleParam = params.get("sample");
  const wantLong = sampleParam === "long";
  const showParam = showcaseParam(params.get("showcase"));
  const wantShowcase = showParam !== null;
  const wantRouting = showParam === "routing" && showcaseRoutingAvailable();
  setShowcaseVariant(wantRouting ? "routing" : "main"); // before any accessor below reads the recording (see useShowcaseVariant)
  const wantSample = sampleParam === "1" || wantLong || wantShowcase;
  const sampleKey = `${sampleParam ?? ""}|${showParam ?? ""}`;
  const started = useRef<string | null>(null);

  // Same entry rules as the board: a sample or showcase link starts that run unless the board already holds it; a bare URL opens the example.
  useEffect(() => {
    if (!wantSample || started.current === sampleKey) return;
    started.current = sampleKey;
    if (wantShowcase) {
      if (state.source !== "showcase" || isRoutingBrief(state.brief) !== wantRouting) run(showcaseBrief(), { sample: true, sampleSet: "showcase" });
    } else if (state.source !== "sample") run(wantLong ? LONG_NAMES_BRIEF : SAMPLE_BRIEF, { sample: true, sampleSet: wantLong ? "long" : "default" });
  }, [wantSample, wantLong, wantShowcase, wantRouting, sampleKey, state.source, state.brief, run]);
  const bareExample = useWantsExample(!wantSample);
  useOpenExampleRun(bareExample);

  const ready = !wantSample || (wantShowcase ? state.source === "showcase" && isRoutingBrief(state.brief) === wantRouting : state.source === "sample");
  const cities = useMemo(() => (ready ? state.cities : []), [ready, state.cities]);
  const variant: ShowcaseVariant = state.source === "showcase" ? variantOfBrief(state.brief) : "main";
  const q = sourceQuery(state.source, state.sampleSet, state.source === "showcase" && variant === "routing");
  const hrefFor = (id: string): string | null => (cityHasPlaybook(state.source, id, variant === "routing") ? `/tours/playbook/${id}${q}` : null);

  /** The city's all-fans Sponsors card from memory only: the recording, the sample, or a live playbook someone already opened. Never starts a lookup. */
  const sponsorsCardOf = (city: ScoredCity): PlaybookCard | undefined => {
    const artistId = state.artist?.entityId;
    const events = state.source === "showcase" ? showcasePlaybookEvents(city.id, variant) : state.source === "sample" && (SAMPLE_PLAYBOOK_CITY_IDS as readonly string[]).includes(city.id) ? samplePlaybookEvents(city.id, { long: state.sampleSet === "long" }) : null;
    const cards = events ? events.flatMap((e) => (e.type === "playbook" ? e.playbook.cards : [])) : artistId ? getPlaybook(playbookKey(artistId, city.id, state.sampleSet, variant === "routing" && state.source === "showcase" ? "routing" : undefined))?.cards ?? [] : [];
    return cards.find((c) => c.kind === "sponsors");
  };
  const bandHref = (id: string, band?: string): string | null => { const h = hrefFor(id); return h && band ? `${h}${h.includes("?") ? "&" : "?"}band=${band}` : h; };

  // Filters live in the URL so a copied link opens the same view.
  const filters = useMemo(() => parseTourFilters(params), [params]);
  const setFilters = (f: TourFilters) => setParams((p) => writeTourFilters(p, f), { replace: true });
  const snapshot = ws.enabled ? ws.snapshot : null;
  const visible = useMemo(() => applyTourFilters(cities, filters, (id) => snapshot?.statuses[id]?.status ?? null), [cities, filters, snapshot]);
  const mapStatus = useMemo(() => (snapshot ? (id: string): string | null => (snapshot.statuses[id] ? STATUS_LABEL[snapshot.statuses[id]!.status] : null) : undefined), [snapshot]);

  // The city the sponsor and zone charts follow: the URL's `city` while it is still shown, else the most winnable one.
  const cityParam = params.get("city");
  const focus: ScoredCity | undefined = visible.find((c) => c.id === cityParam) ?? visible.find((c) => c.id === topCityId(visible));
  const pickCity = (id: string) => setParams((p) => { const n = new URLSearchParams(p); n.set("city", id); return n; }, { replace: true });

  if (state.cities.length === 0 || !ready) {
    if (bareExample || wantSample || state.status === "streaming") return <TasteInsightsSkeleton />;
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 py-10 text-center">
        <h1 className="font-title text-[32px] leading-tight text-canvas-text">City charts</h1>
        <h2 className="text-[18px] font-semibold text-canvas-text">Score a Tour Board to see charts by market</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link to="/tours/board?showcase=1" className={linkBtn}>See the example tour</Link>
          <Link to="/tours/board?new=1" className={linkBtn}>Try your own artist</Link>
        </div>
      </div>
    );
  }

  const thresholds = state.scoring?.thresholds ?? DEFAULT_SCORING_DISPLAY.thresholds;
  const artistName = state.artist?.name ?? state.brief?.artist;
  const streaming = state.status === "streaming";
  const reset = () => setFilters(defaultTourFilters());

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {state.source !== "live" && <SampleBanner source={state.source} />}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/tours/board${q}`} className="-mx-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-[10px] px-2 text-[13px] font-medium text-canvas-muted hover:text-canvas-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"><ChevronLeft size={18} aria-hidden />Tour Board</Link>
          <h1 className="font-title text-[32px] leading-[1.1] text-canvas-text lg:text-[40px]">City charts</h1>
          <p className="mt-1 text-[13px] text-canvas-muted">
            {artistName && <span className="text-canvas-text">{artistName}</span>}{artistName && " · "}{cities.length} {cities.length === 1 ? "market" : "markets"} scored{streaming && " · still scoring"}
          </p>
        </div>
      </header>

      {state.artist && <AgeMatrix cities={visible} artist={state.artist} allFansOf={(c) => allFansFromCard(sponsorsCardOf(c))} hrefFor={bandHref} />}

      <section aria-label="Market map" className="flex min-w-0 flex-col gap-2 rounded-[14px] bg-paper p-3 lg:p-4">
        <h2 className="font-title text-[20px] leading-tight text-canvas-text">Market map</h2>
        <p className="text-[12px] text-canvas-muted">Shape is the verdict, size is fan heat. Hover or focus a marker for its scores. {visible.length} of {cities.length} {cities.length === 1 ? "market" : "markets"} shown.</p>
        <div className="relative h-[280px] overflow-hidden rounded-[10px] bg-canvas lg:h-[360px]">
          {visible.length === 0 ? <div className="size-full" /> : (
            <Suspense fallback={<div className="size-full bg-canvas-raised" />}>
              <TourMap cities={visible} selectedId={focus?.id ?? null} onSelect={pickCity} zones={focus?.zones} statusOf={mapStatus} />
            </Suspense>
          )}
        </div>
      </section>

      <FiltersBar filters={filters} onChange={setFilters} cities={cities} showStatus={!!snapshot} shown={visible.length} />

      {visible.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-[14px] bg-paper p-4">
          <p className="text-[15px] text-canvas-text">No cities match these filters.</p>
          <button type="button" onClick={reset} disabled={!hasActiveFilters(filters)} className={linkBtn}>Reset filters</button>
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="min-w-0 xl:col-span-2"><CityScoresChart cities={visible} hrefFor={hrefFor} /></div>
          <div className="min-w-0"><QuadrantChart cities={visible} thresholds={thresholds} hrefFor={hrefFor} /></div>
          <div className="flex min-w-0 flex-col gap-4">
            <VerdictMix cities={visible} />
            {snapshot && <TeamOverview cities={visible} snapshot={snapshot} hrefFor={hrefFor} />}
          </div>
          {focus && (
            <>
              <div className="flex min-w-0 flex-col gap-2 xl:col-span-2">
                <label className="flex w-fit flex-col gap-1 text-[13px] text-canvas-text">
                  <span>City for sponsor lift and promo zones</span>
                  <select value={focus.id} onChange={(e) => pickCity(e.target.value)} className="min-h-11 rounded-[8px] border border-canvas-line bg-paper-raised px-2 text-[14px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
                    {visible.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="min-w-0"><SponsorLift city={focus} /></div>
              <div className="min-w-0"><ZoneShareChart city={focus} /></div>
            </>
          )}
        </div>
      )}
      <p className="px-1 pb-2 text-[12px] text-canvas-muted">{INTEGRITY_LINE}</p>
    </div>
  );
}

/** Sponsor ranks for one city from its playbook. Recorded and sample runs replay from memory (no network); a live run only reads a playbook someone already opened. */
function SponsorLift({ city }: { city: ScoredCity }) {
  const { state } = useTourBoard();
  const artist = state.artist;
  const sample = state.source !== "live";
  const variant: ShowcaseVariant = state.source === "showcase" ? variantOfBrief(state.brief) : "main";
  const covered = state.source === "showcase" ? showcasePlaybookEvents(city.id, variant) !== null : state.source === "sample" ? (SAMPLE_PLAYBOOK_CITY_IDS as readonly string[]).includes(city.id) : false;
  const routing = state.source === "showcase" && variant === "routing" ? ({ variant } as const) : {};
  const key = artist ? playbookKey(artist.entityId, city.id, state.sampleSet, routing.variant) : "";
  const existing = usePlaybookSnapshot(key);
  const enabled = !!artist && (sample ? covered : existing?.status === "done");
  const request: PlaybookRequest | null = enabled && artist
    ? { artist: artist.name, artistEntityId: artist.entityId, artistPopularity: artist.popularity, city: { id: city.id, name: city.name, country: city.country, lat: city.lat, lon: city.lon }, sample, sampleSet: state.sampleSet, ...routing, delayMs: sample ? 0 : undefined }
    : null;
  const pb = usePlaybook(request);
  const card = pb.cards.find((c) => c.kind === "sponsors") ?? null;
  const status = !artist || (sample && !covered) ? "none" : !sample && !enabled ? "unloaded" : pb.status === "done" ? "ready" : pb.status === "error" || pb.status === "interrupted" ? "none" : "loading";
  return <SponsorLiftChart city={city} card={card} status={status} />;
}
