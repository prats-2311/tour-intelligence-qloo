import { Copy, Eraser, FlaskConical } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { NotesButton } from "@/components/collab/Notes";
import { NumField, Out, Section } from "@/components/budget/BudgetBits";
import { btn, fmt } from "@/lib/budget/format";
import { ShowcaseUnavailable } from "@/components/qloo/ShowcaseUnavailable";
import { EXAMPLE_BANNER, exampleBudget } from "@/lib/budget/example";
import { budgetCsv } from "@/lib/budget/csv";
import { buildLegs, legTotals, type Stop } from "@/lib/budget/legs";
import { blankCity, CURRENCIES, cityResult, copyCityToAll, tourResult, type Budget, type CityInputs, type Currency } from "@/lib/budget/math";
import { clearBudget, loadBudget, saveBudget } from "@/lib/budget/storage";
import { useAdvanceNotes } from "@/lib/budget/useAdvanceNotes";
import { LONG_NAMES_BRIEF, SAMPLE_BRIEF } from "@/lib/qloo/fixtures/lumenVale";
import { runKey } from "@/lib/qloo/journey";
import { playbookKey, usePlaybookSnapshot } from "@/lib/qloo/playbookStore";
import { defaultShortlist, sortCities } from "@/lib/qloo/ranking";
import { isRoutingBrief, setShowcaseVariant, showcaseAvailable, showcaseBrief, showcaseParam, showcaseQuery, showcaseRoutingAvailable } from "@/lib/qloo/showcase";
import { useOpenExampleRun, useWantsExample } from "@/lib/qloo/useOpenExampleRun";
import { useTourBoard } from "@/lib/qloo/TourBoardProvider";
import type { SampleSet, ScoredCity } from "@/lib/qloo/types";

const Centered = ({ children }: { children: React.ReactNode }) => <div className="mx-auto flex w-full max-w-md flex-col items-start gap-3 py-10">{children}</div>;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "tour";

export default function TourBudget() {
  const [params] = useSearchParams();
  if (showcaseParam(params.get("showcase")) !== null && !showcaseAvailable()) return <ShowcaseUnavailable sampleHref="/tours/budget?sample=1" />;
  return <TourBudgetPage />;
}

function TourBudgetPage() {
  const { state, run, shortlist } = useTourBoard();
  const [params] = useSearchParams();
  const sampleParam = params.get("sample");
  const wantLong = sampleParam === "long";
  const showParam = showcaseParam(params.get("showcase"));
  const wantShowcase = showParam !== null;
  const wantRouting = showParam === "routing" && showcaseRoutingAvailable();
  setShowcaseVariant(wantRouting ? "routing" : "main");
  const wantSample = sampleParam === "1" || wantLong || wantShowcase;
  const wantSet: SampleSet = wantShowcase ? "showcase" : wantLong ? "long" : "default";
  const routing = wantShowcase ? wantRouting : state.source === "showcase" && isRoutingBrief(state.brief);
  const sampleQ = wantShowcase ? showcaseQuery(wantRouting) : wantLong ? "?sample=long" : wantSample ? "?sample=1"
    : state.source === "showcase" ? showcaseQuery(isRoutingBrief(state.brief)) : state.source === "sample" ? (state.sampleSet === "long" ? "?sample=long" : "?sample=1") : "";
  const ws = params.get("ws");
  const href = (path: string) => `${path}${sampleQ}${ws ? `${sampleQ ? "&" : "?"}ws=${encodeURIComponent(ws)}` : ""}`;

  const bareExample = useWantsExample(!wantSample);
  useOpenExampleRun(bareExample);
  const started = useRef<string | null>(null);
  const setKey = `${wantSet}|${wantRouting}`;
  useEffect(() => {
    if (!wantSample || started.current === setKey) return;
    started.current = setKey;
    if (state.source === "live" || (state.sampleSet ?? "default") !== wantSet || (wantShowcase && isRoutingBrief(state.brief) !== wantRouting)) run(wantShowcase ? showcaseBrief() : wantLong ? LONG_NAMES_BRIEF : SAMPLE_BRIEF, { sample: true, sampleSet: wantSet });
  }, [wantSample, wantLong, wantSet, wantRouting, wantShowcase, setKey, state.source, state.sampleSet, state.brief, run]);

  const sample = state.source !== "live";
  const ready = !wantSample || (sample && (state.sampleSet ?? "default") === wantSet && (!wantShowcase || isRoutingBrief(state.brief) === wantRouting));
  const streaming = state.status === "streaming" || !ready || bareExample;
  const boardReady = ready && !streaming && !!state.artist && state.cities.length > 0;

  // Same shortlist and order as the Tour Book; with no shortlist, every board city.
  const stops = useMemo<ScoredCity[]>(() => {
    const ids = new Set(shortlist.length ? shortlist : defaultShortlist(state.cities, state.brief?.maxStops ?? 8));
    const picked = sortCities(state.cities, "winnability").filter((c) => ids.has(c.id));
    return picked.length ? picked : sortCities(state.cities, "winnability");
  }, [state.cities, state.brief?.maxStops, shortlist]);

  if (!boardReady) {
    return (
      <Centered>
        <h1 className="font-title text-[24px] leading-tight text-canvas-text">{streaming ? "Tour budget" : "Build a tour from a Tour Board first"}</h1>
        {streaming ? <p role="status" className="text-[13px] text-canvas-muted">Waiting for the board to finish…</p> : (
          <>
            <p className="text-[13px] text-canvas-muted">The budget uses the cities of a scored run and its shortlist.</p>
            <Link to="/tours/board" className={btn}>Go to Tour Board</Link>
          </>
        )}
      </Centered>
    );
  }
  const tourKey = runKey(state.source, state.sampleSet, state.artist?.name, routing);
  return <BudgetEditor key={tourKey} tourKey={tourKey} stops={stops} artist={state.artist!.name} artistId={state.artist!.entityId} sampleSet={state.sampleSet} variant={routing ? "routing" : undefined} boardHref={href("/tours/board")} bookHref={href("/tours/book")} />;
}

