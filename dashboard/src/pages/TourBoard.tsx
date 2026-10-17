import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CircleAlert, History, Square } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AgentLog, AgentLogChip } from "@/components/qloo/AgentLog";
import { BriefForm } from "@/components/qloo/BriefForm";
import { CityRow, ROW_COLS_LG } from "@/components/qloo/CityRow";
import { NeedsInputPicker } from "@/components/qloo/NeedsInputPicker";
import { ShowcaseUnavailable } from "@/components/qloo/ShowcaseUnavailable";
import { interruptedText, Notice, regionNoticeText } from "@/components/qloo/Notice";
import { SampleBanner } from "@/components/qloo/SampleBanner";
import { Sheet } from "@/components/qloo/Sheet";
import { VerdictChip } from "@/components/qloo/VerdictChip";
import { VerdictGlyph } from "@/components/qloo/VerdictGlyph";
import { WhyThisScore } from "@/components/qloo/WhyThisScore";
import { fetchWithoutQloo } from "@/lib/qloo/client";
import { LONG_CITY_NAMES, LONG_NAMES_BRIEF, SAMPLE_BRIEF, SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { SAMPLE_WITHOUT_QLOO } from "@/lib/qloo/fixtures/strategistSample";
import { showcaseAvailable, showcaseBrief, showcaseWithoutQloo } from "@/lib/qloo/showcase";
import { sortCities, summarize } from "@/lib/qloo/ranking";
import { useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { PROOF_LINK_TEXT } from "@/lib/qloo/backtest";
import { INTEGRITY_LINE, VERDICT_LABEL } from "@/lib/qloo/labels";
import type { TourBrief, Verdict } from "@/lib/qloo/types";

const TourMap = lazy(() => import("@/components/qloo/TourMap"));

type Mode = "winnability" | "density" | "without";
const MODES: Array<{ id: Mode; label: string }> = [
  { id: "winnability", label: "Winnability" },
  { id: "density", label: "Density-only" },
  { id: "without", label: "Without Qloo" },
];
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

function GenericRanking({ ranked }: { ranked: Array<{ name: string; country: string }> }) {
  return (
    <ol aria-label="Generic ranking" className="flex flex-col gap-0.5">
      {ranked.map((c, i) => (
        <li key={`${c.name}-${c.country}`} className="flex min-h-12 items-center gap-3 bg-paper px-3 first:rounded-t-[14px] last:rounded-b-[14px]">
          <span className="w-6 shrink-0 font-mono text-[13px] tabular-nums text-canvas-muted">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate text-[17px] font-semibold text-canvas-text">{c.name}</span>
          <span className="shrink-0 text-[13px] text-canvas-muted">{c.country}</span>
        </li>
      ))}
    </ol>
  );
}

const LEGEND: Verdict[] = ["play", "hidden_goldmine", "de_risk", "consider", "skip", "insufficient_data"];

function Legend() {
  return (
    <div className="pointer-events-none absolute left-4 top-4 z-10 hidden flex-wrap items-center gap-x-4 gap-y-1 rounded-[8px] bg-canvas-raised px-3 py-2 lg:flex" aria-label="Map legend">
      {LEGEND.map((v) => <span key={v} className="inline-flex items-center gap-1.5 text-[12px] text-canvas-text"><VerdictGlyph verdict={v} />{VERDICT_LABEL[v]}</span>)}
    </div>
  );
}

const secondaryBtn = "inline-flex h-12 items-center justify-center gap-2 rounded-[10px] bg-paper-raised px-5 text-[15px] font-semibold text-canvas-text hover:bg-[#3a3932] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold lg:h-10";
const smallBtn = "inline-flex min-h-11 items-center gap-1.5 rounded-[8px] bg-paper-raised px-3 text-[13px] font-semibold text-canvas-text hover:bg-[#3a3932] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

export default function TourBoard() {
  const { state, run, abort, reset, shortlist, toggleShortlist } = useTourBoard();
  const reduce = useReducedMotion();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const sampleParam = params.get("sample");
  const wantLong = sampleParam === "long";
  const wantShowcase = params.get("showcase") === "1";
  const wantSample = sampleParam === "1" || wantLong || wantShowcase;
  const started = useRef(false);
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
    if (!wantSample || started.current) return;
    started.current = true;
    if (wantShowcase) {
      if (!showcaseAvailable()) return; // the private recording did not load: show the notice, never replay the placeholder as the showcase
      if (state.source !== "showcase") run(showcaseBrief(), { sample: true, sampleSet: "showcase" });
    } else if (state.source !== "sample") run(wantLong ? LONG_NAMES_BRIEF : SAMPLE_BRIEF, { sample: true, sampleSet: wantLong ? "long" : "default" });
  }, [wantSample, wantLong, wantShowcase, state.source, run]);

  // A new run starts clean: no stale selection (the provider's reducer clears the shortlist on start).
  useEffect(() => {
    if (state.status !== "streaming") return;
    setSelectedId(null);
    setWhyId(null);
  }, [state.status, state.brief]);

  const newBrief = () => {
    setLastBrief(state.brief);
    reset();
    if (params.has("sample") || params.has("showcase") || params.has("mode")) setParams((p) => { const n = new URLSearchParams(p); n.delete("sample"); n.delete("showcase"); n.delete("mode"); return n; }, { replace: true });
  };

  const sorted = useMemo(() => sortCities(state.cities, mode === "density" ? "density" : "winnability"), [state.cities, mode]);
  const counts = useMemo(() => summarize(state.cities), [state.cities]);
  const eligible = useMemo(() => sortCities(state.cities, "winnability").filter((c) => SHORTLIST_VERDICTS.has(c.verdict)), [state.cities]);
  const maxStops = state.brief?.maxStops ?? 8;
  const atCap = shortlist.length >= maxStops;
  const sampleQ = state.source === "showcase" ? "?showcase=1" : state.source === "sample" ? (state.sampleSet === "long" ? "?sample=long" : "?sample=1") : "";
  const bookHref = `/tours/book${sampleQ}`;
  const withoutMode = mode === "without";
  const isSample = state.source !== "live";
  const withoutLive = useQuery({
    queryKey: ["without-qloo", state.artist?.entityId ?? state.brief?.artistEntityId ?? state.brief?.artist, state.cities.map((c) => c.id).join("|")],
    queryFn: ({ signal }) => fetchWithoutQloo({
      artist: state.artist?.name ?? state.brief?.artist ?? "",
      regions: state.brief?.regions ?? [],
      cities: state.cities.map((c) => ({ name: c.name, country: c.country })),
    }, { signal }),
    enabled: withoutMode && !isSample && state.status !== "streaming" && state.cities.length > 0,
    staleTime: Infinity,
    retry: false,
  });
  const withoutResult = state.source === "showcase"
    ? showcaseWithoutQloo()
    : isSample
    ? (state.sampleSet === "long" && SAMPLE_WITHOUT_QLOO.status === "ok"
      ? { ...SAMPLE_WITHOUT_QLOO, ranked: SAMPLE_WITHOUT_QLOO.ranked.map((r) => {
          const id = SAMPLE_CITIES.find((c) => c.name === r.name)?.id;
          return { ...r, name: (id && LONG_CITY_NAMES[id]) || r.name };
        }) }
      : SAMPLE_WITHOUT_QLOO)
    : withoutLive.data;
  const selected = withoutMode ? undefined : state.cities.find((c) => c.id === selectedId);
  const whyCity = state.cities.find((c) => c.id === whyId);
  const summaryCity = selected ?? eligible.find((c) => c.verdict === "hidden_goldmine") ?? sorted[0];

  const retry = () => { if (state.brief) run(state.brief, { sample: isSample, sampleSet: state.source === "showcase" ? "showcase" : wantLong ? "long" : "default" }); };
  const showcase = () => (showcaseAvailable()
    ? run(showcaseBrief(), { sample: true, sampleSet: "showcase" })
    : run(SAMPLE_BRIEF, { sample: true, sampleSet: "default" }));
  const showcaseMissing = !showcaseAvailable() && (wantShowcase || state.source === "showcase");
  const openRow = (id: string) => navigate(`/tours/playbook/${id}${sampleQ}`);
  const selectFromMap = (id: string) => {
    setSelectedId(id);
    document.getElementById(`city-row-${id}`)?.scrollIntoView?.({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  };

  if (showcaseMissing) return <ShowcaseUnavailable sampleHref="/tours/board?sample=1" />;

  if (state.status === "idle") {
    return (
      <div className="flex flex-col gap-6">
        <BriefForm onSubmit={(b: TourBrief) => run(b)} defaultBrief={lastBrief} />
        <div className="mx-auto flex w-full max-w-xl flex-col gap-2 border-t border-canvas-line pt-4">
          <p className="text-[13px] text-canvas-muted">Want to see it first? {showcaseAvailable() ? "The showcase tour replays a recorded Qloo run." : "The showcase tour runs on sample data."}</p>
          <button type="button" onClick={showcase} className={secondaryBtn}>Try the showcase tour</button>
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
  const regionsLine = state.brief?.regions.join(" · ");
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
        </Notice>
      )}
      {state.status === "error" && state.error && (
        <Notice>
          <CircleAlert size={14} className="text-state-error" aria-hidden />
          <span className="min-w-0">{state.error.message}</span>
          {state.error.code === "BUDGET"
            ? <button type="button" onClick={showcase} className={smallBtn}>Try the showcase tour</button>
            : <button type="button" onClick={retry} className={smallBtn}>Retry</button>}
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

      {state.cities.length > 0 && (
        <>
          <SegmentedControl mode={mode} onChange={setMode} />
          <p className="min-w-0 text-[12px] text-canvas-muted lg:text-[13px]">
            {scored}{!withoutMode && verdictBits.map((b, i) => <span key={i}>{" · "}{b}</span>)}
            {streaming && " · still scoring"}
          </p>
        </>
      )}
      {streaming && state.cities.length === 0 && (
        <p role="status" className="text-[13px] text-canvas-muted">Scoring markets…</p>
      )}

      {showInlineLog && <div className="rounded-[14px] bg-paper p-3"><AgentLog events={state.log} /></div>}

      {(state.cities.length > 0 || streaming) && (
        <div role="tabpanel" aria-label={PANEL_LABEL[mode]}>
          {withoutMode && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 rounded-[10px] bg-[#26251f] px-3 py-2 text-[13px] font-semibold text-canvas-text">
                <CircleAlert size={16} className="shrink-0 text-canvas-muted" aria-hidden />
                <span>Generic LLM answer — no taste evidence</span>
              </div>
              <p className="text-[13px] text-canvas-muted">No taste data. This is the ranking you'd get without Qloo.</p>
              {streaming ? (
                <p role="status" className="text-[13px] text-canvas-muted">Waiting for the board to finish…</p>
              ) : withoutResult?.status === "ok" ? (
                <GenericRanking ranked={withoutResult.ranked} />
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
              <CityRow key={c.id} city={c} selected={c.id === selectedId} dimActivation={mode === "density"} onOpen={openRow} />
            ))}
            {streaming && [0, 1, 2].slice(0, Math.max(1, 3 - Math.floor(sorted.length / 3))).map((i) => (
              <li key={`sk-${i}`} aria-hidden className="skeleton h-[88px] list-none first:rounded-t-[14px] last:rounded-b-[14px] lg:h-[72px]" />
            ))}
          </ul>}
        </div>
      )}
      {state.cities.length > 0 && (
        <div className="flex flex-col gap-1 pb-2">
          {!withoutMode && <p className="px-1 text-[12px] text-canvas-muted">{INTEGRITY_LINE}</p>}
          {!streaming && <button type="button" onClick={newBrief} className="inline-flex min-h-11 w-fit items-center px-1 text-[13px] font-medium text-canvas-text underline-offset-[0.18em] hover:underline">New brief</button>}
        </div>
      )}
    </div>
  );

  const footer = state.cities.length > 0 && !withoutMode && (
    <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 bg-canvas-raised px-3 py-2 lg:bottom-0 lg:justify-between lg:py-3">
      <span className="hidden min-w-0 text-[13px] text-canvas-muted lg:block">
        {shortlist.length} {shortlist.length === 1 ? "market" : "markets"} shortlisted
      </span>
      <button type="button" disabled={eligible.length === 0} onClick={() => setBuildOpen(true)} className="btn-gold inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-[10px] px-5 text-[15px] font-semibold lg:h-10 lg:flex-none">
        Build tour<ArrowRight size={16} className="hidden lg:block" aria-hidden />
      </button>
      <button type="button" onClick={() => summaryCity && setWhyId(summaryCity.id)} className="inline-flex min-h-11 shrink-0 items-center px-1 text-[13px] font-medium text-canvas-text underline-offset-[0.18em] hover:underline lg:hidden">
        Why this score?
      </button>
    </div>
  );

  const header = (
    <header className={`flex min-w-0 flex-wrap items-center gap-x-3 bg-canvas-raised px-4 py-2 lg:px-6 lg:pb-2 lg:pt-5 ${hasMap ? "min-h-[48px]" : "rounded-[14px]"}`}>
      <div className="min-w-0 max-w-full flex-1">
        <h1 className="font-title truncate text-[17px] leading-tight text-canvas-text lg:text-[32px] lg:leading-[1.1]">{artistName}</h1>
        {regionsLine && <p className="truncate text-[13px] text-canvas-muted">{regionsLine}</p>}
      </div>
      <Link to="/proof" className="order-last inline-flex min-h-11 basis-full items-center font-mono text-[12px] text-canvas-muted underline-offset-4 hover:text-canvas-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold lg:order-none lg:basis-auto">{PROOF_LINK_TEXT} →</Link>
      <div className="flex shrink-0 items-center gap-2">
        {streaming && (
          <button type="button" onClick={abort} className={smallBtn}><Square size={12} aria-hidden />Stop</button>
        )}
        <AgentLogChip events={state.log} onOpen={() => setLogOpen(true)} />
      </div>
    </header>
  );

  const sheets = (
    <>
      <Sheet open={logOpen} onClose={() => setLogOpen(false)} title="Agent log"><AgentLog events={state.log} /></Sheet>
      <Sheet open={!!whyCity} onClose={() => setWhyId(null)} title={whyCity ? `${whyCity.name} — why this score?` : "Why this score?"}>
        {whyCity && <WhyThisScore city={whyCity} scoring={state.scoring} />}
      </Sheet>
      <Sheet open={buildOpen} onClose={() => setBuildOpen(false)} title="Shortlist">
        <div className="flex flex-col gap-3">
          {eligible.length === 0 ? (
            <p className="text-[14px] text-canvas-muted">No Play or Hidden goldmine markets in this run.</p>
          ) : (
            <>
              <p className="text-[13px] tabular-nums text-canvas-muted">{shortlist.length} of max {maxStops} stops</p>
              <ul className="flex flex-col gap-0.5">
                {eligible.map((c) => {
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
              {eligible.some((c) => !shortlist.includes(c.id)) && atCap && <p id="max-stops-hint" className="text-[13px] text-canvas-muted">Max stops reached — raise it in the brief</p>}
              {shortlist.length > 0
                ? <Link to={bookHref} className="btn-gold inline-flex h-12 items-center justify-center rounded-[10px] px-5 text-[15px] font-semibold lg:h-10">Open Tour Book</Link>
                : <button type="button" disabled className="btn-gold inline-flex h-12 items-center justify-center rounded-[10px] px-5 text-[15px] font-semibold lg:h-10">Open Tour Book</button>}
            </>
          )}
          <Link to="/insights" className={secondaryBtn}>Compare in Taste Insights</Link>
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
      <div className="grid grid-cols-1 lg:grid-cols-12">
        <div className="lg:col-span-5 lg:col-start-8 lg:row-start-1">{header}</div>
        <section aria-label="Routing map" className="relative h-[32dvh] min-h-[168px] bg-canvas-raised lg:sticky lg:top-14 lg:col-span-7 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:h-[calc(100dvh-56px)] lg:self-start">
          {!withoutMode && <Legend />}
          <Suspense fallback={<div className="size-full bg-canvas-raised" />}>
            <TourMap cities={state.cities} selectedId={withoutMode ? null : selectedId} onSelect={selectFromMap} zones={selected?.zones} neutral={withoutMode} />
          </Suspense>
        </section>
        <section aria-label="Routing board" className="relative z-10 -mt-5 flex min-w-0 flex-col rounded-t-[18px] bg-canvas-raised lg:col-span-5 lg:col-start-8 lg:row-start-2 lg:mt-0 lg:rounded-none">
          <span className="mx-auto mb-0.5 mt-2 h-1 w-9 rounded-full bg-[#47443c] lg:hidden" aria-hidden />
          <div className="flex-1 px-2 pb-3 pt-1 lg:px-6">{body}</div>
          {footer}
        </section>
      </div>
      {sheets}
    </div>
  );
}
