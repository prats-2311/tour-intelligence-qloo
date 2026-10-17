import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import { TourBoardProvider } from "@/lib/qloo/TourBoardProvider";
import { loadRecordings } from "@/lib/qloo/recordings";
import App from "./App.tsx";

// staleTime > 0 means navigating back to a page you've already visited
// renders the cached data instantly instead of re-showing a loading
// skeleton -- this was the actual cause of "browsing feels slow", not
// bundle size. 30s is enough to cover a demo click-through; BigQuery-backed
// data here doesn't change fast enough to need shorter.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

// The real showcase and backtest recordings are private and served by the dashboard server. Load them before the
// first render so every page reads the real data; loadRecordings never throws and gives up after 4 s, in which
// case the pages fall back to their "unavailable" states.
void (async () => {
  await loadRecordings();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <TourBoardProvider>
            <App />
          </TourBoardProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
})();
