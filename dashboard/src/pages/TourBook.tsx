import { useQueries } from "@tanstack/react-query";
import { useReducedMotion } from "framer-motion";
import { CalendarPlus, Printer, Share2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BookCover } from "@/components/book/BookCover";
import { ChapterIndex, type IndexItem } from "@/components/book/ChapterIndex";
import { CityChapter } from "@/components/book/CityChapter";
import { MarketChapter } from "@/components/book/MarketChapter";
import { CallsAppendix } from "@/components/book/CallsAppendix";
import { ProvenanceAppendix } from "@/components/book/ProvenanceAppendix";
import { SaveAsCampaign } from "@/components/book/SaveAsCampaign";
import type { SaveTourInput } from "@/lib/api";
import { AgentLog, AgentLogChip } from "@/components/qloo/AgentLog";
import { Sheet } from "@/components/qloo/Sheet";
import { fetchThisWeek } from "@/lib/qloo/client";
import { LONG_NAMES_BRIEF, SAMPLE_BRIEF } from "@/lib/qloo/fixtures/lumenVale";
import { toIcs } from "@/lib/qloo/ics";
import { getPlaybook, loadPlaybook, playbookKey, type PlaybookRequest } from "@/lib/qloo/playbookStore";
import { SAMPLE_TEXT } from "@/lib/qloo/labels";
import { defaultShortlist, sortCities } from "@/lib/qloo/ranking";
import { buildTourBook, campaignTitle } from "@/lib/qloo/tourBook";
import { useOpenExampleRun, useWantsExample } from "@/lib/qloo/useOpenExampleRun";
import { useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { ShowcaseUnavailable } from "@/components/qloo/ShowcaseUnavailable";
import { showcaseAvailable, showcaseBannerText, showcaseBrief } from "@/lib/qloo/showcase";
import type { SampleSet, ThisWeek } from "@/lib/qloo/types";
import { useIsDesktop } from "@/lib/useMediaQuery";

// Same pacing CityPlaybook uses so sample books do not feel slow.
const SAMPLE_PLAYBOOK_DELAY_MS = 10;
const btnBase = "inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-[10px] px-3 text-[14px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-50 lg:h-10 lg:flex-none lg:px-4";
const btnSecondary = `${btnBase} bg-paper-raised text-canvas-text hover:bg-[#3a3932]`;
const btnGold = `${btnBase} btn-gold`;
const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "tour";
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-md flex-col items-start gap-3 py-10">{children}</div>;
}

export default function TourBook() {
  const [params] = useSearchParams();
  if (params.get("showcase") === "1" && !showcaseAvailable()) return <ShowcaseUnavailable sampleHref="/tours/book?sample=1" />;
  return <TourBookPage />;
}

