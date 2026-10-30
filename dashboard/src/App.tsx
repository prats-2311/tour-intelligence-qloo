import { useShowcaseVariant } from "@/lib/qloo/useShowcaseVariant";
import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, Link } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { TasteInsightsSkeleton, TourBoardSkeleton, PlaybookSkeleton } from "./components/ui/Skeletons";
import { QlooWebMcpTools } from "./components/QlooWebMcpTools";
import { routeImports } from "./lib/routeImports";
import { TourProvider } from "./components/tour/TourProvider";
import { WorkspaceProvider } from "./lib/collab/WorkspaceProvider";

// Landing and every route ship as separate chunks so the initial bundle stays small; each gets a fixed-height
// skeleton fallback so a direct load never paints a blank page or jumps.
function LandingSkeleton() {
  return <div aria-hidden className="mx-auto min-h-[480px] w-full max-w-[1240px] rounded-[18px] bg-canvas-raised/40" />;
}
const Landing = lazy(routeImports.landing);
const TourBoard = lazy(routeImports.board);
const CityPlaybook = lazy(routeImports.playbook);
const TourBudget = lazy(routeImports.budget);
const Proof = lazy(routeImports.proof);
const PitchSheet = lazy(routeImports.pitch);
const TourBook = lazy(routeImports.book);
const TasteInsights = lazy(routeImports.insights);
const TourInsights = lazy(routeImports.tourInsights);
const V2Preview = lazy(routeImports.v2);
const Agents = lazy(routeImports.agents);

function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-start gap-3 py-10">
      <h1 className="font-title text-[24px] leading-tight text-canvas-text">Page not found</h1>
      <p className="text-[13px] text-canvas-muted">That address doesn't lead anywhere. The example tour is a good place to start.</p>
      <Link to="/" className="inline-flex h-12 min-h-11 items-center rounded-[8px] bg-paper-raised px-3 text-[13px] font-semibold text-canvas-text hover:bg-[#3a3932] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">Back to the example tour</Link>
    </div>
  );
}

export default function App() {
  useShowcaseVariant();
  return (
    <TourProvider>
      <WorkspaceProvider>
      <QlooWebMcpTools />
      <AppShell>
        {/* Every lazy route gets its own Suspense + matching skeleton. A bare
            fallback={null} would show a blank page on a direct load (fresh
            visit, shared link, reload) until the route's chunk arrived. */}
        <Routes>
          <Route path="/" element={<Suspense fallback={<LandingSkeleton />}><Landing /></Suspense>} />
          <Route path="/tours/board" element={<Suspense fallback={<TourBoardSkeleton />}><TourBoard /></Suspense>} />
          <Route path="/tours/playbook/:cityId" element={<Suspense fallback={<PlaybookSkeleton />}><CityPlaybook /></Suspense>} />
          <Route path="/tours/pitch/:cityId/:brand" element={<Suspense fallback={<PlaybookSkeleton />}><PitchSheet /></Suspense>} />
          <Route path="/tours/book" element={<Suspense fallback={<PlaybookSkeleton />}><TourBook /></Suspense>} />
          <Route path="/tours/budget" element={<Suspense fallback={<PlaybookSkeleton />}><TourBudget /></Suspense>} />
          <Route path="/proof" element={<Suspense fallback={<PlaybookSkeleton />}><Proof /></Suspense>} />
          <Route path="/tours/insights" element={<Suspense fallback={<TasteInsightsSkeleton />}><TourInsights /></Suspense>} />
          <Route path="/insights" element={<Suspense fallback={<TasteInsightsSkeleton />}><TasteInsights /></Suspense>} />
          <Route path="/v2" element={<Suspense fallback={<PlaybookSkeleton />}><V2Preview /></Suspense>} />
          <Route path="/agents" element={<Suspense fallback={<PlaybookSkeleton />}><Agents /></Suspense>} />
          {/* Legacy campaign screens are gone; old links land on the board. */}
          {["/campaign", "/city/:cityId", "/compare", "/campaigns/new", "/cities/add"].map((path) => (
            <Route key={path} path={path} element={<Navigate to="/tours/board" replace />} />
          ))}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppShell>
      </WorkspaceProvider>
    </TourProvider>
  );
}
