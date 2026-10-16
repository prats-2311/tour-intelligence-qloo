import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { DualBars } from "@/components/qloo/DualBars";
import { VerdictChip } from "@/components/qloo/VerdictChip";
import { SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { useIsDesktop } from "@/lib/useMediaQuery";

const TourMap = lazy(() => import("@/components/qloo/TourMap"));

const GDL = SAMPLE_CITIES[2]!;
const noop = () => {};
const CTA = "flex min-h-[52px] items-center justify-center rounded-[10px] px-6 font-sans text-[16px] outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold active:scale-[0.98] motion-reduce:active:scale-100 lg:min-h-12 lg:text-[15px]";

function ProofCard() {
  const reduce = useReducedMotion();
  return (
    <section aria-label="Guadalajara sample routing row" className="-mx-4 bg-paper px-4 py-4 lg:mx-0 lg:rounded-[18px] lg:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h2 className="font-title text-[20px] leading-tight text-bone lg:text-[22px]">{GDL.name}</h2>
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-canvas-muted">{GDL.country}</span>
          </div>
          <span className="mt-1 block font-mono text-[11px] uppercase tracking-[0.08em] text-canvas-muted">Sample</span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, duration: 0.18, ease: "easeOut" }}
          >
            <VerdictChip verdict={GDL.verdict} />
          </motion.div>
          <span className="font-mono text-[28px] font-bold leading-none text-canvas-text tabular lg:text-4xl">{Math.round(GDL.winnability.value ?? 0)}</span>
        </div>
      </div>
      <div className="mt-4"><DualBars fanHeat={GDL.fanHeat} activation={GDL.activation} /></div>
      <p className="mt-3 text-[13px] text-canvas-muted">Ranked 6th on fan density alone. 3rd on winnability.</p>
    </section>
  );
}

function MapPreview() {
  // TourMap fits bounds once per city-set change; handing it the cities one
  // frame after mount makes the fit run against the settled container size.
  const [cities, setCities] = useState<typeof SAMPLE_CITIES>([]);
  useEffect(() => {
    const id = setTimeout(() => setCities(SAMPLE_CITIES), 300);
    return () => clearTimeout(id);
  }, []);
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
        <h1 className="font-title text-[48px] leading-[1.04] tracking-[-0.03em] text-bone [text-wrap:balance] lg:text-[88px] lg:leading-[0.95]">
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
          <Link to="/tours/board?sample=1" className={`${CTA} bg-gold font-semibold text-on-gold hover:bg-gold-soft active:bg-[#efb900]`}>Try the showcase tour</Link>
          <Link to="/tours/board" className={`${CTA} bg-paper-raised font-medium text-canvas-text hover:bg-[#3a3932]`}>Plan your own</Link>
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-canvas-muted lg:mt-6">Affinity signal from aggregate taste data — not a ticket forecast.</p>
      </div>
    </div>
  );
}
