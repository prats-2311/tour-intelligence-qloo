import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { AgentLog, AgentLogChip } from "@/components/qloo/AgentLog";
import { DualBars } from "@/components/qloo/DualBars";
import { Notice } from "@/components/qloo/Notice";
import { SampleBanner } from "@/components/qloo/SampleBanner";
import { Sheet } from "@/components/qloo/Sheet";
import { VerdictChip } from "@/components/qloo/VerdictChip";
import { WhyThisScore } from "@/components/qloo/WhyThisScore";
import { AdvanceSheet } from "@/components/playbook/AdvanceSheet";
import { CardBody, ThisWeekBody } from "@/components/playbook/cardBody";
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
import { INTEGRITY_LINE } from "@/lib/qloo/labels";
import { loadPlaybook, usePlaybook, type PlaybookRequest } from "@/lib/qloo/playbookStore";
import { useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { showcaseBrief, showcaseCities, showcasePlaybookCities } from "@/lib/qloo/showcase";
import type { CardKind, PlaybookCard as Card, SampleSet } from "@/lib/qloo/types";
import { useIsDesktop } from "@/lib/useMediaQuery";

type Tab = "activate" | "culture" | "delight" | "talent";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "activate", label: "Activate" }, { id: "culture", label: "Culture" }, { id: "delight", label: "Delight" }, { id: "talent", label: "Talent" },
];
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
const btnGold = "btn-gold inline-flex h-12 w-full min-w-0 items-center justify-center rounded-[10px] px-5 text-[15px] font-semibold lg:h-10 lg:w-auto";
const textBtn = "inline-flex min-h-11 items-center px-1 text-[13px] font-medium text-canvas-text underline-offset-[0.18em] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
const smallBtn = "inline-flex min-h-11 items-center gap-1.5 rounded-[8px] bg-paper-raised px-3 text-[13px] font-semibold text-canvas-text hover:bg-[#3a3932] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
const first = (card: Card | undefined, key: string): string => {
  const v = card?.items[0]?.[key];
  return typeof v === "string" && v ? v : "—";
};

