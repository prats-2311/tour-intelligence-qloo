import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useOpenExampleRun, useWantsExample } from "@/lib/qloo/useOpenExampleRun";
import { NextStepLink } from "@/components/qloo/NextStep";
import { SPONSOR_ASSUMPTION } from "@/lib/qloo/labels";
import { zoneDisplayLabel } from "@/lib/qloo/zones";
import { PROOF_LINK_TEXT } from "@/lib/qloo/backtest";
import { AgentLog, AgentLogChip } from "@/components/qloo/AgentLog";
import { DualBars } from "@/components/qloo/DualBars";
import { Notice } from "@/components/qloo/Notice";
import { SampleBanner } from "@/components/qloo/SampleBanner";
import { Sheet } from "@/components/qloo/Sheet";
import { VerdictChip } from "@/components/qloo/VerdictChip";
import { nearestStop } from "@/lib/qloo/radius";
import { RadiusNote } from "@/components/qloo/RadiusNote";
import { VerdictClockLine } from "@/components/qloo/VerdictClockLine";
import { WhyThisScore } from "@/components/qloo/WhyThisScore";
import { AdvanceSheet } from "@/components/playbook/AdvanceSheet";
import { CardBody, ThisWeekBody, isEmptyWeek } from "@/components/playbook/cardBody";
import { ClaimsAudit } from "@/components/playbook/ClaimsAudit";
import { CARD_TITLE, cityCode, metaLine } from "@/components/playbook/format";
import { KeyArtPoster } from "@/components/playbook/KeyArtPoster";
import { PlaybookCard } from "@/components/playbook/PlaybookCard";
import { ReasoningSummary } from "@/components/playbook/ReasoningSummary";
import { PlaybookSkeleton } from "@/components/ui/Skeletons";
import { fetchThisWeek } from "@/lib/qloo/client";
import { accentFor } from "@/lib/qloo/cityAccent";
import { LONG_NAMES_BRIEF, SAMPLE_BRIEF, SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { SAMPLE_PLAYBOOK_CITY_IDS } from "@/lib/qloo/fixtures/lumenValePlaybooks";
import { INTEGRITY_LINE, LIVE_RUN_LINE, LOCATION_UNRESOLVED_NOTE, recordedPlaybooksLine } from "@/lib/qloo/labels";
import { firstOkName } from "@/lib/qloo/playbookFacts";
import { loadPlaybook, usePlaybook, type PlaybookRequest } from "@/lib/qloo/playbookStore";
import { useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { ShowcaseUnavailable } from "@/components/qloo/ShowcaseUnavailable";
import { isRoutingBrief, setShowcaseVariant, variantOfBrief, type ShowcaseVariant, showcaseAvailable, showcaseBrief, showcaseCities, showcaseParam, showcasePlaybookCities, showcasePlaybookEvents, showcaseQuery, showcaseRoutingAvailable } from "@/lib/qloo/showcase";
import type { CardKind, PlaybookCard as Card, SampleSet } from "@/lib/qloo/types";
import { visibleClaimTotals } from "@/lib/qloo/doNotBook";
import { useIsDesktop } from "@/lib/useMediaQuery";

// The Culture and Delight briefs belong to the legacy campaign flow, which is off the promoter path.
type Tab = "activate" | "talent";
const TABS: Array<{ id: Tab; label: string }> = [{ id: "activate", label: "How to win" }, { id: "talent", label: "Local acts" }];
const ORDER: CardKind[] = ["sponsors", "merch", "promo_zones", "local_moment", "venue_fit", "co_billing"];
type CardId = CardKind | "this_week";
// Desktop (lg) grid placement, brief 3b. On phones every card is a snap-scroller item.
const PLACE: Record<CardId, string> = {
  sponsors: "lg:col-span-5 lg:col-start-1 lg:row-start-1",
  promo_zones: "lg:col-span-7 lg:col-start-6 lg:row-start-1",
  venue_fit: "lg:col-span-4 lg:col-start-1 lg:row-start-2",
  co_billing: "lg:col-span-4 lg:col-start-5 lg:row-start-2",
  local_moment: "lg:col-span-4 lg:col-start-9 lg:row-start-2",
  merch: "lg:col-span-7 lg:col-start-1 lg:row-start-3",
  this_week: "lg:col-span-5 lg:col-start-8 lg:row-start-3",
  talent: "",
};
const FALLBACK_MAX_STOPS = 8;
// Sample playbooks replay ~25 events; the showcase pacing used on the board (60 ms) would make this page feel slow.
const SAMPLE_PLAYBOOK_DELAY_MS = 10;
// On phones "Remove from tour" is a quiet text button under the primary action, so the primary label never has to share a row with it.
const removeBtn = "inline-flex min-h-11 items-center justify-center rounded-[10px] px-3 text-[14px] font-semibold text-canvas-muted underline underline-offset-4 hover:text-canvas-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold lg:h-10 lg:bg-paper-raised lg:px-5 lg:text-[15px] lg:text-canvas-text lg:no-underline lg:hover:bg-[#3a3932]";
const btnGold = "btn-gold inline-flex h-12 w-full min-w-0 items-center justify-center rounded-[10px] px-5 text-[15px] font-semibold lg:h-10 lg:w-auto";
const textBtn = "inline-flex min-h-11 items-center px-1 text-[13px] font-medium text-canvas-text underline-offset-[0.18em] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
const smallBtn = "inline-flex min-h-11 items-center gap-1.5 rounded-[8px] bg-paper-raised px-3 text-[13px] font-semibold text-canvas-text hover:bg-[#3a3932] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
const first = (cards: Card[], kind: CardKind, key: string): string => firstOkName(cards, kind, key) ?? "—";

export default function CityPlaybook() {
  const [params] = useSearchParams();
  if (showcaseParam(params.get("showcase")) !== null && !showcaseAvailable()) return <ShowcaseUnavailable sampleHref={`/tours/playbook/${SAMPLE_CITIES[2]!.id}?sample=1`} />;
  return <CityPlaybookPage />;
}

function CityPlaybookPage() {
  const { cityId = "" } = useParams();
  const { state, run, shortlist, toggleShortlist, accentOrder, setLastOpened } = useTourBoard();
  const [params] = useSearchParams();
  const sampleParam = params.get("sample");
  const wantLong = sampleParam === "long";
  const showParam = showcaseParam(params.get("showcase"));
  const wantShowcase = showParam !== null;
  const wantRouting = showParam === "routing" && showcaseRoutingAvailable();
  setShowcaseVariant(wantRouting ? "routing" : "main"); // before any accessor below reads the recording (see useShowcaseVariant)
  const wantSample = sampleParam === "1" || wantLong || wantShowcase;
  const wantSet: SampleSet = wantShowcase ? "showcase" : wantLong ? "long" : "default";
  // The URL decides; a run already held on the board is the fallback, so Back never drops the showcase or sample flag.
  const sampleQ = wantShowcase ? showcaseQuery(wantRouting) : wantLong ? "?sample=long" : wantSample ? "?sample=1"
    : state.source === "showcase" ? showcaseQuery(isRoutingBrief(state.brief)) : state.source === "sample" ? (state.sampleSet === "long" ? "?sample=long" : "?sample=1") : "";
  // What the page shows follows the recording it asks for (URL) or, once a showcase run is held, the one that run belongs to.
  const variant: ShowcaseVariant = wantShowcase ? (wantRouting ? "routing" : "main") : state.source === "showcase" ? variantOfBrief(state.brief) : "main";
  // Bare url, no run: open the example (as the stepper does) instead of an empty state.
  const bareExample = useWantsExample(!wantSample);
  useOpenExampleRun(bareExample);
  const isDesktop = useIsDesktop();
  const setKey = `${wantSet}|${wantRouting ? "routing" : ""}`;
  const started = useRef<string | null>(null); // the sample set this page already asked the board for
  const [tab, setTab] = useState<Tab>("activate");
  const [whyOpen, setWhyOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [counterIdx, setCounterIdx] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const tabBase = useId();

  // ?sample=1 starts the showcase unless the board already holds a sample run. The ref only
  // guards the StrictMode double effect; it remembers the requested set so switching sets re-runs.
  useEffect(() => {
    if (!wantSample || started.current === setKey) return;
    started.current = setKey;
    if (state.source === "live" || (state.sampleSet ?? "default") !== wantSet || (wantShowcase && isRoutingBrief(state.brief) !== wantRouting)) run(wantShowcase ? showcaseBrief() : wantLong ? LONG_NAMES_BRIEF : SAMPLE_BRIEF, { sample: true, sampleSet: wantSet });
  }, [wantSample, wantLong, wantSet, wantRouting, state.source, state.sampleSet, state.brief, run]);

  const sample = state.source !== "live";
  // While a requested sample run has not started, nothing from an earlier live run is shown.
  const ready = !wantSample || (sample && (state.sampleSet ?? "default") === wantSet && (!wantShowcase || isRoutingBrief(state.brief) === wantRouting));
  const city = ready ? state.cities.find((c) => c.id === cityId) : undefined;
  const shownCity = city ?? (wantSample ? (wantShowcase ? showcaseCities(undefined, variant) : SAMPLE_CITIES).find((c) => c.id === cityId) : undefined);
  const artist = ready ? state.artist : undefined;
  // The Playbook step of the journey returns to the city opened last in this run.
  const openedHere = ready && !!state.brief && state.cities.some((c) => c.id === cityId);
  useEffect(() => { if (openedHere) setLastOpened(cityId); }, [openedHere, cityId, setLastOpened]);
  // A showcase city with no recorded playbook has nothing to open: say so instead of showing empty tiles.
  const unrecorded = (wantShowcase || state.source === "showcase") && ready && !!shownCity && showcasePlaybookEvents(cityId, variant) === null;
  const req: PlaybookRequest | null = shownCity && artist && !unrecorded
    ? { artist: artist.name, artistEntityId: artist.entityId, artistPopularity: artist.popularity, city: { id: shownCity.id, name: shownCity.name, country: shownCity.country, lat: shownCity.lat, lon: shownCity.lon }, sample, sampleSet: state.sampleSet, ...(variant === "routing" ? { variant } : {}), delayMs: sample ? (state.sampleSet === "showcase" ? 0 : SAMPLE_PLAYBOOK_DELAY_MS) : undefined }
    : null;
  const pb = usePlaybook(req);
  const window = state.brief?.dateWindow;
  const week = useQuery({
    queryKey: ["this-week", sample, state.sampleSet, variant, cityId, window?.start, window?.end],
    queryFn: () => fetchThisWeek({ city: shownCity!.name, country: shownCity!.country, window }, { sample, sampleSet: state.sampleSet, ...(variant === "routing" ? { variant } : {}), cityId }),
    enabled: !!shownCity && !!artist && !unrecorded,
    staleTime: Infinity,
    retry: false,
  });

  const narrative = pb.narrative;
  const noSample = pb.status === "error" && pb.error?.code === "NO_SAMPLE";
  const budget = pb.status === "error" && pb.error?.code === "BUDGET";
  const unplaced = pb.status === "error" && pb.error?.code === "LOCATION_UNRESOLVED";
  const failed = (pb.status === "error" && !noSample && !budget && !unplaced) || pb.status === "interrupted";
  const loading = (pb.status === "idle" || pb.status === "streaming") && pb.cards.length === 0;
  const narrativeStatus: "ok" | "unavailable" | "pending" = narrative ? (narrative.status === "ok" ? "ok" : "unavailable") : pb.status === "streaming" ? "pending" : "unavailable";
  const claimsOf = (kind: CardKind) => (narrative?.status === "ok" ? narrative.cards[kind] : undefined);
  const cardOf = (kind: CardKind) => pb.cards.find((c) => c.kind === kind);

  const weekIds: CardId[] = isEmptyWeek(week.data) ? [] : ["this_week"];
  const activateIds: CardId[] = loading ? [...ORDER, ...weekIds] : [...ORDER.filter((k) => cardOf(k)), ...weekIds];
  const idsKey = activateIds.join("|");
  const shownIdx = Math.min(counterIdx, activateIds.length - 1);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-card]"));
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setCounterIdx(els.indexOf(e.target as HTMLElement));
    }, { root, threshold: 0.6 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [idsKey, tab]);

  if (!shownCity) {
    if (state.status === "streaming" || !ready || bareExample) return <PlaybookSkeleton />;
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-start gap-3 py-10">
        <h1 className="font-title text-[24px] leading-tight text-canvas-text">Open this city from a Tour Board</h1>
        <p className="text-[13px] text-canvas-muted">Playbooks are built from a scored run.</p>
        <Link to="/tours/board" className={`${smallBtn} h-12`}>Go to Tour Board</Link>
      </div>
    );
  }

  if (unrecorded) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-start gap-3 pb-24 pt-6 lg:pb-6">
        <SampleBanner source="showcase" />
        <h1 className="font-title break-words text-[28px] leading-tight text-canvas-text">{shownCity.name}</h1>
        <p className="text-[13px] text-canvas-muted">{shownCity.country}</p>
        <div className="flex items-center gap-3">
          <VerdictChip verdict={shownCity.verdict} size="md" />
          <span className="font-mono text-[28px] font-bold leading-none text-canvas-text tabular">{shownCity.winnability.value === null ? "" : Math.round(shownCity.winnability.value)}</span>
        </div>
        <p className="text-[15px] text-canvas-text">{recordedPlaybooksLine(showcasePlaybookCities(variant).length)}</p>
        <Link to={`/tours/board${sampleQ}`} className={`${smallBtn} h-12`}>Back to the Tour Board</Link>
      </div>
    );
  }

  const accent = accentFor(shownCity.id, accentOrder);
  const code = cityCode(shownCity.name);
  const maxStops = state.brief?.maxStops ?? FALLBACK_MAX_STOPS;
  const inTour = shortlist.includes(shownCity.id);
  const hasPlaybook = (id: string) => (state.source === "showcase" ? showcasePlaybookEvents(id, variant) !== null : state.source === "sample" ? (SAMPLE_PLAYBOOK_CITY_IDS as readonly string[]).includes(id) : true);
  const nextHeld = inTour
    ? shortlist.slice(shortlist.indexOf(shownCity.id) + 1).map((id) => state.cities.find((c) => c.id === id)).find((c) => !!c && hasPlaybook(c.id))
    : undefined;
  const full = !inTour && shortlist.length >= maxStops;
  const w = shownCity.winnability.value;
  const merch = narrative?.status === "ok" ? narrative.merch : null;

  const { verified, removed: removedCount } = narrative?.status === "ok" ? visibleClaimTotals(narrative.cards) : { verified: 0, removed: 0 };
  const claimsValue = narrative?.status === "ok" ? `${verified} verified · ${removedCount} removed` : narrative ? "Narrative unavailable" : "—";
  const audit = narrative?.status === "ok"
    ? ([...ORDER, "talent"] as CardKind[]).map((k) => ({ card: CARD_TITLE[k], verified: narrative.cards[k]?.verified ?? [], removed: narrative.cards[k]?.removed ?? [] }))
    : [];

  // The shortlist when it holds another stop with coordinates; otherwise every city on the board.
  const picked = state.cities.filter((c) => shortlist.includes(c.id));
  const radiusPool = nearestStop(shownCity, picked) ? picked : state.cities;

  const retry = () => { if (req) void loadPlaybook(req); };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const at = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(at + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]!;
    setTab(next.id);
    document.getElementById(`${tabBase}-${next.id}`)?.focus();
  };

  const playbookCard = (kind: CardKind) => {
    const card = cardOf(kind);
    if (!card) return <div className="skeleton h-[280px] rounded-[18px]" aria-hidden />;
    return (
      <PlaybookCard
        accent={accent}
        meta={metaLine(code, kind, card)}
        title={CARD_TITLE[kind]}
        claims={claimsOf(kind)}
        narrativeStatus={narrativeStatus}
        refsCount={card.refs.length}
        onAudit={() => setAuditOpen(true)}
        hasEvidence={card.status === "ok"}
      >
        <CardBody card={card} merch={merch} city={shownCity.name} country={shownCity.country} artist={artist?.name} venueName={firstOkName(pb.cards, "venue_fit") ?? undefined} />
      </PlaybookCard>
    );
  };
  const cardFor = (id: CardId): ReactNode => {
    if (id === "this_week") {
      return (
        <PlaybookCard accent={accent} meta={metaLine(code, "this_week")} title={CARD_TITLE.this_week} narrativeStatus="unavailable" refsCount={0} hasEvidence>
          <ThisWeekBody week={week.data} />
        </PlaybookCard>
      );
    }
    return loading ? <div className="skeleton h-[280px] rounded-[18px]" aria-hidden /> : playbookCard(id);
  };

  const addToTour = (
    <div className="flex min-w-0 flex-1 flex-col gap-1 lg:flex-none lg:items-start">
      {inTour ? (
        <div className="flex min-w-0 flex-1 flex-col items-stretch gap-0.5 lg:flex-none lg:flex-row-reverse lg:items-center lg:gap-2">
          <NextStepLink data-testid="primary-action" to={nextHeld ? `/tours/playbook/${nextHeld.id}${sampleQ}` : `/tours/book${sampleQ}`} className="btn-gold inline-flex min-h-12 min-w-0 items-center justify-center rounded-[10px] px-4 py-2 text-center text-[15px] font-semibold leading-tight lg:h-10 lg:min-h-0 lg:px-5">
            <span className="min-w-0 break-words">{nextHeld ? `Next: ${nextHeld.name}` : "Next: Tour Book"}</span>
          </NextStepLink>
          <button type="button" onClick={() => toggleShortlist(shownCity.id)} className={removeBtn}>Remove from tour</button>
        </div>
      ) : (
        <button type="button" disabled={full} onClick={() => toggleShortlist(shownCity.id)} className={btnGold}>Add to tour</button>
      )}
      {full && <p className="text-[13px] text-canvas-muted">Max stops reached — raise it in the brief</p>}
    </div>
  );
  const whyBtn = <button type="button" onClick={() => setWhyOpen(true)} className={textBtn}>Why this score?</button>;

  const noSamplePanel = (
    <section aria-label="No sample playbook" className="flex flex-col items-start gap-3 rounded-[18px] bg-paper p-4">
      <p className="text-[15px] text-canvas-text">{pb.error?.message ?? `No ${wantShowcase ? "recorded" : "sample"} playbook for ${shownCity.name}`}</p>
      <ul className="flex flex-col">
        {(wantShowcase ? showcasePlaybookCities(variant).map((x) => x.id) : [...SAMPLE_PLAYBOOK_CITY_IDS]).map((id) => {
          const c = (wantShowcase ? showcaseCities(undefined, variant) : SAMPLE_CITIES).find((x) => x.id === id);
          return c ? <li key={id}><Link to={`/tours/playbook/${id}${sampleQ || "?sample=1"}`} className="inline-flex min-h-11 items-center text-[15px] text-canvas-text underline decoration-canvas-muted underline-offset-4">{c.name}</Link></li> : null;
        })}
      </ul>
    </section>
  );

  const activatePanel = noSample ? noSamplePanel : (
    <>
      <div className="relative -mx-4 lg:mx-0">
        <div ref={scrollerRef} tabIndex={0} role="region" aria-label="Playbook cards" className="flex snap-x focus-visible:outline-2 focus-visible:outline-gold snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 lg:grid lg:grid-cols-12 lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0">
          {activateIds.map((id) => (
            <div key={id} data-card={id} data-tour={`card-${id}`} className={`w-[88%] shrink-0 snap-start lg:w-auto ${PLACE[id]}`}>{cardFor(id)}{id === "sponsors" && <p data-testid="sponsor-assumption" className="mt-2 text-[13px] text-canvas-muted">{SPONSOR_ASSUMPTION}</p>}</div>
          ))}
        </div>
        {shownIdx < activateIds.length - 1 && <span aria-hidden data-testid="swipe-fade" className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-canvas to-transparent lg:hidden" />}
      </div>
      <p className="mt-1 flex items-center justify-between gap-3 text-[13px] tabular-nums text-canvas-muted lg:hidden">
        <span aria-live="polite">{CARD_TITLE[activateIds[shownIdx]!]} · {shownIdx + 1} of {activateIds.length}</span>
        {shownIdx < activateIds.length - 1 && <span>Swipe for more</span>}
      </p>
      <div className="mt-3 flex flex-col">
        <Link to="/proof" className="inline-flex min-h-11 items-center self-start text-[14px] font-medium text-canvas-text underline decoration-canvas-muted underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">{PROOF_LINK_TEXT} →</Link>
        <p className="max-w-[56ch] text-[13px] text-canvas-muted">How often this playbook surfaced the sponsor, merch partner or local act real tours used.</p>
      </div>
    </>
  );
  const talentCard = cardOf("talent");
  const talentPanel = noSample ? noSamplePanel : loading ? <div className="skeleton h-[280px] max-w-xl rounded-[18px]" aria-hidden /> : talentCard ? <div className="max-w-xl">{playbookCard("talent")}</div> : <p className="text-[13px] text-canvas-muted">Local acts unavailable for {shownCity.name}</p>;
  const panels: Record<Tab, ReactNode> = { activate: activatePanel, talent: talentPanel };

  return (
    <div className="-mx-4 -mt-6 lg:mx-0 lg:mt-0">
      {(sample || wantSample) && <SampleBanner source={wantShowcase || state.source === "showcase" ? "showcase" : "sample"} />}
      <header className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-x-8 lg:pt-4">
        {isDesktop && (
          <div aria-hidden className="lg:order-2 lg:col-span-7 [&_svg]:rounded-[18px]">
            <KeyArtPoster city={shownCity.name} accent={accent} ratio="16:9" decorative />
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-3 px-4 lg:order-1 lg:col-span-5 lg:px-0">
          <Link to={`/tours/board${sampleQ}`} aria-label="Back to Tour Board" className="-mx-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-[10px] px-2 text-[13px] font-medium text-canvas-muted hover:text-canvas-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
            <ChevronLeft size={18} aria-hidden />Tour Board
          </Link>
          <div className="min-w-0">
            <h1 className="font-title break-words text-[24px] leading-tight text-canvas-text lg:text-[40px] lg:leading-[1.1]">{shownCity.name}</h1>
            <p className="text-[13px] text-canvas-muted">{shownCity.country}</p>
          </div>
          <div className="flex items-center gap-3">
            <VerdictChip verdict={shownCity.verdict} size="md" />
            <span className="flex items-baseline gap-1">
              <span data-testid="playbook-winnability" className="font-mono text-[28px] font-bold leading-none text-canvas-text tabular">{w === null ? "—" : Math.round(w)}</span>
              <span className="text-[13px] text-canvas-muted">/100</span>
            </span>
          </div>
          <DualBars fanHeat={shownCity.fanHeat} activation={shownCity.activation} thresholds={state.scoring?.thresholds} />
          <VerdictClockLine window={window} />
          <RadiusNote city={shownCity} pool={radiusPool} />
          {!isDesktop && whyBtn}
          <p className="text-[12px] text-canvas-muted">{INTEGRITY_LINE}</p>
          <AdvanceSheet rows={[
            { label: "TOP ZONE", value: zoneDisplayLabel(first(pb.cards, "promo_zones", "label"), shownCity.name) },
            { label: "BEST ROOM", value: first(pb.cards, "venue_fit", "name") },
            { label: "SUPPORT", value: first(pb.cards, "co_billing", "name") },
            { label: "CLAIMS", value: claimsValue, tour: "claims-tile", onClick: narrative?.status === "ok" && verified + removedCount > 0 ? () => setAuditOpen(true) : undefined, aria: `See the ${verified + removedCount} checked claims` },
          ]} />
          {narrative?.status === "unavailable" && <Notice>{narrative.message}</Notice>}
          {budget && (
            <Notice>
              <span className="min-w-0">Session limit reached — try the example tour</span>
              <Link to="/tours/board?showcase=1" className={smallBtn}>See the example tour</Link>
            </Notice>
          )}
          {unplaced && (
            <Notice>
              <span className="min-w-0">{LOCATION_UNRESOLVED_NOTE}</span>
              <Link to="/tours/board" className={smallBtn}>Back to the Tour Board</Link>
            </Notice>
          )}
          {failed && (
            <Notice>
              <span className="min-w-0">{pb.status === "interrupted" ? "Connection lost while building this playbook." : "This playbook could not be built."}</span>
              <button type="button" onClick={retry} className={smallBtn}>Try again</button>
              <Link to="/tours/board?showcase=1" className={smallBtn}>See the example tour</Link>
            </Notice>
          )}
          {isDesktop && <div className="flex flex-wrap items-center gap-3">{addToTour}{whyBtn}</div>}
          {!isDesktop && (
            <div data-testid="poster-strip" aria-hidden className="overflow-hidden rounded-[14px] [&_svg]:rounded-[14px]">
              <KeyArtPoster city={shownCity.name} accent={accent} ratio="strip" decorative />
            </div>
          )}
        </div>
      </header>

      <div className="sticky top-0 z-20 mt-4 bg-canvas-raised lg:top-14">
        <div role="tablist" aria-label="Playbook sections" onKeyDown={onKey} className="flex px-2 lg:px-0">
          {TABS.map((t) => {
            const on = t.id === tab;
            return (
              <button
                key={t.id}
                id={`${tabBase}-${t.id}`}
                role="tab"
                type="button"
                aria-selected={on}
                aria-controls={`${tabBase}-panel`}
                tabIndex={on ? 0 : -1}
                onClick={() => setTab(t.id)}
                className={`min-h-11 flex-1 border-b-2 px-2 text-[14px] font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold lg:flex-none lg:px-5 ${on ? "border-gold text-canvas-text" : "border-transparent text-canvas-muted hover:text-canvas-text"}`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div id={`${tabBase}-panel`} role="tabpanel" aria-labelledby={`${tabBase}-${tab}`} className="mt-4 min-w-0 px-4 lg:px-0">
        {!sample && (pb.status === "idle" || pb.status === "streaming") && <p data-testid="live-run-line" className="mb-3 text-[12px] text-canvas-muted">{LIVE_RUN_LINE}</p>}
        {panels[tab]}
        <div className="mt-4 flex min-w-0 flex-col gap-3">
          <ReasoningSummary narrative={narrative} />
          <div className="flex"><AgentLogChip label="Playbook" events={pb.log} onOpen={() => setLogOpen(true)} /></div>
        </div>
      </div>

      {!isDesktop && (
        <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 mt-4 flex bg-canvas-raised py-2 pl-3 pr-[68px]">{addToTour}</div>
      )}

      <Sheet open={whyOpen} onClose={() => setWhyOpen(false)} title={`${shownCity.name} — why this score?`}><WhyThisScore city={shownCity} scoring={state.scoring} clockRule={!!window} /></Sheet>
      <Sheet open={auditOpen} onClose={() => setAuditOpen(false)} title="Checked claims"><ClaimsAudit claims={audit} /></Sheet>
      <Sheet open={logOpen} onClose={() => setLogOpen(false)} title="Agent log"><AgentLog events={pb.log} /></Sheet>
    </div>
  );
}
