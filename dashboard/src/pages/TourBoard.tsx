import { motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowRight, ArrowUp, CircleAlert, History, RotateCcw, Square } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AgentLog, AgentLogChip } from "@/components/qloo/AgentLog";
import { BriefForm } from "@/components/qloo/BriefForm";
import { CityRow, ROW_COLS_LG } from "@/components/qloo/CityRow";
import { MovesSection } from "@/components/qloo/MovesSection";
import { useOpenExampleRun, useWantsExample } from "@/lib/qloo/useOpenExampleRun";
import { NextStepButton, NextStepLink } from "@/components/qloo/NextStep";
import { NeedsInputPicker } from "@/components/qloo/NeedsInputPicker";
import { ShowcaseUnavailable } from "@/components/qloo/ShowcaseUnavailable";
import { interruptedText, Notice, regionNoticeText } from "@/components/qloo/Notice";
import { SampleBanner } from "@/components/qloo/SampleBanner";
import { Sheet } from "@/components/qloo/Sheet";
import { TeamBar } from "@/components/collab/TeamBar";
import { VerdictChip } from "@/components/qloo/VerdictChip";
import { VerdictGlyph } from "@/components/qloo/VerdictGlyph";
import { WhyThisScore } from "@/components/qloo/WhyThisScore";
import { TourBoardSkeleton } from "@/components/ui/Skeletons";
import { fetchWithoutQloo } from "@/lib/qloo/client";
import { LONG_CITY_NAMES, LONG_NAMES_BRIEF, SAMPLE_BRIEF, SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { SAMPLE_WITHOUT_QLOO } from "@/lib/qloo/fixtures/strategistSample";
import { effectiveRegions } from "@/lib/qloo/routing";
import { isRoutingBrief, setShowcaseVariant, variantOfBrief, type ShowcaseVariant, showcaseAvailable, showcaseBrief, showcaseParam, showcasePlaybookCities, showcasePlaybookEvents, showcaseQuery, showcaseRoutingAvailable, showcaseWithoutQloo } from "@/lib/qloo/showcase";
import { routingUnmatchedText } from "@/lib/qloo/routing";
import { sortCities, summarize } from "@/lib/qloo/ranking";
import { compareWithQloo, disagreementLine, FLAG_TEXT, type CompareRow } from "@/lib/qloo/withoutCompare";
import { useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { PROOF_LINK_TEXT } from "@/lib/qloo/backtest";
import { INTEGRITY_LINE, LIVE_RUN_LINE, recordedPlaybooksLine, VERDICT_LABEL } from "@/lib/qloo/labels";
import type { TourBrief, Verdict } from "@/lib/qloo/types";

const TourMap = lazy(() => import("@/components/qloo/TourMap"));

type Mode = "winnability" | "density" | "without";
const MODES: Array<{ id: Mode; label: string }> = [
  { id: "winnability", label: "Winnability" },
  { id: "density", label: "Density-only" },
  { id: "without", label: "Without Qloo" },
];
const MODE_NOTE: Record<Exclude<Mode, "without">, string> = {
  winnability: "Ranked by winnability: fan heat and how winnable the city is, 50/50.",
  density: "Same scores, sorted by fan heat only — the order a density-only tool would give.",
};
const WITHOUT_NOTE = "A generic LLM's city order, with no taste data. It is good at picking big markets (it beat winnability in our Test A); it can't tell you which brands or acts to pitch in each city.";
const WITHOUT_AGREES = "On the top city, the generic answer agrees.";
const sameCity = (a: string, b: string): boolean => a.normalize("NFKD").toLowerCase().trim() === b.normalize("NFKD").toLowerCase().trim();
const PANEL_LABEL: Record<Mode, string> = { winnability: "Winnability ranking", density: "Density-only ranking", without: "Without Qloo ranking" };
const SHORTLIST_VERDICTS = new Set(["play", "hidden_goldmine"]);

function SegmentedControl({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const reduce = useReducedMotion();
  const base = useId();
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = MODES[(MODES.findIndex((m) => m.id === mode) + (e.key === "ArrowRight" ? 1 : MODES.length - 1)) % MODES.length]!;
    onChange(next.id);
    document.getElementById(`${base}-${next.id}`)?.focus();
  };
  return (
    <div role="tablist" aria-label="Ranking" onKeyDown={onKey} className="flex h-[52px] w-full rounded-[10px] bg-canvas p-1 lg:h-10">
      {MODES.map((m) => {
        const on = m.id === mode;
        return (
          <button
            key={m.id}
            id={`${base}-${m.id}`}
            role="tab"
            type="button"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(m.id)}
            className={`relative flex-1 rounded-[8px] text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${on ? "text-canvas-text" : "text-canvas-muted hover:text-canvas-text"}`}
          >
            {on && (
              <motion.span
                layoutId={`${base}-thumb`}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }}
                className="absolute inset-0 rounded-[8px] bg-paper-raised"
                aria-hidden
              />
            )}
            <span className="relative">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function CompareRowItem({ row, openable, onOpen }: { row: CompareRow; openable: boolean; onOpen: (id: string) => void }) {
  const w = row.city?.winnability.value ?? null;
  const flagText = row.flag === "agrees" ? null : row.flag === "moved" ? `Qloo ranks it #${row.qlooRank}` : FLAG_TEXT[row.flag];
  const FlagArrow = row.direction === "up" ? ArrowUp : ArrowDown;
  const body = (
    <>
      <span className="w-6 shrink-0 self-start pt-0.5 font-mono text-[13px] tabular-nums text-canvas-muted">{row.llmRank}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-x-1.5">
          <span className="min-w-0 break-words text-[16px] font-semibold leading-tight text-canvas-text">{row.name}</span>
          <span className="shrink-0 text-[12px] text-canvas-muted">{row.country}</span>
        </span>
        {flagText && (
          <span data-testid="compare-flag" className="inline-flex items-center gap-1 text-[12px] leading-snug text-canvas-muted">
            {row.flag === "moved" && <FlagArrow size={12} className="shrink-0" aria-hidden />}{flagText}
          </span>
        )}
      </span>
      {row.city && <span className="shrink-0"><VerdictChip verdict={row.city.verdict} /></span>}
      <span className="w-8 shrink-0 text-right font-mono text-[18px] font-bold leading-none text-canvas-text tabular" aria-hidden={w === null ? undefined : true}>{w === null ? "—" : Math.round(w)}</span>
    </>
  );
  const rowCls = "flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left";
  return (
    <li data-testid="compare-row" className="bg-paper first:rounded-t-[14px] last:rounded-b-[14px]">
      {openable && row.city ? (
        <button type="button" onClick={() => onOpen(row.city!.id)} className={`${rowCls} min-h-14 rounded-[inherit] hover:bg-paper-raised focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold`}>{body}</button>
      ) : (
        <div className={rowCls}>{body}</div>
      )}
    </li>
  );
}

const LEGEND: Verdict[] = ["play", "hidden_goldmine", "de_risk", "consider", "skip", "insufficient_data"];

function Legend({ present }: { present: ReadonlySet<Verdict> }) {
  if (present.size === 0) return null;
  return (
    <div className="pointer-events-none absolute left-4 top-4 z-10 hidden flex-wrap items-center gap-x-4 gap-y-1 rounded-[8px] bg-canvas-raised px-3 py-2 lg:flex" aria-label="Map legend">
      {LEGEND.filter((v) => present.has(v)).map((v) => <span key={v} className="inline-flex items-center gap-1.5 text-[12px] text-canvas-text"><VerdictGlyph verdict={v} />{VERDICT_LABEL[v]}</span>)}
    </div>
  );
}

const secondaryBtn = "inline-flex h-12 items-center justify-center gap-2 rounded-[10px] bg-paper-raised px-5 text-[15px] font-semibold text-canvas-text hover:bg-[#3a3932] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold lg:h-10";
const smallBtn = "inline-flex min-h-11 items-center gap-1.5 rounded-[8px] bg-paper-raised px-3 text-[13px] font-semibold text-canvas-text hover:bg-[#3a3932] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

export default function TourBoard() {
  const { state, run, replay, abort, reset, shortlist, toggleShortlist } = useTourBoard();
  const reduce = useReducedMotion();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const sampleParam = params.get("sample");
  const wantLong = sampleParam === "long";
  const showParam = showcaseParam(params.get("showcase"));
  const wantShowcase = showParam !== null;
  const wantRouting = showParam === "routing" && showcaseRoutingAvailable();
  setShowcaseVariant(wantRouting ? "routing" : "main"); // before any accessor below reads the recording (see useShowcaseVariant)
  const wantSample = sampleParam === "1" || wantLong || wantShowcase;
  const wantNew = params.get("new") === "1";
  const sampleKey = `${sampleParam ?? ""}|${showParam ?? ""}`; // switching between examples on the same page starts the new one
  const started = useRef<string | null>(null);
  const modeParam = params.get("mode");
  const mode: Mode = modeParam === "density" || modeParam === "without" ? modeParam : "winnability";
  const setMode = (m: Mode) => setParams((p) => {
    const n = new URLSearchParams(p);
    if (m === "winnability") n.delete("mode"); else n.set("mode", m);
    return n;
  }, { replace: true });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [whyId, setWhyId] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  const [lastBrief, setLastBrief] = useState<TourBrief | undefined>(undefined);

  // ?sample=1 starts the showcase unless the provider already holds a sample run
  // (back-navigation). The ref only guards the StrictMode double effect.
  useEffect(() => {
    if (!wantSample || started.current === sampleKey) return;
    started.current = sampleKey;
    if (wantShowcase) {
      if (!showcaseAvailable()) return; // the private recording did not load: show the notice, never replay the placeholder as the showcase
      if (state.source !== "showcase" || isRoutingBrief(state.brief) !== wantRouting) run(showcaseBrief(), { sample: true, sampleSet: "showcase" });
    } else if (state.source !== "sample") run(wantLong ? LONG_NAMES_BRIEF : SAMPLE_BRIEF, { sample: true, sampleSet: wantLong ? "long" : "default" });
  }, [wantSample, wantLong, wantShowcase, wantRouting, state.source, state.brief, run]);

  // Once the sample params are gone (New brief), a later ?sample/?showcase link may start a run again.
  useEffect(() => { if (!wantSample) started.current = null; }, [wantSample]);

  // Entering the board with no run and no params opens the recorded example, so the first screen is never an empty form.
  // "Try your own artist" arrives with ?new=1 and gets the brief form instead.
  const autoExample = useWantsExample(!wantSample && !wantNew);
  useOpenExampleRun(autoExample);

  // A new run starts clean: no stale selection (the provider's reducer clears the shortlist on start).
  useEffect(() => {
    if (state.status !== "streaming") return;
    setSelectedId(null);
    setWhyId(null);
  }, [state.status, state.brief]);

  const newBrief = () => {
    setLastBrief(state.brief);
    reset();
    // ?new=1 keeps the brief form on screen instead of reopening the example.
    setParams((p) => { const n = new URLSearchParams(p); n.delete("sample"); n.delete("showcase"); n.delete("mode"); n.set("new", "1"); return n; }, { replace: true });
  };

  const sorted = useMemo(() => sortCities(state.cities, mode === "density" ? "density" : "winnability"), [state.cities, mode]);
  const counts = useMemo(() => summarize(state.cities), [state.cities]);
  // The shortlist sheet lists every Play or Hidden goldmine market plus every held city (a playbook can hold any verdict),
  // so each count on the page is the number of held cities that are listed.
  // With no Play or Hidden goldmine market at all, the Consider cities are holdable so the sheet still has a next action.
  const nonePlay = useMemo(() => !state.cities.some((c) => SHORTLIST_VERDICTS.has(c.verdict)), [state.cities]);
  const listed = useMemo(() => sortCities(state.cities, "winnability").filter((c) => SHORTLIST_VERDICTS.has(c.verdict) || (nonePlay && c.verdict === "consider") || shortlist.includes(c.id)), [state.cities, shortlist, nonePlay]);
  const heldCount = useMemo(() => listed.filter((c) => shortlist.includes(c.id)).length, [listed, shortlist]);
  const maxStops = state.brief?.maxStops ?? 8;
  const atCap = heldCount >= maxStops;
  // The recording the board holds decides what is openable, never the URL alone (the URL can lag a run switch).
  const variant: ShowcaseVariant = state.source === "showcase" ? variantOfBrief(state.brief) : wantRouting ? "routing" : "main";
  const sampleQ = state.source === "showcase" ? showcaseQuery(isRoutingBrief(state.brief)) : state.source === "sample" ? (state.sampleSet === "long" ? "?sample=long" : "?sample=1") : "";
  const bookHref = `/tours/book${sampleQ}`;
  const withoutMode = mode === "without";
  const isSample = state.source !== "live";
  const withoutLive = useQuery({
    queryKey: ["without-qloo", state.artist?.entityId ?? state.brief?.artistEntityId ?? state.brief?.artist, state.cities.map((c) => c.id).join("|")],
    queryFn: ({ signal }) => fetchWithoutQloo({
      artist: state.artist?.name ?? state.brief?.artist ?? "",
      // A pasted run has no regions of its own; the scored cities' countries stand in.
      regions: (state.brief ? effectiveRegions(state.brief, state.cities) : []).slice(0, 6),
      cities: state.cities.map((c) => ({ name: c.name, country: c.country })),
    }, { signal }),
    enabled: withoutMode && !isSample && state.status !== "streaming" && state.cities.length > 0,
    staleTime: Infinity,
    retry: false,
  });
  const withoutResult = state.source === "showcase"
    ? showcaseWithoutQloo(variant)
    : isSample
    ? (state.sampleSet === "long" && SAMPLE_WITHOUT_QLOO.status === "ok"
      ? { ...SAMPLE_WITHOUT_QLOO, ranked: SAMPLE_WITHOUT_QLOO.ranked.map((r) => {
          const id = SAMPLE_CITIES.find((c) => c.name === r.name)?.id;
          return { ...r, name: (id && LONG_CITY_NAMES[id]) || r.name };
        }) }
      : SAMPLE_WITHOUT_QLOO)
    : withoutLive.data;
  const compared = useMemo(() => (withoutResult?.status === "ok" ? compareWithQloo(withoutResult.ranked, state.cities) : []), [withoutResult, state.cities]);
  const topGeneric = withoutResult?.status === "ok" ? withoutResult.ranked[0]?.name : undefined;
  const agrees = !!topGeneric && !!sorted[0] && sameCity(topGeneric, sorted[0].name);
  const selected = withoutMode ? undefined : state.cities.find((c) => c.id === selectedId);
  const whyCity = state.cities.find((c) => c.id === whyId);
  const summaryCity = selected ?? sorted[0];
  const whyLabel = summaryCity ? (summaryCity.winnability.value === null ? `Why ${summaryCity.name} has no score?` : `Why ${summaryCity.name} scores ${Math.round(summaryCity.winnability.value)}?`) : "Why this score?";

  const retry = () => { if (state.brief) run(state.brief, { sample: isSample, sampleSet: state.source === "showcase" ? "showcase" : wantLong ? "long" : "default" }); };
  const showcase = () => {
    setShowcaseVariant("main");
    // Leaving the recorded routing for the main example: the URL must stop asking for the routing too.
    if (showParam === "routing") setParams((p) => { const n = new URLSearchParams(p); n.set("showcase", "1"); return n; }, { replace: true });
    if (showcaseAvailable()) run(showcaseBrief(), { sample: true, sampleSet: "showcase" });
    else run(SAMPLE_BRIEF, { sample: true, sampleSet: "default" });
  };
  const showcaseMissing = !showcaseAvailable() && (wantShowcase || state.source === "showcase");
  // A recorded run replays a few playbooks only: a row without one is not a link (live mode opens every city).
  const openable = (id: string) => state.source !== "showcase" || showcasePlaybookEvents(id, variant) !== null;
  const someUnopenable = state.source === "showcase" && state.cities.some((c) => !openable(c.id));
  const openRow = (id: string) => navigate(`/tours/playbook/${id}${sampleQ}`);
  const selectFromMap = (id: string) => {
    setSelectedId(id);
    document.getElementById(`city-row-${id}`)?.scrollIntoView?.({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  };

  if (showcaseMissing) return <ShowcaseUnavailable sampleHref="/tours/board?sample=1" />;

  // The example (or a ?sample/?showcase run) starts in an effect: hold the page's height meanwhile so the form never flashes and nothing jumps.
  if (state.status === "idle" && (autoExample || wantSample)) return <TourBoardSkeleton />;

  if (state.status === "idle") {
    return (
      <div className="flex flex-col gap-6">
        <BriefForm onSubmit={(b: TourBrief) => { run(b); if (wantNew) setParams((p) => { const n = new URLSearchParams(p); n.delete("new"); return n; }, { replace: true }); }} defaultBrief={lastBrief} />
        <div className="mx-auto flex w-full max-w-xl flex-col gap-2 border-t border-canvas-line pt-4">
          <p className="text-[13px] text-canvas-muted">Want to see it first? {showcaseAvailable() ? "The example tour replays a recorded Qloo run." : "The example tour runs on sample data."}</p>
          <button type="button" onClick={showcase} className={secondaryBtn}>See the example tour</button>
        </div>
      </div>
    );
  }

  if (state.status === "needs_input" && state.needsInput) {
    return (
      <NeedsInputPicker
        artist={state.brief?.artist}
        candidates={state.needsInput.candidates}
        onPick={(id) => { if (state.brief) run({ ...state.brief, artistEntityId: id }, { sample: isSample, sampleSet: state.source === "showcase" ? "showcase" : undefined }); }}
        onSearchAgain={newBrief}
      />
    );
  }

  const streaming = state.status === "streaming";
  const hasMap = state.cities.length > 0 || streaming;
  const artistName = state.artist?.name ?? state.brief?.artist ?? "Tour Board";
  // Pasted run: the cities that matched (the scored ones once done), never the pasted lines that matched nothing.
  const matchedCount = state.status === "done" ? state.cities.length : Math.max(0, (state.brief?.cities?.length ?? 0) - state.routingUnmatched.length);
  const regionsLine = isRoutingBrief(state.brief) ? `Your routing · ${matchedCount} ${matchedCount === 1 ? "city" : "cities"}` : state.brief?.regions.join(" · ");
  const showInlineLog = streaming && state.cities.length === 0;
  const empty = state.status === "done" && state.cities.length === 0;
  const scored = `${state.cities.length} ${state.cities.length === 1 ? "market" : "markets"} scored`;

  const verdictBits = [
    counts.play > 0 && <span key="p" className="text-verdict-play-text">{counts.play} Play</span>,
    counts.hidden_goldmine > 0 && <span key="g" className="text-gold">{counts.hidden_goldmine} Hidden goldmine</span>,
    counts.de_risk > 0 && <span key="d" className="text-verdict-derisk-text">{counts.de_risk} De-risk</span>,
  ].filter(Boolean);

  const body = (
    <div className="flex min-w-0 flex-col gap-3">
      {state.status === "interrupted" && (
        <Notice>
          <History size={14} className="text-state-stale" aria-hidden />
          <span className="min-w-0">{interruptedText(state.interruptReason)}</span>
          <button type="button" onClick={retry} className={smallBtn}>Retry</button>
          <button type="button" onClick={showcase} className={smallBtn}>See the example tour</button>
        </Notice>
      )}
      {state.status === "error" && state.error && (
        <Notice>
          <CircleAlert size={14} className="text-state-error" aria-hidden />
          <span className="min-w-0">{state.error.message}</span>
          {state.error.code === "NOT_FOUND" && <span className="min-w-0 text-canvas-muted">Check the spelling, or pick from the suggestions.</span>}
          {state.error.code !== "BUDGET" && state.error.code !== "ROUTING_EMPTY" && <button type="button" onClick={retry} className={smallBtn}>Retry</button>}
          <button type="button" onClick={showcase} className={smallBtn}>See the example tour</button>
        </Notice>
      )}
      {state.routingUnmatched.length > 0 && (
        <Notice>
          <CircleAlert size={14} className="text-state-stale" aria-hidden />
          <span className="min-w-0">{routingUnmatchedText(state.routingUnmatched)}</span>
        </Notice>
      )}
      {!empty && (state.regionsEmpty.length > 0 || state.regionsUnavailable.length > 0) && (
        <Notice>
          <span className="min-w-0">
            {regionNoticeText(state.regionsEmpty, state.regionsUnavailable)}
          </span>
        </Notice>
      )}

      {empty && (
        <section aria-label="No markets" className="flex flex-col gap-3 rounded-[14px] bg-paper p-4">
          <h2 className="text-[17px] font-semibold text-canvas-text">No markets scored</h2>
          <ul className="flex flex-col gap-1 text-[14px] text-canvas-text">
            {state.regionsEmpty.map((r) => <li key={`e-${r}`}>No Qloo signal in {r}</li>)}
            {state.regionsUnavailable.map((r) => <li key={`u-${r.region}`}>{r.region} unavailable: {r.message}</li>)}
            {state.regionsEmpty.length === 0 && state.regionsUnavailable.length === 0 && <li>Qloo returned no markets for this brief.</li>}
          </ul>
          <div className="flex flex-col gap-0.5 opacity-40" aria-hidden>
            {[0, 1, 2].map((i) => <div key={i} className="h-[72px] rounded-[10px] border border-dashed border-canvas-muted" />)}
          </div>
          <button type="button" onClick={newBrief} className={secondaryBtn}>Try other regions</button>
        </section>
      )}

      {(state.cities.length > 0 || streaming) && !empty && (
        <MovesSection cities={state.cities} scoring={state.scoring} done={state.status === "done"} paused={withoutMode} selectedId={selectedId} onSelect={selectFromMap} />
      )}

      {state.cities.length > 0 && (
        <>
          <SegmentedControl mode={mode} onChange={setMode} />
          {/* Reserves two lines (three in Without Qloo) so a mode change or a late answer never moves the list. */}
          <p data-testid="mode-note" className={`min-w-0 text-[12px] leading-[1.4] text-canvas-muted lg:text-[13px] ${withoutMode ? "min-h-[5.5rem] lg:min-h-[3.5rem]" : "min-h-[2.1rem] lg:min-h-[1.1rem]"}`}>
            {withoutMode ? (agrees ? `${WITHOUT_NOTE} ${WITHOUT_AGREES}` : WITHOUT_NOTE) : MODE_NOTE[mode]}
          </p>
          <p data-testid="board-summary" className="min-h-[2.1rem] min-w-0 text-[12px] leading-[1.4] text-canvas-muted lg:min-h-[1.1rem] lg:text-[13px]">
            {scored}{!withoutMode && verdictBits.map((b, i) => <span key={i}>{" · "}{b}</span>)}
            {streaming && " · still scoring"}
          </p>
        </>
      )}
      {streaming && state.cities.length === 0 && (
        <p role="status" className="text-[13px] text-canvas-muted">Scoring markets…</p>
      )}

      {streaming && state.source === "live" && <p data-testid="live-run-line" className="text-[12px] text-canvas-muted">{LIVE_RUN_LINE}</p>}

      {showInlineLog && <div data-testid="inline-log" className="h-[84px] overflow-hidden rounded-[14px] bg-paper p-3"><AgentLog events={state.log} latest={1} /></div>}

      {(state.cities.length > 0 || streaming) && (
        <div role="tabpanel" aria-label={PANEL_LABEL[mode]} data-tour="board-panel">
          {withoutMode && (
            <div className="flex flex-col gap-2 pb-24 lg:pb-0">
              <div className="flex items-center gap-2 rounded-[10px] bg-[#26251f] px-3 py-2 text-[13px] font-semibold text-canvas-text">
                <CircleAlert size={16} className="shrink-0 text-canvas-muted" aria-hidden />
                <span>Generic LLM answer — no taste evidence</span>
              </div>
              {streaming ? (
                <p role="status" className="text-[13px] text-canvas-muted">Waiting for the board to finish…</p>
              ) : withoutResult?.status === "ok" ? (
                <>
                  <p data-testid="without-summary" className="px-1 text-[13px] leading-[1.4] text-canvas-text">{disagreementLine(compared)}</p>
                  <ol aria-label="Generic ranking" className="flex flex-col gap-0.5">
                    {compared.map((r) => <CompareRowItem key={`${r.name}-${r.country}`} row={r} openable={!!r.city && openable(r.city.id)} onOpen={openRow} />)}
                  </ol>
                  <button type="button" onClick={() => setMode("winnability")} className="inline-flex min-h-11 w-fit items-center px-1 text-[13px] font-medium text-canvas-text underline-offset-[0.18em] hover:underline">Back to the Qloo ranking</button>
                </>
              ) : withoutResult?.status === "unavailable" || withoutLive.isError ? (
                <Notice>
                  <CircleAlert size={14} className="text-state-error" aria-hidden />
                  <span className="min-w-0">{withoutResult?.status === "unavailable" ? withoutResult.message : "Generic ranking unavailable"}</span>
                  {state.source === "live" && <button type="button" onClick={() => void withoutLive.refetch()} className={smallBtn}>Try again</button>}
                </Notice>
              ) : (
                <ul aria-hidden className="flex flex-col gap-0.5">
                  {[0, 1, 2, 3].map((i) => <li key={i} className="skeleton h-12 list-none first:rounded-t-[14px] last:rounded-b-[14px]" />)}
                </ul>
              )}
            </div>
          )}
          {!withoutMode && state.cities.length > 0 && (
            <div aria-hidden className={`mb-1 hidden grid-cols-1 gap-x-3 px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-canvas-muted lg:grid ${ROW_COLS_LG}`}>
              <span>City</span><span>Fan heat · Activation</span><span className="text-right">Verdict</span><span className="text-right">Win</span>
            </div>
          )}
          {!withoutMode && <ul className="flex flex-col gap-0.5">
            {sorted.map((c) => (
              <CityRow key={c.id} city={c} selected={c.id === selectedId} dimActivation={mode === "density"} onOpen={openRow} openable={openable(c.id)} />
            ))}
            {streaming && <li aria-hidden className="skeleton h-[88px] list-none rounded-[14px] lg:h-[72px]" />}
          </ul>}
          {!withoutMode && someUnopenable && !streaming && <p className="mt-2 px-1 text-[12px] text-canvas-muted">{recordedPlaybooksLine(showcasePlaybookCities(variant).length)}</p>}
        </div>
      )}
      {state.cities.length > 0 && (
        <div className="flex flex-col gap-1 pb-2">
          {!withoutMode && <p className="px-1 text-[12px] text-canvas-muted">{INTEGRITY_LINE}</p>}
          {!streaming && (
            <div className="flex flex-wrap items-center gap-x-4">
              <button type="button" onClick={newBrief} className="inline-flex min-h-11 w-fit items-center px-1 text-[13px] font-medium text-canvas-text underline-offset-[0.18em] hover:underline">New brief</button>
              <Link to="/insights" className="inline-flex min-h-11 w-fit items-center px-1 text-[13px] font-medium text-canvas-text underline-offset-[0.18em] hover:underline">Taste profile</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const footer = state.cities.length > 0 && (
    <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 bg-canvas-raised py-2 pl-3 pr-[68px] lg:bottom-0 lg:px-3 lg:justify-between lg:py-3">
      <span className="hidden min-w-0 text-[13px] text-canvas-muted lg:block">
        {heldCount} {heldCount === 1 ? "market" : "markets"} shortlisted
      </span>
      <NextStepButton leads="/tours/book" onClick={() => setBuildOpen(true)} className="btn-gold inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-[10px] px-5 text-[15px] font-semibold lg:h-10 lg:flex-none">
        Review shortlist<ArrowRight size={16} className="hidden lg:block" aria-hidden />
      </NextStepButton>
      {!withoutMode && <button type="button" onClick={() => summaryCity && setWhyId(summaryCity.id)} className="inline-flex min-h-11 shrink-0 items-center px-1 text-left text-[13px] font-medium leading-tight text-canvas-text underline-offset-[0.18em] hover:underline lg:hidden">
        <span className="line-clamp-2 max-w-[6.5rem]">{whyLabel}</span>
      </button>}
    </div>
  );

  const header = (
    <header data-tour="board-header" className={`flex min-w-0 flex-wrap items-center gap-x-3 bg-canvas-raised px-4 py-2 lg:px-6 lg:pb-2 lg:pt-5 ${hasMap ? "min-h-[48px]" : "rounded-[14px]"}`}>
      <div className="min-w-0 max-w-full basis-full">
        <h1 className="font-title truncate text-[17px] leading-tight text-canvas-text lg:text-[32px] lg:leading-[1.1]">{artistName}</h1>
        {regionsLine && <p className="truncate text-[13px] text-canvas-muted">{regionsLine}</p>}
      </div>
      <Link to="/proof" className="order-last inline-flex min-h-11 basis-full items-center font-mono text-[12px] text-canvas-muted underline-offset-4 hover:text-canvas-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold lg:order-none lg:basis-auto lg:flex-1">{PROOF_LINK_TEXT} →</Link>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {streaming && (
          <button type="button" onClick={abort} className={smallBtn}><Square size={12} aria-hidden />Stop</button>
        )}
        {state.source === "showcase" && !streaming && (
          <button type="button" onClick={replay} className={smallBtn}><RotateCcw size={12} aria-hidden />Replay the agent</button>
        )}
        <AgentLogChip events={state.log} onOpen={() => setLogOpen(true)} />
        {state.cities.length > 0 && <Link to={`/tours/budget${sampleQ}`} className="inline-flex min-h-11 items-center px-1 text-[13px] font-medium text-canvas-text underline-offset-[0.18em] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">Tour budget</Link>}
        {state.cities.length > 0 && <TeamBar cities={state.cities} tourThread="tour:board" />}
      </div>
    </header>
  );

  const sheets = (
    <>
      <Sheet open={logOpen} onClose={() => setLogOpen(false)} title="Agent log"><AgentLog events={state.log} /></Sheet>
      <Sheet open={!!whyCity} onClose={() => setWhyId(null)} title={whyCity ? `${whyCity.name} — why this score?` : "Why this score?"}>
        {whyCity && <WhyThisScore city={whyCity} scoring={state.scoring} clockRule={!!state.brief?.dateWindow} />}
      </Sheet>
      <Sheet open={buildOpen} onClose={() => setBuildOpen(false)} title="Holds">
        <div className="flex flex-col gap-3">
          {listed.length === 0 ? (
            <p className="text-[14px] text-canvas-muted">No Play or Hidden goldmine markets in this run.</p>
          ) : (
            <>
              {nonePlay && <p className="text-[13px] text-canvas-muted">None scored Play, so these are the Consider markets.</p>}
              <p className="text-[13px] tabular-nums text-canvas-muted">{heldCount} of max {maxStops} stops</p>
              <ul className="flex flex-col gap-0.5">
                {listed.map((c) => {
                  const checked = shortlist.includes(c.id);
                  const blocked = !checked && atCap;
                  return (
                    <li key={c.id}>
                      <label className={`flex min-h-11 items-center gap-3 rounded-[8px] bg-paper-raised px-3 ${blocked ? "opacity-60" : "cursor-pointer"}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={blocked}
                          aria-describedby={blocked ? "max-stops-hint" : undefined}
                          onChange={() => toggleShortlist(c.id)}
                          className="size-5 accent-[#ffcc00]"
                        />
                        <span className="min-w-0 flex-1 truncate text-[15px] text-canvas-text">{c.name}</span>
                        <VerdictChip verdict={c.verdict} />
                      </label>
                    </li>
                  );
                })}
              </ul>
              {listed.some((c) => !shortlist.includes(c.id)) && atCap && <p id="max-stops-hint" className="text-[13px] text-canvas-muted">Max stops reached — raise it in the brief</p>}
              <NextStepLink to={bookHref} className="btn-gold inline-flex h-12 items-center justify-center rounded-[10px] px-5 text-[15px] font-semibold lg:h-10">Open Tour Book</NextStepLink>
              {heldCount === 0 && <p className="text-[13px] text-canvas-muted">{nonePlay ? "Tick a market to build the book." : "Nothing held yet, so the book covers the default shortlist."}</p>}
            </>
          )}
        </div>
      </Sheet>
    </>
  );

  if (!hasMap) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        {isSample && <SampleBanner source={state.source} />}
        {header}
        {body}
        {sheets}
      </div>
    );
  }

  return (
    <div className="-mx-4 -mt-6 lg:-mx-8 lg:-my-8">
      {isSample && <SampleBanner source={state.source} />}
      <div className="grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-[auto_1fr]">
        <div className="lg:col-span-6 lg:col-start-7 lg:row-start-1 xl:col-span-5 xl:col-start-8">{header}</div>
        <section aria-label="Routing map" className="relative h-[28dvh] min-h-[168px] bg-canvas-raised lg:sticky lg:top-14 lg:col-span-6 lg:col-start-1 lg:row-span-2 xl:col-span-7 lg:row-start-1 lg:h-[calc(100dvh-56px)] lg:self-start">
          {!withoutMode && <Legend present={new Set(state.cities.map((c) => c.verdict))} />}
          <Suspense fallback={<div className="size-full bg-canvas-raised" />}>
            <TourMap cities={state.cities} selectedId={withoutMode ? null : selectedId} onSelect={selectFromMap} zones={selected?.zones} neutral={withoutMode} />
          </Suspense>
        </section>
        <section aria-label="Routing board" className="relative z-10 -mt-5 flex min-w-0 flex-col rounded-t-[18px] bg-canvas-raised lg:col-span-6 lg:col-start-7 lg:row-start-2 lg:mt-0 xl:col-span-5 xl:col-start-8 lg:rounded-none">
          <span className="mx-auto mb-0.5 mt-2 h-1 w-9 rounded-full bg-[#47443c] lg:hidden" aria-hidden />
          <div className="flex-1 px-2 pb-3 pt-1 lg:px-6">{body}</div>
          {footer}
        </section>
      </div>
      {sheets}
    </div>
  );
}
