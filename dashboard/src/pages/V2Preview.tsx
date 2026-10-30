import { useState, type ReactNode } from "react";
import { isSampleMode } from "@/lib/qloo/client";
import { postV2Tap, readTaps, rememberTap, useStats, type TapAction, type V2Stats } from "@/lib/qloo/stats";
import { useTour } from "@/components/tour/tourContext";
import { SHOWCASE } from "@/lib/qloo/showcase";
import { fanRankLine, fit, rankLine } from "@/components/playbook/format";
import { Caption, Row, Rows, TagChips } from "@/components/playbook/cards/rows";
import { JOURNEY_LABELS, buildExperiences } from "@/lib/v2/experiences";
import {
  COMPARE_ROWS, EXAMPLE_PROFILE, HONEST_LIMITS, HYPOTHESES, OUTCOME_METRICS, isRecordShop, loadTasteLoop,
  type TasteLoopData,
} from "@/lib/v2/tasteLoop";

/** Skipped in sample mode (no gateway); never blocks the page. */
function useV2Stats() {
  return useStats("v2", !isSampleMode());
}

const META = "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted tabular-nums";
const FICTIONAL = "Fictional example";
const ILLUSTRATIVE = "Unclaimed";

function Tag({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "gold" }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium ${tone === "gold" ? "bg-gold text-on-gold" : "bg-paper-raised text-canvas-muted"}`}>{children}</span>;
}

function Card({ tour, meta, title, tag, children }: { tour: string; meta: string; title: string; tag?: ReactNode; children: ReactNode }) {
  return (
    <section data-tour={tour} aria-label={title} className="scroll-mt-20 rounded-[18px] bg-paper p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={META}>{meta}</p>
        {tag}
      </div>
      <h2 className="font-title mt-1 text-[22px] leading-tight text-canvas-text">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-canvas-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-[15px] text-canvas-text">{children}</dd>
    </div>
  );
}

function Hero({ onTour, canTour }: { onTour: () => void; canTour: boolean }) {
  return (
    <header data-tour="v2-hero" className="scroll-mt-20 rounded-[18px] bg-paper p-5 md:p-6">
      <p className="inline-flex rounded-full bg-gold px-3 py-1 text-[13px] font-semibold text-on-gold">Concept preview — not built yet</p>
      <h1 className="font-title mt-3 text-[32px] leading-[1.1] text-bone [text-wrap:balance] lg:text-[44px]">Taste Loop: the next version</h1>
      <p className="mt-3 max-w-[60ch] text-[16px] leading-[1.5] text-canvas-muted [text-wrap:pretty]">
        Today the app reads one artist's fans and suggests places and brands. The next version would also hear from the artist and the venues, ask fans to confirm what happened, and use those results to plan the next tour.
      </p>
      <button
        type="button"
        data-testid="take-v2-tour"
        onClick={onTour}
        disabled={!canTour}
        className="btn-gold mt-4 inline-flex h-11 items-center justify-center rounded-[10px] px-4 text-[14px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-40"
      >
        Take the v2 tour
      </button>
    </header>
  );
}

function Profile() {
  const p = EXAMPLE_PROFILE;
  return (
    <Card tour="v2-profile" meta="1 · Artist profile" title="What the artist tells us" tag={<Tag>{FICTIONAL}</Tag>}>
      <dl className="grid gap-3 sm:grid-cols-2">
        <Field label="Artist">{p.name}</Field>
        <Field label="Genre">{p.genre}</Field>
        <Field label="Sounds like">{p.soundsLike}</Field>
        <Field label="Dates in town">{p.datesInTown}</Field>
        <Field label="Loves"><TagChips tags={[...p.loves]} /></Field>
        <Field label="Won't work with"><TagChips tags={[...p.wontWorkWith]} /></Field>
      </dl>
      <Caption>These fields are made up. Nothing here describes Mac DeMarco or any real person; "sounds like" only points the match at that artist's real fans.</Caption>
    </Card>
  );
}

function Venues({ d }: { d: TasteLoopData }) {
  return (
    <Card tour="v2-venues" meta="2 · Venue profiles" title="What venues would tell us" tag={<Tag>{ILLUSTRATIVE}</Tag>}>
      {d.venues.length === 0 ? <Caption>No recording loaded, so there are no real venues to show.</Caption> : (
        <ul className="grid gap-3 md:grid-cols-3">
          {d.venues.map((v) => (
            <li key={v.name} className="rounded-[12px] bg-paper-raised p-3">
              <p className="break-words text-[15px] font-medium text-canvas-text">{v.name}</p>
              <p className="mt-1 text-[12px] text-canvas-muted">Real {d.city} place from the recording</p>
              <ul className="mt-2 space-y-1 text-[14px] text-canvas-text">
                <li>{v.collabs}</li>
                <li>{v.room}</li>
                <li>{v.freeNights}</li>
              </ul>
              <p className="mt-2"><Tag>Unclaimed: the venue fills this in</Tag></p>
            </li>
          ))}
        </ul>
      )}
      <Caption>Venues would claim their own profile. The places are real; the answers are left blank because only the venue can give them.</Caption>
    </Card>
  );
}

function Match({ d }: { d: TasteLoopData }) {
  const label = d.real ? `Real Qloo data: fans of ${d.artist} in ${d.city}, recorded ${d.recordedOn}` : "No recording loaded, so there is no real data to show.";
  return (
    <Card tour="v2-match" meta="3 · Match" title="Where the fans' taste points" tag={<Tag tone="gold">{label}</Tag>}>
      {d.real && (
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <h3 className="text-[13px] font-semibold text-canvas-muted">Brands</h3>
            <Rows>
              {d.brands.slice(0, 7).map((b) => (
                <Row
                  key={b.name}
                  name={b.name}
                  sub={b.noGo ? `Artist's no-go list: ${(b.category ?? "").toLowerCase()}` : undefined}
                  aside={b.noGo ? <s data-testid="no-go-item" className="text-canvas-muted">{b.fanRank !== null ? rankLine(b.fanRank, b.cityRank) : "Excluded"}</s> : b.fanRank !== null ? (b.cityRank === null ? fanRankLine(b.fanRank) : rankLine(b.fanRank, b.cityRank)) : "—"}
                />
              ))}
            </Rows>
          </div>
          <div>
            <h3 className="text-[13px] font-semibold text-canvas-muted">Places</h3>
            <Rows>
              {d.places.slice(0, 5).map((p, i) => (
                <Row key={p.name} name={p.name} sub={p.source === "venue_fit" ? "Venue fit" : "A place these fans love here"} aside={`#${i + 1} · fit ${fit(p.affinity)}`} />
              ))}
            </Rows>
          </div>
        </div>
      )}
      {d.real && d.brands.some((b) => b.noGo) && (
        <Caption>Crossed out: the fictional artist's no-go list is "{EXAMPLE_PROFILE.wontWorkWith.join(", ").toLowerCase()}", so those brands never reach the suggestion. Category matching uses a small hand-made map in the code.</Caption>
      )}
      <Caption>Brand ranks are how fans rank each one in {d.city}; "not in the city's top 20" means the city's own list does not include it.</Caption>
    </Card>
  );
}

