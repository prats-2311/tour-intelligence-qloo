import { useShowcaseVariant } from "@/lib/qloo/useShowcaseVariant";
import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { TasteInsightsSkeleton, TourBoardSkeleton, PlaybookSkeleton } from "./components/ui/Skeletons";
import { QlooWebMcpTools } from "./components/QlooWebMcpTools";
import { routeImports } from "./lib/routeImports";
import { TourProvider } from "./components/tour/TourProvider";

// Landing and every route ship as separate chunks so the initial bundle stays small; each gets a fixed-height
// skeleton fallback so a direct load never paints a blank page or jumps.
function LandingSkeleton() {
  return <div aria-hidden className="mx-auto min-h-[480px] w-full max-w-[1240px] rounded-[18px] bg-canvas-raised/40" />;
}
const Landing = lazy(routeImports.landing);
const TourBoard = lazy(routeImports.board);
const CityPlaybook = lazy(routeImports.playbook);
const Proof = lazy(routeImports.proof);
const TourBook = lazy(routeImports.book);
const TasteInsights = lazy(routeImports.insights);

export default function App() {
  useShowcaseVariant();
  return (
    <TourProvider>
      <QlooWebMcpTools />
      <AppShell>
        {/* Every lazy route gets its own Suspense + matching skeleton. A bare
            fallback={null} would show a blank page on a direct load (fresh
            visit, shared link, reload) until the route's chunk arrived. */}
        <Routes>
          <Route path="/" element={<Suspense fallback={<LandingSkeleton />}><Landing /></Suspense>} />
          <Route path="/tours/board" element={<Suspense fallback={<TourBoardSkeleton />}><TourBoard /></Suspense>} />
          <Route path="/tours/playbook/:cityId" element={<Suspense fallback={<PlaybookSkeleton />}><CityPlaybook /></Suspense>} />
          <Route path="/tours/book" element={<Suspense fallback={<PlaybookSkeleton />}><TourBook /></Suspense>} />
          <Route path="/proof" element={<Suspense fallback={<PlaybookSkeleton />}><Proof /></Suspense>} />
          <Route path="/insights" element={<Suspense fallback={<TasteInsightsSkeleton />}><TasteInsights /></Suspense>} />
          {/* Legacy campaign screens are gone; old links land on the board. */}
          {["/campaign", "/city/:cityId", "/compare", "/campaigns/new", "/cities/add"].map((path) => (
            <Route key={path} path={path} element={<Navigate to="/tours/board" replace />} />
          ))}
        </Routes>
      </AppShell>
    </TourProvider>
  );
}
