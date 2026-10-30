// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceProvider } from "@/lib/collab/WorkspaceProvider";
import { PLACEHOLDER_SHOWCASE } from "@/lib/qloo/placeholderShowcase";
import { parseShowcase, setShowcase } from "@/lib/qloo/showcase";
import { TourBoardProvider } from "@/lib/qloo/TourBoardProvider";
import { fakeCollabBackend } from "@/test/fakeCollabBackend";
import syntheticShowcase from "@/test/fixtures/showcase.synthetic.json";
import { TourProvider } from "./TourProvider";
import { useTour } from "./tourContext";

// The guided tour must land on each step's page even when the workspace provider writes `ws=` into the URL at the same moment.
vi.mock("@/components/qloo/TourMap", () => ({ default: () => <div data-testid="map" /> }));

const Where = () => { const l = useLocation(); return <output data-testid="where">{l.pathname}{l.search}</output>; };
const Starter = () => { const t = useTour(); return <button onClick={() => t?.startTour("plan")}>go</button>; };
const Away = () => { const nav = useNavigate(); return (<><Link to="/proof">away</Link><button onClick={() => nav(-1)}>back</button></>); };
const where = () => screen.getByTestId("where").textContent ?? "";

/** The recorded board with a workspace create held open, so the test decides when it resolves relative to the tour start. */
function mount() {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  const be = fakeCollabBackend();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "POST") await gate;
    return be.fetchImpl(input, init);
  }));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TourBoardProvider>
        <MemoryRouter initialEntries={["/tours/board?showcase=1"]}>
          <WorkspaceProvider>
            <TourProvider>
              <Starter /><Away />
              <Routes><Route path="*" element={<p>page</p>} /></Routes>
            </TourProvider>
          </WorkspaceProvider>
          <Where />
        </MemoryRouter>
      </TourBoardProvider>
    </QueryClientProvider>,
  );
  return release;
}

beforeEach(() => {
  window.localStorage.clear();
  setShowcase(parseShowcase(syntheticShowcase));
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollBy = vi.fn();
});
afterEach(() => { cleanup(); setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE)); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("tour navigation vs the workspace id arriving in the URL", () => {
  it("lands on the Charts page and keeps ws when the workspace is created in the same tick the tour starts", async () => {
    const release = mount();
    await act(async () => { await Promise.resolve(); });
    await act(async () => {
      screen.getByText("go").click();
      release();
      await new Promise((r) => setTimeout(r, 0));
    });
    await waitFor(() => expect(where()).toMatch(/ws=testws/));
    expect(where()).toMatch(/^\/tours\/insights\?/);
    expect(where()).toContain("showcase=1");
    await waitFor(() => expect(screen.getByTestId("tour-popover").textContent).toContain("Age groups, city by city"));
  });
  it("re-navigates when something else replaces the URL after the step started", async () => {
    const release = mount();
    release();
    await waitFor(() => expect(where()).toMatch(/ws=testws/));
    await act(async () => { screen.getByText("go").click(); });
    expect(where()).toMatch(/^\/tours\/insights\?/);
    expect(where()).toMatch(/ws=testws/);
  });
});

describe("the tour never fights the user", () => {
  const startAndReach = async () => {
    const release = mount();
    release();
    await waitFor(() => expect(where()).toMatch(/ws=testws/));
    await act(async () => { screen.getByText("go").click(); });
    await waitFor(() => expect(screen.getByTestId("tour-popover").textContent).toContain("Age groups, city by city"));
  };
  it("a link click after the step's page was reached ends the tour and stays where the user went", async () => {
    await startAndReach();
    await act(async () => { screen.getByText("away").click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(where()).toMatch(/^\/proof/);
    expect(screen.queryByTestId("tour-popover")).toBeNull();
    expect(window.localStorage.getItem("tiq.tour.plan")).toBe("dismissed");
  });
  it("the back button mid-tour ends the tour", async () => {
    await startAndReach();
    await act(async () => { screen.getByText("back").click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(where()).toMatch(/^\/tours\/board/);
    expect(screen.queryByTestId("tour-popover")).toBeNull();
  });
  it("a finished tour stays completed when the user walks away later", async () => {
    window.localStorage.setItem("tiq.tour.plan", "completed");
    await startAndReach();
    await act(async () => { screen.getByText("away").click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(screen.queryByTestId("tour-popover")).toBeNull();
    expect(window.localStorage.getItem("tiq.tour.plan")).toBe("completed");
  });
});
