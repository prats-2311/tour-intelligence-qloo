import { Check } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { journeyLinks, stepOf, STEPS, type StepId } from "@/lib/qloo/journey";
import { usePreloadWhenVisible } from "@/lib/routePreload";
import { useTourBoard } from "@/lib/qloo/TourBoardProvider";

type State = "done" | "current" | "todo";

function Marker({ n, state }: { n: number; state: State }) {
  const base = "flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-bold tabular-nums";
  if (state === "done") return <span aria-hidden className={`${base} bg-canvas-line text-bone`}><Check size={14} strokeWidth={3} /></span>;
  if (state === "current") return <span aria-hidden className={`${base} bg-gold text-on-gold`}>{n}</span>;
  return <span aria-hidden className={`${base} border border-canvas-muted text-canvas-muted`}>{n}</span>;
}

function Step({ id, label, n, state, to, preload, bottom }: { id: StepId; label: string; n: number; state: State; to: string; preload: boolean; bottom: boolean }) {
  const ref = usePreloadWhenVisible(preload ? to : null);
  const text = state === "todo" ? "text-canvas-muted" : "text-bone";
  const cls = bottom
    ? `relative flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold ${text}`
    : `relative flex h-11 items-center gap-2 rounded-lg px-2 font-sans text-[14px] font-medium outline-none transition-colors hover:text-bone focus-visible:ring-2 focus-visible:ring-gold ${text}`;
  return (
    <li className={bottom ? "flex flex-1" : "flex items-center"} data-step={id} data-state={state}>
      <Link ref={ref} to={to} aria-current={state === "current" ? "page" : undefined} className={cls}>
        {bottom && state === "current" && <span aria-hidden className="absolute top-0 h-[3px] w-6 bg-gold" />}
        <Marker n={n} state={state} />
        <span className={bottom ? "font-display text-[11px] uppercase tracking-[0.06em]" : ""}>{label}</span>
        {state === "done" && <span className="sr-only"> (done)</span>}
      </Link>
    </li>
  );
}

/** The four-step journey, same steps and order in the desktop top bar and the phone bottom bar. */
export function JourneyStepper({ variant }: { variant: "top" | "bottom" }) {
  const { pathname } = useLocation();
  const { state, shortlist, lastOpenedId } = useTourBoard();
  const links = journeyLinks({ status: state.status, source: state.source, sampleSet: state.sampleSet, cities: state.cities, shortlist, lastOpenedId });
  const current = stepOf(pathname);
  const at = current ? STEPS.findIndex((s) => s.id === current) : -1;
  const bottom = variant === "bottom";
  return (
    <ol className={bottom ? "m-0 flex h-16 list-none items-stretch justify-around p-0" : "m-0 flex list-none items-center gap-1 p-0"}>
      {STEPS.map((s, i) => (
        <Step
          key={s.id} id={s.id} label={s.label} n={i + 1} to={links[s.id]} bottom={bottom}
          state={i === at ? "current" : i < at ? "done" : "todo"}
          preload={at >= 0 && i === at + 1}
        />
      ))}
    </ol>
  );
}