function TourBookPage() {
  const { state, run, shortlist, accentOrder } = useTourBoard();
  const [params] = useSearchParams();
  const sampleParam = params.get("sample");
  const wantLong = sampleParam === "long";
  const wantShowcase = params.get("showcase") === "1";
  const wantSample = sampleParam === "1" || wantLong || wantShowcase;
  const wantSet: SampleSet = wantShowcase ? "showcase" : wantLong ? "long" : "default";
  // The URL decides; the run the board already holds is the fallback, so Close never drops the showcase or sample flag.
  const sampleQ = wantShowcase ? "?showcase=1" : wantLong ? "?sample=long" : wantSample ? "?sample=1"
    : state.source === "showcase" ? "?showcase=1" : state.source === "sample" ? (state.sampleSet === "long" ? "?sample=long" : "?sample=1") : "";
  const bareExample = useWantsExample(!wantSample);
  useOpenExampleRun(bareExample);
  const isDesktop = useIsDesktop();
  const reduce = useReducedMotion();
  const started = useRef(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [preparedKey, setPreparedKey] = useState<string | null>(null);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [calendarDone, setCalendarDone] = useState(false);
  const [current, setCurrent] = useState("market");

  // ?sample=1 starts the showcase unless the board already holds a sample run (same guard as the playbook page).
  useEffect(() => {
    if (!wantSample || started.current) return;
    started.current = true;
    if (state.source === "live" || (state.sampleSet ?? "default") !== wantSet) run(wantShowcase ? showcaseBrief() : wantLong ? LONG_NAMES_BRIEF : SAMPLE_BRIEF, { sample: true, sampleSet: wantSet });
  }, [wantSample, wantLong, wantSet, state.source, state.sampleSet, run]);

  const sample = state.source !== "live";
  const ready = !wantSample || (sample && (state.sampleSet ?? "default") === wantSet);
  const artist = ready ? state.artist : undefined;
  const streaming = state.status === "streaming" || !ready || bareExample;
  const boardReady = ready && !streaming && !!artist && !!state.brief && state.cities.length > 0;
  const dateWindow = state.brief?.dateWindow;

  // Nothing held: the book covers the default shortlist (Play and Hidden goldmine markets) and says so.
  const usingDefault = state.shortlist == null || state.shortlist.length === 0;
  const picked = useMemo(() => {
    const chosen = new Set(usingDefault ? defaultShortlist(state.cities, state.brief?.maxStops ?? 8) : shortlist);
    return sortCities(state.cities, "winnability").filter((c) => chosen.has(c.id));
  }, [state.cities, state.brief?.maxStops, shortlist, usingDefault]);
  const prepKey = `${sample}|${state.sampleSet ?? ""}|${artist?.entityId ?? ""}|${picked.map((c) => c.id).join(",")}`;
  const requests = useMemo<PlaybookRequest[]>(
    () => (artist ? picked.map((c) => ({ artist: artist.name, artistEntityId: artist.entityId, city: { id: c.id, name: c.name, country: c.country }, sample, sampleSet: state.sampleSet, delayMs: sample ? SAMPLE_PLAYBOOK_DELAY_MS : undefined })) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prepKey],
  );

  // Playbooks are prepared one at a time to keep the Qloo budget predictable.
  useEffect(() => {
    if (!boardReady) return;
    let cancelled = false;
    void (async () => {
      for (let i = 0; i < requests.length; i++) {
        if (cancelled) return;
        setStep(i + 1);
        const req = requests[i]!;
        if (getPlaybook(playbookKey(req.artistEntityId, req.city.id, req.sampleSet))?.status !== "done") await loadPlaybook(req);
      }
      if (!cancelled) setPreparedKey(prepKey);
    })();
    return () => { cancelled = true; };
  }, [boardReady, requests, prepKey]);

  const weekQueries = useQueries({
    queries: picked.map((c) => ({
      queryKey: ["this-week", sample, state.sampleSet, c.id, dateWindow?.start, dateWindow?.end],
      queryFn: async (): Promise<ThisWeek> => {
        try { return await fetchThisWeek({ city: c.name, country: c.country, window: dateWindow }, { sample, sampleSet: state.sampleSet, cityId: c.id }); }
        catch { return { status: "unavailable", reason: "error", message: "Live web context unavailable — search failed" }; }
      },
      enabled: boardReady,
      staleTime: Infinity,
      retry: false,
    })),
  });
  const weeksKey = weekQueries.map((q) => q.dataUpdatedAt).join(",");

  const prepared = boardReady && preparedKey === prepKey;
  const book = useMemo(() => {
    if (!prepared || !artist || !state.brief) return null;
    return buildTourBook({
      brief: state.brief, artistName: artist.name, source: state.source, cities: state.cities, shortlist: picked.map((c) => c.id), accentOrder,
      boardLog: state.log,
      playbooks: Object.fromEntries(picked.map((c) => [c.id, getPlaybook(playbookKey(artist.entityId, c.id, state.sampleSet))])),
      weeks: Object.fromEntries(picked.map((c, i) => [c.id, weekQueries[i]?.data])),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepared, prepKey, weeksKey, state.brief, state.cities, state.log, accentOrder]);

  // Reading progress: written straight to the bar so scrolling never re-renders the book.
  useEffect(() => {
    if (!book) return;
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${ratio})`;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [book]);

  // Current chapter for the desktop index rail.
  useEffect(() => {
    if (!book || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setCurrent(e.target.id.replace(/^chapter-/, ""));
    }, { rootMargin: "-30% 0px -60% 0px" });
    document.querySelectorAll(".tour-book .book-chapter").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [book]);

  const jump = (id: string) => {
    setChaptersOpen(false);
    document.getElementById(`chapter-${id}`)?.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  if (boardReady && picked.length === 0) {
    return (
      <Centered>
        <h1 className="font-title text-[24px] leading-tight text-canvas-text">No markets shortlisted — hold dates for cities on the Tour Board</h1>
        <Link to={`/tours/board${sampleQ}`} className="inline-flex h-12 items-center rounded-[10px] bg-paper-raised px-5 text-[15px] font-semibold text-canvas-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">Go to Tour Board</Link>
      </Centered>
    );
  }

  if (!book) {
    if (!boardReady && !streaming) {
      return (
        <Centered>
          <h1 className="font-title text-[24px] leading-tight text-canvas-text">Build a tour from a Tour Board first</h1>
          <p className="text-[13px] text-canvas-muted">The Tour & Activation Book is made from a scored run and its shortlist.</p>
          <Link to="/tours/board" className="inline-flex h-12 items-center rounded-[10px] bg-paper-raised px-5 text-[15px] font-semibold text-canvas-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">Go to Tour Board</Link>
        </Centered>
      );
    }
    return (
      <Centered>
        <h1 className="font-title text-[24px] leading-tight text-canvas-text">Tour & Activation Book</h1>
        {streaming ? (
          <>
            <p role="status" className="text-[13px] text-canvas-muted">Waiting for the board to finish…</p>
            <AgentLogChip events={state.log} onOpen={() => setLogOpen(true)} />
            <Sheet open={logOpen} onClose={() => setLogOpen(false)} title="Agent log"><AgentLog events={state.log} /></Sheet>
          </>
        ) : (
          <p role="status" className="text-[13px] text-canvas-muted tabular-nums">Preparing playbooks · {Math.max(step, 1)} of {requests.length}</p>
        )}
        <div className="skeleton h-[160px] w-full rounded-[18px]" aria-hidden />
      </Centered>
    );
  }

  const share = async () => {
    const data = { title: book.title, text: [book.title, book.subtitle].filter(Boolean).join(" · "), url: location.href };
    if (typeof navigator.share === "function") {
      try { await navigator.share(data); } catch { /* dismissed by the user */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* clipboard unavailable: nothing honest to confirm */ }
  };
  const downloadIcs = () => {
    if (!dateWindow) return;
    const blob = new Blob([toIcs(book, dateWindow, stamp())], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(artist!.name)}-holds.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setCalendarDone(true);
    setTimeout(() => setCalendarDone(false), 4000);
  };

  // Live runs only: the snapshot that "Save as campaign" stores with the new campaign.
  const saveInput: SaveTourInput | null = sample ? null : {
    title: campaignTitle(artist!.name, state.brief!.regions),
    artist: artist!.name,
    artist_entity_id: artist!.entityId,
    regions: state.brief!.regions,
    date_window: dateWindow ?? null,
    cities: book.chapters.map(({ city }) => ({ id: city.id, name: city.name, country: city.country, verdict: city.verdict, winnability: city.winnability.value })),
    board_json: JSON.stringify({
      title: book.title, subtitle: book.subtitle,
      market: book.market.rows.map((c) => ({ id: c.id, name: c.name, country: c.country, verdict: c.verdict, fanHeat: c.fanHeat.value, activation: c.activation.value, winnability: c.winnability.value })),
      chapters: book.chapters.map((c) => ({ id: c.city.id, status: c.status, incompleteReason: c.incompleteReason ?? null, claims: c.claims, advance: c.advance })),
    }),
  };

  const actions = (
    <>
      <button type="button" onClick={() => void share()} className={btnSecondary}><Share2 size={16} aria-hidden />Share</button>
      <button type="button" onClick={() => window.print()} className={btnGold}><Printer size={16} aria-hidden />Download PDF</button>
      <button type="button" onClick={downloadIcs} disabled={!dateWindow} aria-describedby={dateWindow ? undefined : "ics-hint"} className={btnSecondary}><CalendarPlus size={16} aria-hidden />Calendar</button>
    </>
  );
  const notes = (
    <>
      {saveInput && <SaveAsCampaign input={saveInput} />}
      {copied && <p role="status" className="text-[13px] text-canvas-muted">Link copied</p>}
      <div aria-live="polite" className="empty:hidden">{calendarDone && <p role="status" className="text-[13px] text-canvas-text">Calendar file downloaded</p>}</div>
      {!dateWindow && <p id="ics-hint" className="text-[13px] text-canvas-muted">Add a date window to export holds</p>}
    </>
  );

  const items: IndexItem[] = [
    { id: "market", label: "Market selection" },
    ...book.chapters.map((c) => ({ id: c.city.id, label: c.city.name, accent: c.accent, verdict: c.city.verdict })),
    { id: "provenance", label: "Provenance" },
    { id: "calls", label: "Qloo calls" },
  ];

  return (
    <div className="tour-book -mx-4 -mt-6 lg:mx-0 lg:mt-0">
      <header data-noprint className="sticky top-0 z-30 flex h-[52px] items-center gap-2 bg-canvas-raised px-2 lg:top-14 lg:px-6">
        <Link to={`/tours/board${sampleQ}`} aria-label="Close" className="inline-flex size-11 shrink-0 items-center justify-center rounded-[10px] text-canvas-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"><X size={20} aria-hidden /></Link>
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-canvas-text">Tour & Activation Book</span>
        {!isDesktop && <button type="button" onClick={() => setChaptersOpen(true)} className="inline-flex min-h-11 items-center px-3 text-[14px] font-medium text-canvas-text underline-offset-[0.18em] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">Chapters</button>}
        {isDesktop && <div className="flex items-center gap-2">{notes}{actions}</div>}
        <div
          ref={progressRef} aria-hidden
          className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-gold"
          style={{ transform: "scaleX(0)", transition: reduce ? "none" : "transform 120ms linear" }}
        />
      </header>

      {usingDefault && <p data-noprint data-testid="default-shortlist-note" className="px-4 pt-3 text-[13px] text-canvas-muted lg:px-6">Showing the {picked.length} {picked.length === 1 ? "market" : "markets"} we'd hold by default: you haven't picked any yet.</p>}

      <div className="lg:mt-6 lg:grid lg:grid-cols-[minmax(180px,240px)_minmax(0,720px)] lg:gap-x-8 xl:grid-cols-[minmax(180px,240px)_minmax(0,720px)_minmax(0,1fr)]">
        {isDesktop && (
          <aside data-noprint className="sticky top-[calc(3.5rem+52px+1.5rem)] max-h-[calc(100dvh-10rem)] self-start overflow-y-auto">
            <ChapterIndex items={items} current={current} onJump={jump} />
          </aside>
        )}
        <div className="book-page flex min-w-0 flex-col gap-12 pb-24 lg:col-start-2 lg:bg-paper lg:p-14 lg:pb-14">
          <BookCover artist={artist!.name} regions={state.brief!.regions} season={book.subtitle} chapters={book.chapters} sample={book.source !== "live"} showcase={book.source === "showcase"} clocks={!!dateWindow} />
          <MarketChapter market={book.market} />
          {book.chapters.map((c) => <CityChapter key={c.city.id} chapter={c} sample={book.source !== "live"} showcase={book.source === "showcase"} artist={artist?.name} window={dateWindow} />)}
          <ProvenanceAppendix rows={book.provenance} calls={book.calls} sample={book.source !== "live"} showcase={book.source === "showcase"} />
          <CallsAppendix calls={book.calls} />
          {book.source !== "live" && <p data-print-footer className="print-footer">{book.source === "showcase" ? showcaseBannerText() : SAMPLE_TEXT}</p>}
        </div>
      </div>

      {!isDesktop && (
        <div data-noprint className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 flex flex-col gap-1 bg-canvas-raised px-3 py-2">
          {notes}
          <div className="flex gap-2">{actions}</div>
        </div>
      )}

      <Sheet open={chaptersOpen} onClose={() => setChaptersOpen(false)} title="Chapters">
        <ChapterIndex items={items} onJump={jump} />
      </Sheet>
    </div>
  );
}
