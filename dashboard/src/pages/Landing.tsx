import { lazy, Suspense, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { DualBars } from "@/components/qloo/DualBars";
import { SampleBanner } from "@/components/qloo/SampleBanner";
import { VerdictChip } from "@/components/qloo/VerdictChip";
import { INTEGRITY_LINE } from "@/lib/qloo/labels";
import { PROOF_LINK_TEXT } from "@/lib/qloo/backtest";
import { ordinal, sortCities } from "@/lib/qloo/ranking";
import { SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { proofFor, SHOWCASE, showcaseCities } from "@/lib/qloo/showcase";
import type { ScoredCity } from "@/lib/qloo/types";
import { useIsDesktop } from "@/lib/useMediaQuery";

const TourMap = lazy(() => import("@/components/qloo/TourMap"));

const GDL = SAMPLE_CITIES[2]!;
// The recording is fetched at boot and swaps SHOWCASE, so everything derived from it is a function read at render time, never a module constant.
// A real recording drives the card from its own data; the placeholder keeps the Guadalajara sample card.
const isRecorded = (): boolean => SHOWCASE.recordedAt !== null;
const previewCities = (): ScoredCity[] => (isRecorded() ? showcaseCities() : SAMPLE_CITIES).filter((c) => c.verdict !== "insufficient_data");
const sampleLine = (): string => {
  const cities = previewCities();
  const rank = (mode: "density" | "winnability") => sortCities(cities, mode).findIndex((c) => c.id === GDL.id) + 1;
  return `Ranked ${ordinal(rank("density"))} on fan density alone. ${ordinal(rank("winnability"))} on winnability.`;
};
// The recording's own scoring config (when it has one) drives the hero bars' ticks; otherwise the bars keep the default thresholds.
const recordedThresholds = () => SHOWCASE.boardEvents.find((e) => e.type === "scoring")?.scoring?.thresholds;
const noop = () => {};
const CTA = "flex min-h-[52px] items-center justify-center rounded-[10px] px-6 font-sans text-[16px] outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold active:scale-[0.98] motion-reduce:active:scale-100 lg:min-h-12 lg:text-[15px]";

function ProofCard() {
  const reduce = useReducedMotion();
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
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, duration: 0.18, ease: "easeOut" }}
          >
            <VerdictChip verdict={hero.verdict} />
          </motion.div>
          <span data-testid="proof-winnability" className="font-mono text-[28px] font-bold leading-none text-canvas-text tabular lg:text-4xl">{hero.winnability.value === null ? "—" : Math.round(hero.winnability.value)}</span>
        </div>
      </div>
      <div className="mt-4"><DualBars fanHeat={hero.fanHeat} activation={hero.activation} thresholds={recordedThresholds()} /></div>
      <p className="mt-3 text-[13px] text-canvas-muted">{line}</p>
      <p className="mt-2 text-[12px] text-canvas-muted">{INTEGRITY_LINE}</p>
    </section>
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
  return (
    <div className="mx-auto grid w-full max-w-[1240px] gap-8 lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-0 lg:pt-6">
      <section className="lg:col-span-5 lg:col-start-1 lg:row-start-1 lg:pt-8">
        <h1 className="font-hero text-[48px] leading-[1.04] text-bone [text-wrap:balance] lg:text-[88px] lg:leading-[0.95]">
          Win <br />their city.
        </h1>
        <p className="mt-5 max-w-[44ch] text-[17px] leading-[1.45] text-canvas-muted [text-wrap:pretty] lg:mt-6">
          Find the cities where your artist can win, then get the sponsor, venue and promo plan for each one. Built on Qloo taste data.
        </p>
      </section>
      <div className="flex flex-col gap-6 lg:col-span-7 lg:col-start-6 lg:row-span-2 lg:row-start-1">
        {isDesktop && <MapPreview />}
        <ProofCard />
      </div>
      <div className="lg:col-span-5 lg:col-start-1 lg:row-start-2 lg:mt-8 lg:self-start">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:gap-4">
          <Link to="/tours/board?showcase=1" className={`${CTA} bg-gold font-semibold text-on-gold hover:bg-gold-soft active:bg-[#efb900]`}>Try the showcase tour</Link>
          <Link to="/tours/board" className={`${CTA} bg-paper-raised font-medium text-canvas-text hover:bg-[#3a3932]`}>Plan your own</Link>
        </div>
        <Link to="/proof" className="mt-1 inline-flex min-h-11 items-center text-[14px] text-canvas-text underline decoration-canvas-muted underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">{PROOF_LINK_TEXT} →</Link>
      </div>
    </div>
  );
}