export default function CityPlaybook() {
  const { cityId = "" } = useParams();
  const { state, run, shortlist, toggleShortlist, accentOrder } = useTourBoard();
  const [params] = useSearchParams();
  const sampleParam = params.get("sample");
  const wantLong = sampleParam === "long";
  const wantShowcase = params.get("showcase") === "1";
  const wantSample = sampleParam === "1" || wantLong || wantShowcase;
  const wantSet: SampleSet = wantShowcase ? "showcase" : wantLong ? "long" : "default";
  const sampleQ = wantShowcase ? "?showcase=1" : wantLong ? "?sample=long" : wantSample ? "?sample=1" : "";
  const isDesktop = useIsDesktop();
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
    if (!wantSample || started.current === wantSet) return;
    started.current = wantSet;
    if (state.source === "live" || (state.sampleSet ?? "default") !== wantSet) run(wantShowcase ? showcaseBrief() : wantLong ? LONG_NAMES_BRIEF : SAMPLE_BRIEF, { sample: true, sampleSet: wantSet });
  }, [wantSample, wantLong, wantSet, state.source, state.sampleSet, run]);

  const sample = state.source !== "live";
  // While a requested sample run has not started, nothing from an earlier live run is shown.
  const ready = !wantSample || (sample && (state.sampleSet ?? "default") === wantSet);
  const city = ready ? state.cities.find((c) => c.id === cityId) : undefined;
  const shownCity = city ?? (wantSample ? (wantShowcase ? showcaseCities() : SAMPLE_CITIES).find((c) => c.id === cityId) : undefined);
  const artist = ready ? state.artist : undefined;
  const req: PlaybookRequest | null = shownCity && artist
    ? { artist: artist.name, artistEntityId: artist.entityId, city: { id: shownCity.id, name: shownCity.name, country: shownCity.country }, sample, sampleSet: state.sampleSet, delayMs: sample ? SAMPLE_PLAYBOOK_DELAY_MS : undefined }
    : null;
  const pb = usePlaybook(req);
  const window = state.brief?.dateWindow;
  const week = useQuery({
    queryKey: ["this-week", sample, state.sampleSet, cityId, window?.start, window?.end],
    queryFn: () => fetchThisWeek({ city: shownCity!.name, country: shownCity!.country, window }, { sample, sampleSet: state.sampleSet, cityId }),
    enabled: !!shownCity && !!artist,
    staleTime: Infinity,
    retry: false,
  });

  const narrative = pb.narrative;
  const noSample = pb.status === "error" && pb.error?.code === "NO_SAMPLE";
  const budget = pb.status === "error" && pb.error?.code === "BUDGET";
  const failed = (pb.status === "error" && !noSample && !budget) || pb.status === "interrupted";
  const loading = (pb.status === "idle" || pb.status === "streaming") && pb.cards.length === 0;
  const narrativeStatus: "ok" | "unavailable" | "pending" = narrative ? (narrative.status === "ok" ? "ok" : "unavailable") : pb.status === "streaming" ? "pending" : "unavailable";
  const claimsOf = (kind: CardKind) => (narrative?.status === "ok" ? narrative.cards[kind] : undefined);
  const cardOf = (kind: CardKind) => pb.cards.find((c) => c.kind === kind);

  const activateIds: CardId[] = loading ? [...ORDER, "this_week"] : [...ORDER.filter((k) => cardOf(k)), "this_week"];
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
    if (state.status === "streaming" || !ready) return <PlaybookSkeleton />;
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-start gap-3 py-10">
        <h1 className="font-title text-[24px] leading-tight text-canvas-text">Open this city from a Tour Board</h1>
        <p className="text-[13px] text-canvas-muted">Playbooks are built from a scored run.</p>
        <Link to="/tours/board" className={`${smallBtn} h-12`}>Go to Tour Board</Link>
      </div>
    );
  }

  const accent = accentFor(shownCity.id, accentOrder);
  const code = cityCode(shownCity.name);
  const maxStops = state.brief?.maxStops ?? FALLBACK_MAX_STOPS;
  const inTour = shortlist.includes(shownCity.id);
  const full = !inTour && shortlist.length >= maxStops;
  const w = shownCity.winnability.value;
  const merch = narrative?.status === "ok" ? narrative.merch : null;

  let verified = 0, removedCount = 0;
  if (narrative?.status === "ok") for (const c of Object.values(narrative.cards)) { verified += c.verified.length; removedCount += c.removed.length; }
  const claimsValue = narrative?.status === "ok" ? `${verified} verified · ${removedCount} removed` : narrative ? "Narrative unavailable" : "—";
  const audit = narrative?.status === "ok"
    ? ([...ORDER, "talent"] as CardKind[]).map((k) => ({ card: CARD_TITLE[k], removed: narrative.cards[k]?.removed ?? [] }))
    : [];

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
        <CardBody card={card} merch={merch} city={shownCity.name} artist={artist?.name} />
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
    <div className="flex min-w-0 flex-col gap-1 lg:items-start">
      <button type="button" disabled={full} onClick={() => toggleShortlist(shownCity.id)} className={btnGold}>
        {inTour ? "Remove from tour" : "Add to tour"}
      </button>
      {full && <p className="text-[13px] text-canvas-muted">Max stops reached — raise it in the brief</p>}
    </div>
  );
  const whyBtn = <button type="button" onClick={() => setWhyOpen(true)} className={textBtn}>Why this score?</button>;

  const noSamplePanel = (
    <section aria-label="No sample playbook" className="flex flex-col items-start gap-3 rounded-[18px] bg-paper p-4">
      <p className="text-[15px] text-canvas-text">{pb.error?.message ?? `No ${wantShowcase ? "recorded" : "sample"} playbook for ${shownCity.name}`}</p>
      <ul className="flex flex-col">
        {(wantShowcase ? showcasePlaybookCities().map((x) => x.id) : [...SAMPLE_PLAYBOOK_CITY_IDS]).map((id) => {
          const c = (wantShowcase ? showcaseCities() : SAMPLE_CITIES).find((x) => x.id === id);
          return c ? <li key={id}><Link to={`/tours/playbook/${id}${sampleQ || "?sample=1"}`} className="inline-flex min-h-11 items-center text-[15px] text-canvas-text underline decoration-canvas-muted underline-offset-4">{c.name}</Link></li> : null;
        })}
      </ul>
    </section>
  );

  const activatePanel = noSample ? noSamplePanel : (
    <>
      <div ref={scrollerRef} className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-12 lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0">
        {activateIds.map((id) => (
          <div key={id} data-card={id} className={`w-[88%] shrink-0 snap-start lg:w-auto ${PLACE[id]}`}>{cardFor(id)}</div>
        ))}
      </div>
      <p className="mt-1 text-[13px] tabular-nums text-canvas-muted lg:hidden" aria-live="polite">
        {CARD_TITLE[activateIds[shownIdx]!]} · {shownIdx + 1} of {activateIds.length}
      </p>
    </>
  );
  const talentCard = cardOf("talent");
  const talentPanel = noSample ? noSamplePanel : loading ? <div className="skeleton h-[280px] max-w-xl rounded-[18px]" aria-hidden /> : talentCard ? <div className="max-w-xl">{playbookCard("talent")}</div> : <p className="text-[13px] text-canvas-muted">Talent brief unavailable for {shownCity.name}</p>;
  const briefPanel = (
    <p className="max-w-xl rounded-[18px] bg-paper p-4 text-[15px] leading-[1.45] text-canvas-text">
      Culture and Delight briefs are written by the campaign agents after you save this tour as a campaign.
    </p>
  );
  const panels: Record<Tab, ReactNode> = { activate: activatePanel, culture: briefPanel, delight: briefPanel, talent: talentPanel };

  return (
    <div className="-mx-4 -mt-6 lg:mx-0 lg:mt-0">
      {(sample || wantSample) && <SampleBanner source={wantShowcase || state.source === "showcase" ? "showcase" : "sample"} />}
      <header className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-x-8 lg:pt-4">
        <div className="relative lg:order-2 lg:col-span-7 [&_svg]:rounded-none lg:[&_svg]:rounded-[18px]">
          <KeyArtPoster city={shownCity.name} accent={accent} ratio={isDesktop ? "16:9" : "4:5"} />
          <Link to={`/tours/board${sampleQ}`} aria-label="Back to Tour Board" className="absolute left-3 top-3 inline-flex size-11 items-center justify-center rounded-[10px] bg-canvas-raised text-canvas-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold lg:left-4 lg:top-4">
            <ChevronLeft size={22} aria-hidden />
          </Link>
        </div>
        <div className="flex min-w-0 flex-col gap-3 px-4 lg:order-1 lg:col-span-5 lg:px-0">
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
          {!isDesktop && whyBtn}
          <p className="text-[12px] text-canvas-muted">{INTEGRITY_LINE}</p>
          <AdvanceSheet rows={[
            { label: "TOP ZONE", value: first(cardOf("promo_zones"), "label") },
            { label: "BEST ROOM", value: first(cardOf("venue_fit"), "name") },
            { label: "SUPPORT", value: first(cardOf("co_billing"), "name") },
            { label: "CLAIMS", value: claimsValue },
          ]} />
          {narrative?.status === "unavailable" && <Notice>{narrative.message}</Notice>}
          {budget && (
            <Notice>
              <span className="min-w-0">Session limit reached — try the showcase tour</span>
              <Link to="/tours/board?showcase=1" className={smallBtn}>Try the showcase tour</Link>
            </Notice>
          )}
          {failed && (
            <Notice>
              <span className="min-w-0">{pb.status === "interrupted" ? "Connection lost while building this playbook." : "This playbook could not be built."}</span>
              <button type="button" onClick={retry} className={smallBtn}>Try again</button>
            </Notice>
          )}
          {isDesktop && <div className="flex flex-wrap items-center gap-3">{addToTour}{whyBtn}</div>}
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
        {panels[tab]}
        <div className="mt-4 flex min-w-0 flex-col gap-3">
          <ReasoningSummary narrative={narrative} />
          <div className="flex"><AgentLogChip events={pb.log} onOpen={() => setLogOpen(true)} /></div>
        </div>
      </div>

      {!isDesktop && (
        <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 mt-4 flex bg-canvas-raised px-3 py-2">{addToTour}</div>
      )}

      <Sheet open={whyOpen} onClose={() => setWhyOpen(false)} title={`${shownCity.name} — why this score?`}><WhyThisScore city={shownCity} scoring={state.scoring} /></Sheet>
      <Sheet open={auditOpen} onClose={() => setAuditOpen(false)} title="Removed claims"><ClaimsAudit claims={audit} /></Sheet>
      <Sheet open={logOpen} onClose={() => setLogOpen(false)} title="Agent log"><AgentLog events={pb.log} /></Sheet>
    </div>
  );
}
