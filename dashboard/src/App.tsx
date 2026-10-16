import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Dashboard } from "./pages/Dashboard";
import { CampaignProvider } from "./lib/campaignContext";
import { CityDetailSkeleton, CompareCitiesSkeleton, NewCampaignSkeleton, AddCitiesSkeleton } from "./components/ui/Skeletons";
import { WebMcpTools } from "./components/WebMcpTools";

// Dashboard (/campaign) is loaded eagerly. Landing and every other route ship
// as separate chunks so the initial bundle stays small; each gets a Suspense
// fallback so a direct load never paints a blank page.
function LandingSkeleton() {
  return <div aria-hidden className="mx-auto min-h-[480px] w-full max-w-[1240px] rounded-[18px] bg-canvas-raised/40" />;
}
const Landing = lazy(() => import("./pages/Landing"));
const TourBoard = lazy(() => import("./pages/TourBoard"));
const TasteInsights = lazy(() => import("./pages/TasteInsights"));
const CityDetail = lazy(() => import("./pages/CityDetail").then((m) => ({ default: m.CityDetail })));
const CompareCities = lazy(() => import("./pages/CompareCities").then((m) => ({ default: m.CompareCities })));
const NewCampaign = lazy(() => import("./pages/NewCampaign").then((m) => ({ default: m.NewCampaign })));
const AddCities = lazy(() => import("./pages/AddCities").then((m) => ({ default: m.AddCities })));

export default function App() {
  return (
    <CampaignProvider>
      <WebMcpTools />
      <AppShell>
        {/* Each lazy route gets its own Suspense + matching skeleton, not one
            shared fallback={null} -- a bare null meant a direct/hard load of
            any of these routes (a fresh visit, a shared link, a reload) showed
            a totally blank page for however long that route's JS chunk took
            to fetch, indistinguishable from the app being broken. */}
        <Routes>
          <Route path="/" element={<Suspense fallback={<LandingSkeleton />}><Landing /></Suspense>} />
          <Route path="/tours/board" element={<Suspense fallback={null}><TourBoard /></Suspense>} />
          <Route path="/insights" element={<Suspense fallback={null}><TasteInsights /></Suspense>} />
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