function activationTitle(placeName: string): string {
  return isRecordShop(placeName) ? `Record-shop listening session at ${placeName}` : `Listening session at ${placeName}`;
}

function Act({ d }: { d: TasteLoopData }) {
  const place = d.topPlace;
  const brand = d.topBrand;
  const title = place ? activationTitle(place.name) : "Listening session";
  const evidence = [
    place ? `${place.name} is the top place for these fans in the recording (${place.source === "venue_fit" ? "venue fit" : "a place they love here"}).` : null,
    brand && brand.fanRank !== null ? `${brand.name}: ${brand.cityRank === null ? `fans rank it #${brand.fanRank} and it is not in the city's top 20` : `fans rank it #${brand.fanRank}, the city ranks it #${brand.cityRank}`}.` : null,
  ].filter((x): x is string => x !== null);
  const draft = `Hi${place ? ` ${place.name} team` : ""},\n\nWe're bringing a small listening session to ${d.city} during our dates in town. Fans of this sound already rank your space highly, so we'd love to host it with you${brand ? `, and possibly with ${brand.name} for a presale perk` : ""}.\n\nAre you open to a call about a free night?\n\nThanks,\n[Manager's name]`;
  return (
    <Card tour="v2-act" meta="4 · Act" title={title} tag={<Tag>{FICTIONAL} profile · {d.real ? "real match" : "no data"}</Tag>}>
      <h3 className="text-[13px] font-semibold text-canvas-muted">Evidence</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-[15px] text-canvas-text">
        {evidence.length ? evidence.map((e) => <li key={e}>{e}</li>) : <li>No recording loaded.</li>}
        <li>The suggestion respects the artist's no-go list.</li>
      </ul>
      <h3 className="mt-4 text-[13px] font-semibold text-canvas-muted">Outreach draft</h3>
      <pre data-testid="outreach-draft" className="mt-1 whitespace-pre-wrap break-words rounded-[12px] bg-paper-raised p-3 font-sans text-[14px] leading-[1.5] text-canvas-text">{draft}</pre>
      <Caption>Draft — the manager edits and sends.</Caption>
    </Card>
  );
}

