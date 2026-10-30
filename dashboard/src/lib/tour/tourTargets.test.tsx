// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/AppShell";
import { OFF, WorkspaceContext, type Workspace } from "@/lib/collab/workspaceContext";
import { emptySnapshot, cityThread } from "@/lib/collab/types";
import { PLACEHOLDER_SHOWCASE } from "@/lib/qloo/placeholderShowcase";
import { resetPlaybooks } from "@/lib/qloo/playbookStore";
import { parseShowcase, setShowcase, showcaseCities } from "@/lib/qloo/showcase";
import { TourBoardProvider } from "@/lib/qloo/TourBoardProvider";
import syntheticShowcase from "@/test/fixtures/showcase.synthetic.json";
import Agents from "@/pages/Agents";
import CityPlaybook from "@/pages/CityPlaybook";
import Proof from "@/pages/Proof";
import TourBoard from "@/pages/TourBoard";
import TourBook from "@/pages/TourBook";
import TourBudget from "@/pages/TourBudget";
import TourInsights from "@/pages/TourInsights";
import V2Preview from "@/pages/V2Preview";
import { TOURS } from "./tours";

vi.mock("@/components/qloo/TourMap", () => ({ default: () => <div data-testid="map" /> }));

const show = () => parseShowcase(syntheticShowcase);

/** A workspace with the seeded pieces the team tour points at: a status, a resolved note and an override for every city. */
function seeded(): Workspace {
  const snap = emptySnapshot("demoworkspace1");
  const actor = { name: "Demo Tour Manager", role: "manager", at: Date.now(), demo: true };
  for (const c of showcaseCities(show())) {
    snap.statuses[c.id] = { status: "considering", ...actor };
    snap.threads[cityThread(c.id)] = { resolved: true, messages: [{ id: "m1", text: "Decision: hold the room", ...actor }] } as never;
    snap.overrides[c.id] = { top_zone: { value: "East side", original: "West side", ...actor } } as never;
  }
  return { ...OFF, enabled: true, ws: snap.ws, snapshot: snap, identity: { name: "Demo Tour Manager", role: "manager" } as never };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("strategistOpen", "1");
  setShowcase(show());
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("1024") || q.includes("1440") || q.includes("min-width"), addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function () { return [{ width: 10, height: 10 }] as unknown as DOMRectList; });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); resetPlaybooks(); setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE)); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const onScreen = (ids: string[]) => ids.filter((id) => Array.from(document.querySelectorAll<HTMLElement>("[data-tour]")).some((e) => e.dataset.tour === id && e.getClientRects().length > 0));

function mountRoute(route: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[route]}>
        <WorkspaceContext.Provider value={seeded()}>
          <TourBoardProvider>
            <AppShell>
              <Routes>
                <Route path="/tours/board" element={<TourBoard />} />
                <Route path="/tours/playbook/:cityId" element={<CityPlaybook />} />
                <Route path="/tours/book" element={<TourBook />} />
                <Route path="/tours/insights" element={<TourInsights />} />
                <Route path="/tours/budget" element={<TourBudget />} />
                <Route path="/proof" element={<Proof />} />
                <Route path="/agents" element={<Agents />} />
                <Route path="/v2" element={<V2Preview />} />
              </Routes>
            </AppShell>
          </TourBoardProvider>
        </WorkspaceContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The first target of a step that must exist on a recording with these pieces; later entries are fallbacks for thinner data. */
const PRIMARY: Record<string, string> = {
  "essentials/hook": "sponsors-top", "essentials/age": "sponsors-age", "essentials/pitch": "sponsors-pitch",
  "essentials/ask": "ask", "plan/age-matrix": "age-matrix", "plan/filters": "charts-filters", "plan/advance": "tab-advance",
  "plan/budget": "budget-header", "plan/chat": "chat-tools", "plan/compare": "sponsors-compare",
  "team/workspace": "team-bar", "team/status": "status-chip", "team/notes": "city-notes", "team/override": "override-team", "team/share": "team-share", "team/decisions": "chapter-team",
  "trust/agents": "agents-top", "trust/v2": "v2-hero",
};

describe("every tour step has a data-tour target on its rendered page", () => {
  for (const tour of TOURS) {
    for (const step of tour.steps(show())) {
      it(`${tour.id} / ${step.id}`, async () => {
        mountRoute(step.route);
        const want = PRIMARY[`${tour.id}/${step.id}`];
        await waitFor(() => expect(onScreen(want ? [want] : step.targets), `none of ${(want ? [want] : step.targets).join(", ")} on ${step.route}`).not.toEqual([]), { timeout: 4000 });
      });
    }
  }
});
