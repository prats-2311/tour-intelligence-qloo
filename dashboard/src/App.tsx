import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Dashboard } from "./pages/Dashboard";
import { CampaignProvider } from "./lib/campaignContext";
import { CityDetailSkeleton, CompareCitiesSkeleton, NewCampaignSkeleton, AddCitiesSkeleton, TasteInsightsSkeleton, TourBoardSkeleton, PlaybookSkeleton } from "./components/ui/Skeletons";
import { WebMcpTools } from "./components/WebMcpTools";
import { QlooWebMcpTools } from "./components/QlooWebMcpTools";

// Dashboard (/campaign) is loaded eagerly. Landing and every other route ship
// as separate chunks so the initial bundle stays small; each gets a fixed-height
// skeleton fallback so a direct load never paints a blank page or jumps.
function LandingSkeleton() {
  return <div aria-hidden className="mx-auto min-h-[480px] w-full max-w-[1240px] rounded-[18px] bg-canvas-raised/40" />;
}
const Landing = lazy(() => import("./pages/Landing"));
const TourBoard = lazy(() => import("./pages/TourBoard"));
const CityPlaybook = lazy(() => import("./pages/CityPlaybook"));
const Proof = lazy(() => import("./pages/Proof"));
const TourBook = lazy(() => import("./pages/TourBook"));
const TasteInsights = lazy(() => import("./pages/TasteInsights"));
const CityDetail = lazy(() => import("./pages/CityDetail").then((m) => ({ default: m.CityDetail })));
const CompareCities = lazy(() => import("./pages/CompareCities").then((m) => ({ default: m.CompareCities })));
const NewCampaign = lazy(() => import("./pages/NewCampaign").then((m) => ({ default: m.NewCampaign })));
const AddCities = lazy(() => import("./pages/AddCities").then((m) => ({ default: m.AddCities })));

export default function App() {
  return (
    <CampaignProvider>
      <WebMcpTools />
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
          <Route path="/campaign" element={<Dashboard />} />
          <Route
            path="/city/:cityId"
            element={
              <Suspense fallback={<CityDetailSkeleton />}>
                <CityDetail />
              </Suspense>
            }
          />
          <Route
            path="/compare"
            element={
              <Suspense fallback={<CompareCitiesSkeleton />}>
                <CompareCities />
              </Suspense>
            }
          />
          <Route
            path="/campaigns/new"
            element={
              <Suspense fallback={<NewCampaignSkeleton />}>
                <NewCampaign />
              </Suspense>
            }
          />
          <Route
            path="/cities/add"
            element={
              <Suspense fallback={<AddCitiesSkeleton />}>
                <AddCities />
              </Suspense>
            }
          />
        </Routes>
      </AppShell>
    </CampaignProvider>
  );
}