function Experiences({ d }: { d: TasteLoopData }) {
  const items = buildExperiences(d);
  const [open, setOpen] = useState<string>(items[0]!.id);
  const chip = d.real ? `Real Qloo data, recorded ${d.recordedOn}` : "";
  return (
    <Card tour="v2-experiences" meta="5 · Experiences" title="Experiences fans could book" tag={<Tag>Concept</Tag>}>
      <p className="max-w-[64ch] text-[15px] leading-[1.5] text-canvas-text">
        Each experience starts from a Qloo signal — a place, brand, film or act these fans rank above the city — and is set up with venues that claim a profile. Prices and capacity are set by the artist and the venue.
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((x) => {
          const isOpen = open === x.id;
          return (
            <li key={x.id} data-testid="experience" className="rounded-[12px] bg-paper-raised">
              <h3>
                <button
                  type="button"
                  id={`exp-btn-${x.id}`}
                  aria-expanded={isOpen}
                  aria-controls={`exp-panel-${x.id}`}
                  onClick={() => setOpen(isOpen ? "" : x.id)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[12px] px-3 py-2 text-left text-[15px] font-semibold text-canvas-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                >
                  <span className="min-w-0 break-words">{x.name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Tag>{x.cost === "Free" ? "Free" : "Paid"}</Tag>
                    <span aria-hidden="true" className="text-canvas-muted">{isOpen ? "−" : "+"}</span>
                  </span>
                </button>
              </h3>
              <div id={`exp-panel-${x.id}`} role="region" aria-labelledby={`exp-btn-${x.id}`} hidden={!isOpen} className="px-3 pb-3">
                {isOpen && (
                  <>
                    <dl className="grid gap-3 sm:grid-cols-2">
                      <Field label="Starts from this Qloo signal">
                        {x.signal}
                        {x.example && (
                          <span className="mt-1 flex flex-wrap items-center gap-2">
                            <span data-testid="experience-example" className="font-medium">{x.example}</span>
                            <Tag tone="gold">{chip}</Tag>
                          </span>
                        )}
                      </Field>
                      <Field label="Who it suits">{x.suits}</Field>
                      <Field label="Free or paid">{x.cost}</Field>
                    </dl>
                    <h4 className="mt-4 text-[13px] font-semibold text-canvas-muted">Fan journey</h4>
                    <ol className="mt-2 space-y-2">
                      {x.journey.map((text, i) => (
                        <li key={JOURNEY_LABELS[i]} data-testid="journey-step" className="flex gap-3 text-[14px] leading-[1.45] text-canvas-text">
                          <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold text-[12px] font-semibold text-on-gold">{i + 1}</span>
                          <span className="min-w-0 break-words"><span className="font-semibold">{JOURNEY_LABELS[i]}.</span> {text}</span>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div data-testid="how-selling-works" className="mt-4 rounded-[12px] bg-paper-raised p-3">
        <h3 className="text-[13px] font-semibold text-canvas-muted">How selling works in v2</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-[14px] text-canvas-text">
          <li>Booking links live on the artist's channels.</li>
          <li>Payment goes through the venue's or artist's own ticketing.</li>
          <li>We never store card details or fan profiles.</li>
          <li>Every booking and "I was there" tap feeds the results panel.</li>
        </ul>
      </div>
      <Caption>These are ideas, not events. Nothing here has been offered to or agreed with any venue, brand or act named.</Caption>
    </Card>
  );
}

type Counts = V2Stats["byAction"];
const RSVP_EXPERIENCE = "listening";
const TAP_BUTTONS: ReadonlyArray<{ action: TapAction; label: string }> = [{ action: "going", label: "Going" }, { action: "waitlist", label: "Waitlist" }, { action: "was_there", label: "I was there" }];
const NO_PROTOTYPE_DATA = "No data yet — v2 collects this";
const PROTOTYPE_LABEL = "Prototype taps, not real fans";
const countsLine = (c: Counts) => `Going ${c.going} · Waitlist ${c.waitlist} · I was there ${c.was_there}`;

function Rsvp({ live, onTap }: { live: boolean; onTap: (a: TapAction) => void }) {
  const [tapped, setTapped] = useState<TapAction[]>(() => readTaps());
  const [busy, setBusy] = useState<TapAction | null>(null);
  const [note, setNote] = useState("");
  const btn = "inline-flex h-11 flex-1 items-center justify-center rounded-[10px] bg-paper-raised px-3 text-[14px] font-semibold text-canvas-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:text-canvas-muted disabled:opacity-70";
  const tap = async (action: TapAction) => {
    setBusy(action);
    setNote("");
    const ok = await postV2Tap(action, RSVP_EXPERIENCE);
    setBusy(null);
    if (!ok) return setNote("That tap did not go through. Try again in a moment.");
    rememberTap(action);
    setTapped((t) => [...new Set([...t, action])]);
    setNote("Counted. Thanks.");
    onTap(action);
  };
  return (
    <Card tour="v2-rsvp" meta="6 · Fans prove it" title="One tap, no account" tag={<Tag>{live ? "Prototype" : "Mock — not live"}</Tag>}>
      <div aria-label={live ? "Prototype RSVP card" : "Mock RSVP card"} className="max-w-[420px] rounded-[14px] bg-paper-raised p-4">
        <p className="text-[15px] font-semibold text-canvas-text">Listening session with Example artist</p>
        <p className="mt-0.5 text-[13px] text-canvas-muted">Date and place would appear here</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          {TAP_BUTTONS.map(({ action, label }) => (
            <button key={action} type="button" disabled={!live || busy !== null || tapped.includes(action)} aria-pressed={live ? tapped.includes(action) : undefined} onClick={() => void tap(action)} className={btn}>{label}</button>
          ))}
        </div>
        <p role="status" className="mt-2 min-h-[1.25rem] text-[13px] text-canvas-muted">{note}</p>
      </div>
      {live
        ? <Caption>Prototype: taps from visitors of this page, not real fans. Stored as anonymous counts in BigQuery. Each action can be tapped once per browser.</Caption>
        : <Caption>Mock — not live. The buttons do nothing and nothing is sent. Fans would not need an account, and we would not keep fan profiles.</Caption>}
    </Card>
  );
}

function Outcome({ counts }: { counts: Counts | null }) {
  const taps = counts ? counts.going + counts.waitlist + counts.was_there : 0;
  const rsvp = counts ? counts.going + counts.waitlist : 0;
  const prototype = (id: string): string | null => {
    if (!counts || taps === 0) return null;
    if (id === "rsvp") return `${counts.going} of ${rsvp} RSVP taps were Going`;
    if (id === "showup") return `${counts.was_there} I was there taps for ${counts.going} Going`;
    return null;
  };
  return (
    <Card tour="v2-outcome" meta="7 · Results" title="What v2 would measure" tag={<Tag>{counts ? "Prototype taps" : "No data yet"}</Tag>}>
      <ul className="grid gap-3 sm:grid-cols-2">
        {OUTCOME_METRICS.map((m) => {
          const proto = prototype(m.id);
          const tapMetric = m.id === "rsvp" || m.id === "showup";
          return (
            <li key={m.id} data-testid="outcome-metric" className="rounded-[12px] bg-paper-raised p-3">
              <p className="text-[15px] font-medium text-canvas-text">{m.label}</p>
              <p className="mt-0.5 text-[13px] text-canvas-muted">{m.who}</p>
              {counts && tapMetric
                ? (proto
                  ? <><p className="mt-2 text-[14px] font-semibold text-canvas-text">{proto}</p><p className="mt-0.5 text-[12px] text-canvas-muted">{PROTOTYPE_LABEL}</p></>
                  : <p className="mt-2 text-[14px] font-semibold text-canvas-text">No taps yet</p>)
                : <p className="mt-2 text-[14px] font-semibold text-canvas-text">{counts ? "No data yet — needs real venues and artists" : NO_PROTOTYPE_DATA}</p>}
            </li>
          );
        })}
      </ul>
      {counts && <p data-testid="prototype-counts" className="mt-3 text-[13px] text-canvas-muted">{countsLine(counts)} · {PROTOTYPE_LABEL}</p>}
      <h3 className="mt-4 text-[13px] font-semibold text-canvas-muted">Three things to test</h3>
      <ol className="mt-1 list-decimal space-y-1 pl-5 text-[15px] text-canvas-text">
        {HYPOTHESES.map((h) => <li key={h}>{h}</li>)}
      </ol>
    </Card>
  );
}

const STAGES = ["Profile", "Match", "Act", "Fans respond", "Learn"] as const;

function CycleDiagram() {
  const cx = 150, cy = 130, r = 90;
  const pts = STAGES.map((_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / STAGES.length; return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }; });
  return (
    <svg viewBox="0 0 300 260" role="img" aria-label="Cycle: Profile, Match, Act, Fans respond, Learn, then back to Profile" className="mx-auto w-full max-w-[340px]">
      <defs>
        <marker id="v2-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z" fill="#a4a094" /></marker>
      </defs>
      {pts.map((p, i) => {
        const n = pts[(i + 1) % pts.length]!;
        const dx = n.x - p.x, dy = n.y - p.y, len = Math.hypot(dx, dy);
        const s = 30 / len, e = 36 / len;
        return <line key={i} x1={p.x + dx * s} y1={p.y + dy * s} x2={n.x - dx * e} y2={n.y - dy * e} stroke="#a4a094" strokeWidth="1.5" markerEnd="url(#v2-arrow)" />;
      })}
      {pts.map((p, i) => (
        <g key={STAGES[i]}>
          <circle cx={p.x} cy={p.y} r="24" fill={i === STAGES.length - 1 ? "#ffcc00" : "#32312a"} stroke="#ffcc00" strokeWidth="1.5" />
          <text x={p.x} y={p.y - 1} textAnchor="middle" fontSize="9.5" fontWeight="600" fill={i === STAGES.length - 1 ? "#1d1a10" : "#f2f0ea"}>
            {STAGES[i]!.split(" ").map((w, j, a) => <tspan key={w} x={p.x} dy={j === 0 ? (a.length > 1 ? -2 : 4) : 11}>{w}</tspan>)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Loop() {
  return (
    <Card tour="v2-loop" meta="8 · Loop back" title="Results feed the next tour">
      <div className="grid items-center gap-4 md:grid-cols-2">
        <CycleDiagram />
        <ol className="list-decimal space-y-2 pl-5 text-[15px] text-canvas-text">
          <li>Turnout and would-rebook are written back to both the artist's and the venue's profile.</li>
          <li>The next tour's plan reads those records alongside Qloo's taste data.</li>
          <li>Over time the records become evidence that no general-purpose LLM has read.</li>
        </ol>
      </div>
    </Card>
  );
}

function Compare() {
  return (
    <section data-tour="v2-compare" aria-label="V1 today versus V2" className="scroll-mt-20 rounded-[18px] bg-paper p-4 md:p-5">
      <p className={META}>9 · V1 today vs V2</p>
      <h2 className="font-title mt-1 text-[22px] leading-tight text-canvas-text">What would change</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
          <thead>
            <tr className="text-[12px] text-canvas-muted">
              <th scope="col" className="py-2 pr-3 font-medium"> </th>
              <th scope="col" className="py-2 pr-3 font-medium">V1: today</th>
              <th scope="col" className="py-2 font-medium">V2: concept</th>
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map((r) => (
              <tr key={r.topic} className="border-t border-canvas-line align-top">
                <th scope="row" className="py-2 pr-3 font-semibold text-canvas-text">{r.topic}</th>
                <td className="py-2 pr-3 text-canvas-muted">{r.v1}</td>
                <td className="py-2 text-canvas-text">{r.v2}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="font-title mt-5 text-[18px] text-canvas-text">Honest limits</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] text-canvas-text">
        {HONEST_LIMITS.map((l) => <li key={l}>{l}</li>)}
      </ul>
    </section>
  );
}

export default function V2Preview() {
  const tour = useTour();
  const d = loadTasteLoop(SHOWCASE);
  return <V2Body d={d} tour={tour} />;
}

function V2Body({ d, tour }: { d: TasteLoopData; tour: ReturnType<typeof useTour> }) {
  const stats = useV2Stats();
  const [bumps, setBumps] = useState<Counts>({ going: 0, waitlist: 0, was_there: 0 });
  const counts: Counts | null = stats?.enabled ? { going: stats.byAction.going + bumps.going, waitlist: stats.byAction.waitlist + bumps.waitlist, was_there: stats.byAction.was_there + bumps.was_there } : null;
  return (
    <div className="mx-auto flex w-full max-w-[1000px] min-w-0 flex-col gap-5 pb-10">
      <Hero onTour={() => tour?.startV2()} canTour={!!tour} />
      <Profile />
      <Venues d={d} />
      <Match d={d} />
      <Act d={d} />
      <Experiences d={d} />
      <Rsvp live={!!counts} onTap={(a) => setBumps((b) => ({ ...b, [a]: b[a] + 1 }))} />
      <Outcome counts={counts} />
      <Loop />
      <Compare />
    </div>
  );
}