function SponsorSelect({ city, artistId, sampleSet, variant, value, onChange }: { city: ScoredCity; artistId: string; sampleSet?: SampleSet; variant?: "routing"; value: string; onChange: (v: string) => void }) {
  const pb = usePlaybookSnapshot(playbookKey(artistId, city.id, sampleSet, variant));
  const names = (pb?.cards.find((c) => c.kind === "sponsors")?.items ?? []).slice(0, 3).map((i) => i.name).filter((n): n is string => typeof n === "string" && n !== "");
  const options = value && !names.includes(value) ? [value, ...names] : names;
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[12px] text-canvas-muted">
      <span>Sponsor name</span>
      <select aria-label={`Sponsor name, ${city.name}`} value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-full min-w-0 rounded-[8px] bg-canvas px-2 text-[15px] text-canvas-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold">
        <option value="">No sponsor linked</option>
        {options.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  );
}

function BudgetEditor({ tourKey, stops, artist, artistId, sampleSet, variant, boardHref, bookHref }: { tourKey: string; stops: ScoredCity[]; artist: string; artistId: string; sampleSet?: SampleSet; variant?: "routing"; boardHref: string; bookHref: string }) {
  const ids = useMemo(() => stops.map((s) => s.id), [stops]);
  const [budget, setBudget] = useState<Budget>(() => loadBudget(tourKey, ids));
  const [copied, setCopied] = useState(false);
  const stopList: Stop[] = stops;
  const legs = useMemo(() => buildLegs(stopList), [stopList]);
  const totals = legTotals(legs);
  const tour = useMemo(() => tourResult(budget, stopList), [budget, stopList]);
  const notes = useAdvanceNotes(ids);
  const update = useCallback((fn: (b: Budget) => Budget) => setBudget((b) => { const next = fn(b); saveBudget(tourKey, next); return next; }), [tourKey]);
  const setCity = (id: string, k: keyof CityInputs, v: string) => update((b) => ({ ...b, cities: { ...b.cities, [id]: { ...(b.cities[id] ?? blankCity()), [k]: v } } }));
  const set = (k: "perDiem" | "crewSize" | "hotel" | "rooms", v: string) => update((b) => ({ ...b, [k]: v }));
  const csv = () => budgetCsv(budget, stopList);
  const copyCsv = async () => {
    try { await navigator.clipboard.writeText(csv()); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* clipboard unavailable: nothing honest to confirm */ }
  };
  const clear = () => { clearBudget(tourKey); setBudget(loadBudget("\u0000none", ids)); };

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-4 pb-24">
      <header className="flex min-w-0 flex-col gap-2">
        <h1 className="font-title text-[28px] leading-tight text-canvas-text lg:text-[32px]">Tour budget</h1>
        <p className="text-[13px] text-canvas-muted">{artist}. Your numbers, our maths, real distances: every amount is yours to type, we only work out the distances, travel days and totals. Saved in this browser only, never sent to a server.</p>
        <nav aria-label="Related pages" className="flex flex-wrap gap-2">
          <Link to={boardHref} className="inline-flex min-h-11 items-center px-1 text-[13px] font-medium text-canvas-text underline-offset-[0.18em] hover:underline">Tour Board</Link>
          <Link to={bookHref} className="inline-flex min-h-11 items-center px-1 text-[13px] font-medium text-canvas-text underline-offset-[0.18em] hover:underline">Tour Book</Link>
        </nav>
        {budget.example && <p role="note" className="flex items-center gap-2 rounded-[10px] bg-paper-raised px-3 py-2 text-[13px] font-medium text-canvas-text"><FlaskConical size={14} aria-hidden />{EXAMPLE_BANNER}</p>}
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[12px] text-canvas-muted">
            <span>Currency</span>
            <select aria-label="Currency" value={budget.currency} onChange={(e) => update((b) => ({ ...b, currency: e.target.value as Currency }))} className="h-11 rounded-[8px] bg-canvas-raised px-2 text-[15px] text-canvas-text focus-visible:outline-2 focus-visible:outline-gold">
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <button type="button" className={btn} onClick={() => update(() => exampleBudget(ids, legs.map((l) => l.key)))}><FlaskConical size={16} aria-hidden />Load example (fictional figures)</button>
          <button type="button" className={btn} onClick={() => void copyCsv()}><Copy size={16} aria-hidden />Copy as CSV</button>
          <button type="button" className={btn} onClick={clear}><Eraser size={16} aria-hidden />Clear budget</button>
        </div>
        <p className="text-[12px] text-canvas-muted">One currency per budget. No conversion between currencies is done.</p>
        <div aria-live="polite" className="empty:hidden">{copied && <p role="status" className="text-[13px] text-canvas-text">CSV copied</p>}</div>
      </header>

      <Section title="Routing legs" id="legs-h">
        <p className="text-[12px] text-canvas-muted">Distances are great-circle (straight line) between consecutive cities. Mode is an app assumption: drive up to 600 km, fly beyond; a driving day is counted as 700 km, a flight as 1 day. Real routes differ.</p>
        <div role="region" aria-label="Routing legs table" tabIndex={0} className="min-w-0 overflow-x-auto">
          <table aria-label="Routing legs" className="w-full min-w-[560px] border-collapse text-left text-[14px]">
            <thead><tr className="text-[12px] text-canvas-muted"><th scope="col" className="py-2 pr-3 font-medium">Leg</th><th scope="col" className="py-2 pr-3 font-medium">Km</th><th scope="col" className="py-2 pr-3 font-medium">Mode (assumption)</th><th scope="col" className="py-2 pr-3 font-medium">Travel days</th><th scope="col" className="py-2 font-medium">Travel cost ({budget.currency})</th></tr></thead>
            <tbody>
              {legs.map((l) => (
                <tr key={l.key} className="border-t border-paper-raised">
                  <th scope="row" className="py-2 pr-3 font-medium text-canvas-text">{l.fromName} → {l.toName}</th>
                  <td className="py-2 pr-3 tabular-nums">{l.km === null ? "—" : fmt(Math.round(l.km))}</td>
                  <td className="py-2 pr-3">{l.mode ?? "—"}</td>
                  <td className="py-2 pr-3 tabular-nums">{l.days ?? "—"}</td>
                  <td className="py-2"><input type="text" inputMode="decimal" autoComplete="off" aria-label={`Travel cost, ${l.fromName} to ${l.toName}`} value={budget.legs[l.key] ?? ""} onChange={(e) => update((b) => ({ ...b, legs: { ...b.legs, [l.key]: e.target.value } }))} className="h-11 w-32 rounded-[8px] bg-canvas px-3 text-[15px] tabular-nums text-canvas-text focus-visible:outline-2 focus-visible:outline-gold" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p data-testid="leg-totals" className="text-[14px] font-semibold tabular-nums text-canvas-text">{totals.legs} {totals.legs === 1 ? "leg" : "legs"} · {fmt(Math.round(totals.km))} km · {totals.days} travel {totals.days === 1 ? "day" : "days"}</p>
        {totals.unknown > 0 && <p className="text-[12px] text-canvas-muted">{totals.unknown} {totals.unknown === 1 ? "leg has" : "legs have"} no coordinates, so no distance.</p>}
      </Section>

      {stops.map((s) => {
        const c = budget.cities[s.id] ?? blankCity();
        const r = cityResult(c);
        const f = (k: keyof CityInputs) => (v: string) => setCity(s.id, k, v);
        return (
          <Section key={s.id} title={s.name} id={`city-${s.id}`}>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={btn} onClick={() => update((b) => copyCityToAll(b, s.id))} aria-label={`Copy this city's values to all cities (${s.name})`}>Copy this city's values to all cities</button>
              <NotesButton threadKey={`city:${s.id}`} title={s.name} label="Discuss" />
            </div>
            {(notes[s.id] ?? []).length > 0 && (
              <ul data-testid={`advance-note-${s.id}`} aria-label={`Advance risks for ${s.name}`} className="flex flex-col gap-1 rounded-[10px] bg-paper-raised px-3 py-2 text-[13px] text-canvas-text">
                {notes[s.id]!.map((n) => <li key={n}>Risk: {n}</li>)}
              </ul>
            )}
            <fieldset className="flex flex-col gap-2"><legend className="mb-1 text-[13px] font-semibold text-canvas-text">Costs ({budget.currency})</legend>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <NumField label="Artist fee" context={s.name} value={c.artistFee} onChange={f("artistFee")} />
                <NumField label="Venue costs" context={s.name} value={c.venue} onChange={f("venue")} />
                <NumField label="Production" context={s.name} value={c.production} onChange={f("production")} />
                <NumField label="Local crew" context={s.name} value={c.crew} onChange={f("crew")} />
                <NumField label="Marketing" context={s.name} value={c.marketing} onChange={f("marketing")} />
              </div>
            </fieldset>
            <fieldset className="flex flex-col gap-2"><legend className="mb-1 text-[13px] font-semibold text-canvas-text">Income</legend>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <NumField label="Ticket price" context={s.name} value={c.ticketPrice} onChange={f("ticketPrice")} suffix={budget.currency} />
                <NumField label="Capacity" context={s.name} value={c.capacity} onChange={f("capacity")} mode="numeric" />
                <NumField label="Sell-through %" context={s.name} value={c.sellThrough} onChange={f("sellThrough")} suffix="your estimate" />
                <NumField label="Merch per head" context={s.name} value={c.merchPerHead} onChange={f("merchPerHead")} suffix={budget.currency} />
                <NumField label="Sponsor contribution" context={s.name} value={c.sponsor} onChange={f("sponsor")} suffix={budget.currency} />
              </div>
              <div className="max-w-xs"><SponsorSelect city={s} artistId={artistId} sampleSet={sampleSet} variant={variant} value={c.sponsorName} onChange={f("sponsorName")} /></div>
            </fieldset>
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Out label="Cost" value={fmt(r.cost)} hint={r.hints.cost} testId={`result-${s.id}-cost`} hintId={`hint-cost-${s.id}`} />
              <Out label="Income" value={fmt(r.income)} hint={r.hints.income} testId={`result-${s.id}-income`} hintId={`hint-income-${s.id}`} />
              <Out label="Margin" value={fmt(r.margin)} hint={r.hints.margin} testId={`result-${s.id}-margin`} hintId={`hint-margin-${s.id}`} />
              <Out label="Break-even tickets" value={fmt(r.breakEven)} hint={r.hints.breakEven} testId={`result-${s.id}-breakEven`} hintId={`hint-breakEven-${s.id}`} />
            </dl>
            {r.overCapacity && <p className="text-[13px] text-canvas-text">Break-even is above the capacity you entered.</p>}
            <p className="text-[12px] text-canvas-muted">Break-even tickets = ceil((city costs − sponsor contribution) ÷ (ticket price + merch per head)).</p>
          </Section>
        );
      })}

      <Section title="Crew and hotels" id="crew-h">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <NumField label="Crew per diem" suffix={`${budget.currency} per person per day`} value={budget.perDiem} onChange={(v) => set("perDiem", v)} />
          <NumField label="Crew size" value={budget.crewSize} onChange={(v) => set("crewSize", v)} mode="numeric" />
          <NumField label="Hotel per night" suffix={budget.currency} value={budget.hotel} onChange={(v) => set("hotel", v)} />
          <NumField label="Rooms" value={budget.rooms} onChange={(v) => set("rooms", v)} mode="numeric" />
        </div>
        <p data-testid="nights" className="text-[13px] text-canvas-muted">Nights and per-diem days: {tour.nights} ({stops.length} show {stops.length === 1 ? "day" : "days"} + {totals.days} travel {totals.days === 1 ? "day" : "days"}).</p>
        <dl className="grid grid-cols-2 gap-3">
          <Out label="Per diems" value={fmt(tour.perDiemCost)} hint={tour.hints.perDiem} testId="total-perdiem" />
          <Out label="Hotels" value={fmt(tour.hotelCost)} hint={tour.hints.hotel} testId="total-hotel" />
        </dl>
      </Section>

      <Section title="Tour totals" id="totals-h">
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Out label="Legs travel" value={fmt(tour.legCost)} hint="Fill in travel cost for a leg to see it" testId="total-legs" />
          <Out label="Cost" value={fmt(tour.cost)} hint="Fill in at least one cost to see the tour cost" testId="total-cost" />
          <Out label="Income" value={fmt(tour.income)} hint={tour.hints.margin} testId="total-income" />
          <Out label="Margin" value={fmt(tour.margin)} hint={tour.hints.margin} testId="total-margin" />
        </dl>
        <p className="text-[12px] text-canvas-muted">Cost adds every amount you entered: city costs, leg travel, per diems and hotels. Income and margin appear once every city has ticket price, capacity and sell-through %.</p>
        <h3 className="text-[15px] font-semibold text-canvas-text">If sell-through were 60%, 80% or 100%</h3>
        <div role="region" aria-label="Sell-through sensitivity table" tabIndex={0} className="min-w-0 overflow-x-auto">
          <table aria-label="Margin at 60, 80 and 100 percent sell-through" className="w-full min-w-[420px] border-collapse text-left text-[14px]">
            <thead><tr className="text-[12px] text-canvas-muted"><th scope="col" className="py-2 pr-3 font-medium">Margin ({budget.currency})</th>{[60, 80, 100].map((p) => <th key={p} scope="col" className="py-2 pr-3 font-medium">{p}%</th>)}</tr></thead>
            <tbody>
              {stops.map((s) => { const r = cityResult(budget.cities[s.id] ?? blankCity()); return (
                <tr key={s.id} className="border-t border-paper-raised"><th scope="row" className="py-2 pr-3 font-medium text-canvas-text">{s.name}</th>{r.sensitivity.map((x) => <td key={x.pct} data-testid={`sens-${s.id}-${x.pct}`} className="py-2 pr-3 tabular-nums">{fmt(x.margin)}</td>)}</tr>
              ); })}
              <tr className="border-t border-paper-raised"><th scope="row" className="py-2 pr-3 font-semibold text-canvas-text">Tour total</th>{tour.sensitivity.map((x) => <td key={x.pct} data-testid={`sens-total-${x.pct}`} className="py-2 pr-3 font-semibold tabular-nums">{fmt(x.margin)}</td>)}</tr>
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-canvas-muted">Needs ticket price and capacity (and a cost) for a city; the tour total needs every city. Shared costs are included in the tour total.</p>
      </Section>
      <p className="text-[12px] text-canvas-muted">File name for the CSV: {slug(artist)}-budget.csv (paste into a sheet).</p>
    </div>
  );
}
