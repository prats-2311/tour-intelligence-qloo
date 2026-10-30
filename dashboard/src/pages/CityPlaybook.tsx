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
import { NotesButton } from "@/components/collab/Notes";
import { SponsorLeads } from "@/components/collab/SponsorLeads";
import { StatusPicker } from "@/components/collab/Status";
import { TeamBar } from "@/components/collab/TeamBar";
import { cardThread, cityThread } from "@/lib/collab/types";
import { AdvanceSheet } from "@/components/playbook/AdvanceSheet";
import { heroWhys, scrollToCard } from "@/components/playbook/heroWhy";
import { CardBody, ThisWeekBody, isEmptyWeek } from "@/components/playbook/cardBody";
import { ClaimsAudit } from "@/components/playbook/ClaimsAudit";
import { CARD_TITLE, cityCode, metaLine } from "@/components/playbook/format";
import { NUMBER_KEY } from "@/lib/qloo/numberKey";
import { KeyArtPoster } from "@/components/playbook/KeyArtPoster";
import { PlaybookCard } from "@/components/playbook/PlaybookCard";
import { ReasoningSummary } from "@/components/playbook/ReasoningSummary";
import { PlaybookSkeleton } from "@/components/ui/Skeletons";
import { AdvanceBody } from "@/components/playbook/cards/Advance";
import { fetchAdvance, fetchThisWeek } from "@/lib/qloo/client";
import { accentFor } from "@/lib/qloo/cityAccent";
import { LONG_NAMES_BRIEF, SAMPLE_BRIEF, SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { SAMPLE_PLAYBOOK_CITY_IDS } from "@/lib/qloo/fixtures/lumenValePlaybooks";
import { INTEGRITY_LINE, LIVE_RUN_LINE, LOCATION_UNRESOLVED_NOTE, recordedPlaybooksLine } from "@/lib/qloo/labels";
import { firstOkName } from "@/lib/qloo/playbookFacts";
import { loadPlaybook, usePlaybook, type PlaybookRequest } from "@/lib/qloo/playbookStore";
import type { SegmentRequest } from "@/lib/qloo/segmentStore";
import { useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { ShowcaseUnavailable } from "@/components/qloo/ShowcaseUnavailable";
import { isRoutingBrief, setShowcaseVariant, variantOfBrief, type ShowcaseVariant, showcaseAvailable, showcaseBrief, showcaseCities, showcaseParam, showcasePlaybookCities, showcasePlaybookEvents, showcaseQuery, showcaseRoutingAvailable } from "@/lib/qloo/showcase";
import type { CardKind, PlaybookCard as Card, SampleSet } from "@/lib/qloo/types";
import { visibleClaimTotals } from "@/lib/qloo/doNotBook";
import { useIsDesktop } from "@/lib/useMediaQuery";

// The Culture and Delight briefs belong to the legacy campaign flow, which is off the promoter path.
type Tab = "activate" | "talent" | "advance";
const TABS: Array<{ id: Tab; label: string }> = [{ id: "activate", label: "How to win" }, { id: "talent", label: "Acts fans love" }, { id: "advance", label: "Advance & risks" }];
// DOM order = the desktop grid order (row by row), so keyboard order matches what is seen.
const ORDER: CardKind[] = ["sponsors", "promo_zones", "venue_fit", "co_billing", "local_moment", "merch"];
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

/** A small closed disclosure under the tabs: what each number on the cards means, one line per term. */
function NumberKey() {
  return (
    <details data-number-key className="mt-2 px-4 text-[13px] text-canvas-muted lg:px-0">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-canvas-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">How to read these numbers</summary>
      <dl className="mb-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        {NUMBER_KEY.map((k) => (<div key={k.term} className="contents"><dt className="font-medium text-canvas-text">{k.term}</dt><dd>{k.text}</dd></div>))}
      </dl>
    </details>
  );
}
// Sample playbooks replay ~25 events; the showcase pacing used on the board (60 ms) would make this page feel slow.
const SAMPLE_PLAYBOOK_DELAY_MS = 10;
// On phones "Remove from tour" is a quiet text button under the primary action, so the primary label never has to share a row with it.
const removeBtn = "inline-flex min-h-11 items-center justify-center rounded-[10px] px-3 text-[14px] font-semibold text-canvas-muted underline underline-offset-4 hover:text-canvas-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold lg:h-11 lg:bg-paper-raised lg:px-5 lg:text-[15px] lg:text-canvas-text lg:no-underline lg:hover:bg-[#3a3932]";
const btnGold = "btn-gold inline-flex h-12 w-full min-w-0 items-center justify-center rounded-[10px] px-5 text-[15px] font-semibold lg:h-11 lg:w-auto";
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
  const toggleRef = useRef<HTMLButtonElement>(null);
  const refocusToggle = useRef(false);
  useEffect(() => { if (refocusToggle.current) { refocusToggle.current = false; toggleRef.current?.focus(); } }, [shortlist]);
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
  // Switching tabs swaps a tall panel for a short one; hold the old height so the page (and the reader's scroll position) does not jump.
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelMin, setPanelMin] = useState(0);
  const selectTab = (id: Tab) => {
    const el = panelRef.current;
    // Keep only as much height as the current scroll position needs (not the whole tall panel), so short tabs are not followed by a screen of blank page.
    setPanelMin(el ? Math.min(el.offsetHeight, Math.max(0, Math.ceil(globalThis.scrollY + globalThis.innerHeight - (el.getBoundingClientRect().top + globalThis.scrollY)))) : 0);
    setTab(id);
  };
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
  // Advance & risks is fetched only once its tab is opened (web lookups cost credits); the recorded example gets live lookups for its real cities, the invented sample none.
  const advanceReady = !!shownCity && !!window && !unrecorded && (!sample || state.sampleSet === "showcase");
  const advance = useQuery({
    queryKey: ["advance", sample, state.sampleSet, cityId, window?.start, window?.end, state.brief?.artistCountry ?? ""],
    queryFn: () => fetchAdvance({ city: shownCity!.name, country: shownCity!.country, window: window!, lat: shownCity!.lat, lon: shownCity!.lon, ...(state.brief?.artistCountry ? { artistCountry: state.brief.artistCountry } : {}) }),
    enabled: tab === "advance" && advanceReady,
    staleTime: Infinity,
    retry: false,
  });

  // Age groups are always a live gateway read made on click, so they exist for live runs and the recorded example, never for the invented sample set.
  const segments: SegmentRequest | undefined = shownCity && artist && (!sample || state.sampleSet === "showcase") && !unrecorded
    ? { artistId: artist.entityId, artist: artist.name, city: { id: shownCity.id, name: shownCity.name, country: shownCity.country, lat: shownCity.lat, lon: shownCity.lon } }
    : undefined;
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
  const why = heroWhys(pb.cards);
  // The three cards a why line points at live on "How to win"; open that tab first, then scroll once it has rendered.
  const goToCard = (kind: CardKind) => { setTab("activate"); setTimeout(() => scrollToCard(kind), 0); };
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
    selectTab(next.id);
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
        notes={<NotesButton threadKey={cardThread(shownCity.id, kind)} title={CARD_TITLE[kind]} />}
        leadOnly={kind === "sponsors" || kind === "venue_fit" || kind === "promo_zones" || kind === "co_billing"}
      >
        <CardBody card={card} merch={merch} city={shownCity.name} country={shownCity.country} artist={artist?.name} venueName={firstOkName(pb.cards, "venue_fit") ?? undefined} segments={segments} pitchCityId={shownCity.id} />
        {kind === "sponsors" && <SponsorLeads cityId={shownCity.id} />}
      </PlaybookCard>
    );
  };
  const cardFor = (id: CardId): ReactNode => {
    if (id === "this_week") {
      return (
        <PlaybookCard accent={accent} meta={metaLine(code, "this_week")} title={CARD_TITLE.this_week} narrativeStatus="unavailable" refsCount={0} hasEvidence notes={<NotesButton threadKey={cardThread(shownCity.id, "this_week")} title={CARD_TITLE.this_week} />}>
          <ThisWeekBody week={week.data} />
        </PlaybookCard>
      );
    }
    return loading ? <div className="skeleton h-[280px] rounded-[18px]" aria-hidden /> : playbookCard(id);
  };

  // Remove/Add swaps the button for its twin; keep keyboard focus on whichever one now stands in its place.
  // toast: the toast agent hooks the "Removed from tour / Added to tour" message into `toggle`.
  const toggle = () => { refocusToggle.current = true; toggleShortlist(shownCity.id); };
  const addToTour = (
    <div className="flex min-w-0 flex-1 flex-col justify-end gap-1 max-lg:min-h-12 lg:flex-none lg:items-start">
      {inTour ? (
        <div className="flex min-w-0 flex-1 flex-row items-center gap-2 lg:flex-none">
          <button ref={toggleRef} type="button" onClick={toggle} className={removeBtn}>Remove from tour</button>
          <NextStepLink data-testid="primary-action" to={nextHeld ? `/tours/playbook/${nextHeld.id}${sampleQ}` : `/tours/book${sampleQ}`} className="btn-gold inline-flex min-h-12 min-w-0 items-center justify-center rounded-[10px] px-4 py-2 text-center text-[15px] font-semibold leading-tight lg:h-11 lg:min-h-0 lg:px-5">
            <span className="min-w-0 break-words">{nextHeld ? `Next: ${nextHeld.name}` : "Next: Tour Book"}</span>
          </NextStepLink>
        </div>
      ) : (
        <button ref={toggleRef} type="button" disabled={full} onClick={toggle} className={btnGold}>Add to tour</button>
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
            <div key={id} id={`card-${id}`} data-card={id} data-tour={`card-${id}`} className={`w-[88%] shrink-0 snap-start lg:w-auto ${PLACE[id]}`}>{cardFor(id)}{id === "sponsors" && <p data-testid="sponsor-assumption" className="mt-2 text-[13px] text-canvas-muted">{SPONSOR_ASSUMPTION}</p>}</div>
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
  const talentPanel = noSample ? noSamplePanel : loading ? <div className="skeleton h-[280px] rounded-[18px]" aria-hidden /> : talentCard ? <div>{playbookCard("talent")}</div> : <p className="text-[13px] text-canvas-muted">Acts these fans love here are unavailable for {shownCity.name}</p>;
  const advanceNote = !window ? (sample ? "This example has no date window, so there are no dates to check." : "Add a date window to the brief to see weather, holidays, visas and customs for these dates.") : !advanceReady ? "Advance details are not available for this sample city." : undefined;
  const advancePanel = noSample ? noSamplePanel : (
    <div className="max-w-xl">
      <PlaybookCard accent={accent} meta={`${code} · ADVANCE & RISKS`} title="Advance & risks" narrativeStatus="unavailable" refsCount={0} hasEvidence>
        <AdvanceBody data={advance.data} loading={advance.isPending || advance.isFetching} onRetry={() => void advance.refetch()} {...(advanceNote ? { message: advanceNote } : {})} />
      </PlaybookCard>
    </div>
  );
  const panels: Record<Tab, ReactNode> = { activate: activatePanel, talent: talentPanel, advance: advancePanel };

  return (
    <div className="-mx-4 -mt-6 lg:mx-0 lg:mt-0">
      {(sample || wantSample) && <SampleBanner source={wantShowcase || state.source === "showcase" ? "showcase" : "sample"} />}
      <header className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-x-8 lg:pt-4">
        <div className="flex min-w-0 flex-col gap-3 px-4 lg:col-span-12 lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-8 lg:px-0">
          {/* Phones stack both groups; from lg they are two balanced columns (the old decorative poster is gone). */}
          <div className="contents lg:col-span-6 lg:flex lg:min-w-0 lg:flex-col lg:gap-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4">
            <Link to={`/tours/board${sampleQ}`} aria-label="Back to Tour Board" className="-mx-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-[10px] px-2 text-[13px] font-medium text-canvas-muted hover:text-canvas-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
              <ChevronLeft size={18} aria-hidden />Tour Board
            </Link>
            <Link to={`/tours/insights${sampleQ}`} className={textBtn}>Charts</Link>
          </div>
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
          {isDesktop && <div className="flex flex-wrap items-center gap-3">{addToTour}{whyBtn}</div>}
          </div>
          <div className="contents lg:col-span-6 lg:flex lg:min-w-0 lg:flex-col lg:gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <StatusPicker cityId={shownCity.id} />
            <NotesButton threadKey={cityThread(shownCity.id)} title={shownCity.name} label="City notes" tour="city-notes" />
          </div>
          <TeamBar cities={state.cities.length ? state.cities : [shownCity]} />
          <AdvanceSheet cityId={shownCity.id} editable onGoToCard={goToCard} rows={[
            { label: "TOP ZONE", value: zoneDisplayLabel(first(pb.cards, "promo_zones", "label"), shownCity.name), why: why.top_zone },
            { label: "BEST ROOM", value: first(pb.cards, "venue_fit", "name"), why: why.best_room },
            { label: "SUPPORT", value: first(pb.cards, "co_billing", "name"), why: why.support },
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
          {!isDesktop && (
            <div data-testid="poster-strip" aria-hidden className="overflow-hidden rounded-[14px] [&_svg]:rounded-[14px]">
              <KeyArtPoster city={shownCity.name} accent={accent} ratio="strip" decorative />
            </div>
          )}
          </div>
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
                data-tour={`tab-${t.id}`}
                aria-controls={`${tabBase}-panel`}
                tabIndex={on ? 0 : -1}
                onClick={() => selectTab(t.id)}
                className={`min-h-11 flex-1 border-b-2 px-2 text-[14px] font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold lg:flex-none lg:px-5 ${on ? "border-gold text-canvas-text" : "border-transparent text-canvas-muted hover:text-canvas-text"}`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <NumberKey />
      <div id={`${tabBase}-panel`} ref={panelRef} style={panelMin ? { minHeight: panelMin } : undefined} role="tabpanel" aria-labelledby={`${tabBase}-${tab}`} className="mt-4 min-w-0 px-4 lg:px-0">
        <h2 className="sr-only">{tab === "advance" ? "Advance and risks" : TABS.find((t) => t.id === tab)?.label}</h2>
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
