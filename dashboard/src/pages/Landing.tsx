import { lazy, Suspense, useMemo } from "react";
import { Link } from "react-router-dom";
import { DualBars } from "@/components/qloo/DualBars";
import { SampleBanner } from "@/components/qloo/SampleBanner";
import { INTEGRITY_LINE } from "@/lib/qloo/labels";
import { NextStepLink } from "@/components/qloo/NextStep";
import { PROOF_LINK_TEXT } from "@/lib/qloo/backtest";
import { sortCities } from "@/lib/qloo/ranking";
import { SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { proofFor, rankShiftLine, SHOWCASE, showcaseAvailable, showcaseCities, showcaseRoutingAvailable } from "@/lib/qloo/showcase";
import { storyBeats } from "@/lib/qloo/story";
import type { ScoredCity } from "@/lib/qloo/types";
import { useIsDesktop } from "@/lib/useMediaQuery";
import { useTour } from "@/components/tour/tourContext";

export const HEADLINE = "Know which brands your artist's fans love in each city, before the sponsor meeting.";
export const SUBLINE = "In Los Angeles, Mac DeMarco's fans rank Stüssy #1. It isn't in LA's top 20. Qloo taste data, per city, for every stop on the routing.";
export const LINE2 = "Then see which cities to win first: fan heat and winnability for every market.";
export const TRY_ARTIST_LINE = "Type any artist; we build fresh city playbooks on the spot.";
export const TRY_ROUTING_LINE = "Replays a recorded run where a tour's cities were pasted, scored and ordered.";
export const PROTAGONIST = "In this example, it's Thursday and holds expire Friday. Confirm two of five secondary markets.";

const TourMap = lazy(() => import("@/components/qloo/TourMap"));

const GDL = SAMPLE_CITIES[2]!;
// The recording is fetched at boot and swaps SHOWCASE, so everything derived from it is a function read at render time, never a module constant.
// A real recording drives the card from its own data; the placeholder keeps the Guadalajara sample card.
const isRecorded = (): boolean => SHOWCASE.recordedAt !== null;
const boardCities = (): ScoredCity[] => (isRecorded() ? showcaseCities() : SAMPLE_CITIES);
const previewCities = (): ScoredCity[] => boardCities().filter((c) => c.verdict !== "insufficient_data");
const sampleLine = (): string => {
  const cities = previewCities();
  const rank = (mode: "density" | "winnability") => sortCities(cities, mode).findIndex((c) => c.id === GDL.id) + 1;
  return rankShiftLine(rank("density"), rank("winnability"), cities.length, boardCities().length);
};
// The recording's own scoring config (when it has one) drives the hero bars' ticks; otherwise the bars keep the default thresholds.
const recordedThresholds = () => SHOWCASE.boardEvents.find((e) => e.type === "scoring")?.scoring?.thresholds;
const noop = () => {};
const CTA = "flex min-h-[52px] items-center justify-center rounded-[10px] px-6 font-sans text-[16px] outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold active:scale-[0.98] motion-reduce:active:scale-100 lg:min-h-12 lg:text-[15px]";

function ProofCard() {
  const RECORDED = isRecorded();
  const proof = useMemo<{ city: ScoredCity; line: string } | null>(() => (RECORDED ? proofFor(showcaseCities(), Object.keys(SHOWCASE.playbooks)) : { city: GDL, line: sampleLine() }), [RECORDED]);
  if (!proof) return null;
  const { city: hero, line } = proof;
  return (
    <section aria-label={`${hero.name} ${RECORDED ? "recorded" : "sample"} routing row`} className="relative -mx-4 bg-paper px-4 py-4 hover:bg-paper-raised lg:mx-0 lg:rounded-[18px] lg:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h2 className="font-title text-[20px] leading-tight text-bone lg:text-[22px]">
              <Link to={`/tours/playbook/${hero.id}?${RECORDED ? "showcase" : "sample"}=1`} className="inline-flex min-h-11 items-center outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-gold lg:after:rounded-[18px]">{hero.name}</Link>
            </h2>
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-canvas-muted">{hero.country}</span>
          </div>
          <div className="mt-2"><SampleBanner compact source={RECORDED ? "showcase" : "sample"} /></div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span data-testid="proof-winnability" className="font-mono text-[28px] font-bold leading-none text-canvas-text tabular lg:text-4xl">{hero.winnability.value === null ? "—" : Math.round(hero.winnability.value)}</span>
        </div>
      </div>
      <div className="mt-4"><DualBars fanHeat={hero.fanHeat} activation={hero.activation} thresholds={recordedThresholds()} /></div>
      <p className="mt-3 text-[13px] text-canvas-muted">{line}</p>
      <p className="mt-2 text-[12px] text-canvas-muted">{INTEGRITY_LINE}</p>
    </section>
  );
}

const joinList = (xs: string[]): string => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

function Story() {
  const beats = storyBeats(SHOWCASE);
  if (!beats) return null;
  const { decision: d, mover: m, plan: p } = beats;
  const bill = p.coBill;
  const clauses = [p.sponsor && `pitch ${p.sponsor}`, bill && `put ${bill} on the bill`].filter(Boolean).join(", ");
  const steps = [
    { label: "The hold", text: `${d.artist}: ${d.markets} ${d.markets === 1 ? "market" : "markets"}${d.regions.length ? ` across ${joinList(d.regions)}` : ""}. Which ones get dates?` },
    { label: "Worth a second look", text: `${m.city} moves #${m.fanRank} → #${m.winRank} when you add winnability.` },
    { label: "How you win it", text: clauses ? `Its playbook: ${clauses}.` : "Its playbook: sponsor, venue and promo plan." },
  ];
  return (
    <ol aria-label="The story in three beats" className="grid list-none gap-4 p-0 md:grid-cols-3 md:gap-6 lg:col-span-12 lg:row-start-3 lg:mt-10">
      {steps.map((s) => (
        <li key={s.label} className="min-w-0">
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-canvas-muted">{s.label}</span>
          <p className="mt-1 text-[15px] leading-[1.45] text-canvas-text [text-wrap:pretty]">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}

function MapPreview() {
  const cities = useMemo(previewCities, []);
  return (
    <div className="h-[460px] overflow-hidden rounded-[18px] bg-canvas-raised" aria-hidden inert>
      <Suspense fallback={<div className="size-full bg-canvas-raised" />}>
        <TourMap cities={cities} onSelect={noop} />
      </Suspense>
    </div>
  );
}

export default function Landing() {
  const isDesktop = useIsDesktop();
  const tour = useTour();
  return (
    <div className="mx-auto grid w-full max-w-[1240px] gap-8 lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-0 lg:pt-6">
      <section className="lg:col-span-5 lg:col-start-1 lg:row-start-1 lg:pt-8">
        <h1 className="font-hero text-[32px] leading-[1.06] text-bone [text-wrap:balance] lg:text-[48px] lg:leading-[1.02]">
          {HEADLINE}
        </h1>
        <p className="mt-5 max-w-[44ch] text-[17px] leading-[1.45] text-canvas-muted [text-wrap:pretty] lg:mt-6">
          {SUBLINE}
        </p>
        <p className="mt-3 max-w-[44ch] text-[17px] leading-[1.45] text-canvas-muted [text-wrap:pretty]">
          {LINE2}
        </p>
      </section>
      <div className="lg:col-span-5 lg:col-start-1 lg:row-start-2 lg:mt-8 lg:self-start">
        <p data-testid="protagonist" className="mb-3 max-w-[44ch] text-[15px] leading-[1.45] text-canvas-text [text-wrap:pretty]">{PROTAGONIST}</p>
        <div className="flex flex-col gap-2.5 lg:flex-row lg:gap-4">
          <NextStepLink to="/tours/board?showcase=1" className={`${CTA} bg-gold font-semibold text-on-gold hover:bg-gold-soft active:bg-[#efb900]`}>See the example tour</NextStepLink>
          <div className="flex flex-col gap-1.5">
            <Link to="/tours/board?new=1" className={`${CTA} bg-paper-raised font-medium text-canvas-text hover:bg-[#3a3932]`}>Try your own artist</Link>
            <p className="max-w-[34ch] text-[13px] leading-[1.4] text-canvas-muted">{TRY_ARTIST_LINE}</p>
          </div>
        </div>
        {showcaseRoutingAvailable() && (
          <>
          <NextStepLink to="/tours/board?showcase=routing" className="mt-1 flex min-h-11 w-fit items-center text-[14px] text-canvas-text underline decoration-canvas-muted underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">Try a routing</NextStepLink>
          <p className="max-w-[44ch] text-[13px] leading-[1.4] text-canvas-muted">{TRY_ROUTING_LINE}</p>
          </>
        )}
        <Link to="/proof" className="mt-1 flex min-h-11 w-fit items-center text-[14px] text-canvas-text underline decoration-canvas-muted underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">{PROOF_LINK_TEXT} →</Link>
        {tour && showcaseAvailable() && <button type="button" data-testid="take-tour" onClick={tour.start} className="mt-1 flex min-h-11 w-fit items-center text-[14px] text-canvas-text underline decoration-canvas-muted underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">Take the tour</button>}
      </div>
      <Story />
      <div className="flex flex-col gap-6 lg:col-span-7 lg:col-start-6 lg:row-span-2 lg:row-start-1">
        {isDesktop && <MapPreview />}
        <ProofCard />
      </div>
    </div>
  );
}
