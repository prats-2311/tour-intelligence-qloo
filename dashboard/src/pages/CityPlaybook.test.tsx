// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "@/lib/qloo/client";
import { SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { samplePlaybookEvents } from "@/lib/qloo/fixtures/lumenValePlaybooks";
import { resetPlaybooks } from "@/lib/qloo/playbookStore";
import { TourBoardProvider, useTourBoard } from "@/lib/qloo/TourBoardProvider";
import CityPlaybook from "./CityPlaybook";

vi.mock("@/components/qloo/TourMap", () => ({ default: () => <div data-testid="map" /> }));

let desktop = false;
beforeEach(() => {
  desktop = false;
  vi.stubGlobal("matchMedia", () => ({ matches: desktop, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  cleanup();
  resetPlaybooks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function FillShortlist({ except }: { except: string }) {
  const { state, setShortlist } = useTourBoard();
  useEffect(() => {
    if (state.status === "done") setShortlist(SAMPLE_CITIES.filter((c) => c.id !== except).map((c) => c.id));
  }, [state.status, except, setShortlist]);
  return null;
}

function Switch({ to }: { to: string }) {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(to)}>switch</button>;
}

const renderAt = (url: string, extra?: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TourBoardProvider sampleDelayMs={0}>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tours/playbook/:cityId" element={<CityPlaybook />} />
            <Route path="/tours/board" element={<p>board</p>} />
          </Routes>
          {extra}
        </MemoryRouter>
      </TourBoardProvider>
    </QueryClientProvider>,
  );

describe("CityPlaybook", () => {
  it("renders the Guadalajara sample playbook standalone from ?sample=1", async () => {
    renderAt("/tours/playbook/4005539?sample=1");
    expect(await screen.findByRole("heading", { name: "Guadalajara" })).toBeTruthy();
    expect(screen.getByText("Sample data — illustrative, not Qloo output")).toBeTruthy();
    expect(await screen.findByText("Cerro Alto Mezcal is the strongest sponsor fit at 0.91.")).toBeTruthy();
    expect(screen.getByText("7 verified · 2 removed")).toBeTruthy();
    expect(screen.getByText("Colonia Americana", { selector: "dd" })).toBeTruthy();
    expect(screen.getByText("Affinity signal from aggregate taste data — not a ticket forecast or a claim about individuals.")).toBeTruthy();
  });
  it("shows an honest state on a deep link without a run", async () => {
    renderAt("/tours/playbook/4005539");
    expect(await screen.findByText("Open this city from a Tour Board")).toBeTruthy();
    expect(screen.getByText("Playbooks are built from a scored run.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to Tour Board" }).getAttribute("href")).toBe("/tours/board");
  });
  it("says when a sample city has no sample playbook and links the ones that do", async () => {
    renderAt("/tours/playbook/4887398?sample=1");
    expect(await screen.findByText("No sample playbook for Chicago")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Guadalajara" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Chicago" })).toBeTruthy();
  });
  it("re-runs when ?sample=long is switched to ?sample=1 on the same page", async () => {
    renderAt("/tours/playbook/3464975?sample=long", <Switch to="/tours/playbook/3464975?sample=1" />);
    expect(await screen.findByRole("heading", { name: "San Juan de los Lagos" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "switch" }));
    expect(await screen.findByRole("heading", { name: "Curitiba" })).toBeTruthy();
    // the board was re-run with the default set, so the playbook itself loads
    expect(await screen.findByText("Pinhão Roasters leads sponsor fit at 0.86.")).toBeTruthy();
  });
  it("keeps the current sample set in the NO_SAMPLE links", async () => {
    renderAt("/tours/playbook/4887398?sample=long");
    const link = await screen.findByRole("link", { name: "Guadalajara" });
    expect(link.getAttribute("href")).toBe("/tours/playbook/4005539?sample=long");
  });
  it("Add to tour toggles the city in the shortlist", async () => {
    renderAt("/tours/playbook/3995465?sample=1");
    const add = await screen.findByRole("button", { name: "Add to tour" });
    fireEvent.click(add);
    expect(screen.getByRole("button", { name: "Remove from tour" })).toBeTruthy();
  });
  it("at the max-stops cap Add to tour is disabled with the reason (R8)", async () => {
    renderAt("/tours/playbook/3995465?sample=1", <FillShortlist except="3995465" />);
    expect(await screen.findByText("Max stops reached — raise it in the brief")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Add to tour" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("tabs switch with arrow keys and Talent shows the talent card", async () => {
    renderAt("/tours/playbook/4005539?sample=1");
    const activate = await screen.findByRole("tab", { name: "Activate" });
    activate.focus();
    fireEvent.keyDown(activate, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Talent" }).getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByText(/Shared taste with Guadalajara's mainstream/)).toBeTruthy();
  });
  it("Culture and Delight tabs say the briefs come after saving a campaign", async () => {
    renderAt("/tours/playbook/4005539?sample=1");
    fireEvent.click(await screen.findByRole("tab", { name: "Culture" }));
    expect(screen.getByText("Culture and Delight briefs are written by the campaign agents after you save this tour as a campaign.")).toBeTruthy();
  });
  it("shows a page-level notice and evidence-only cards when the narrative is unavailable", async () => {
    vi.spyOn(client, "streamCityPlaybook").mockImplementation(async function* () {
      for (const e of samplePlaybookEvents("4005539")!) {
        yield e.type === "narrative" ? { type: "narrative", narrative: { status: "unavailable", reason: "error", message: "Narrative unavailable — showing Qloo evidence only" } } : e;
      }
    });
    renderAt("/tours/playbook/4005539?sample=1");
    expect(await screen.findByText("Narrative unavailable — showing Qloo evidence only")).toBeTruthy();
    expect(screen.queryByText("Cerro Alto Mezcal is the strongest sponsor fit at 0.91.")).toBeNull();
    expect(screen.getAllByText("Cerro Alto Mezcal").length).toBeGreaterThan(0);
  });
  it("budget error keeps the cards that arrived and says so", async () => {
    vi.spyOn(client, "streamCityPlaybook").mockImplementation(async function* () {
      yield samplePlaybookEvents("4005539")!.find((e) => e.type === "playbook")!;
      yield { type: "error", code: "BUDGET", message: "Session limit reached" };
    });
    renderAt("/tours/playbook/4005539?sample=1");
    expect(await screen.findByText("Session limit reached — try the showcase tour")).toBeTruthy();
    expect(screen.getAllByText("Cerro Alto Mezcal").length).toBeGreaterThan(0);
  });
  it("an unplaced city shows the plain explanation, no retry, and links back to the board", async () => {
    vi.spyOn(client, "streamCityPlaybook").mockImplementation(async function* () {
      yield { type: "error", code: "LOCATION_UNRESOLVED", message: "Qloo couldn't place Guadalajara precisely (2 lookups), so no playbook was built from its data." };
    });
    renderAt("/tours/playbook/4005539?sample=1");
    expect(await screen.findByText("Qloo couldn't place this city precisely, so we didn't score it.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByText("This playbook could not be built.")).toBeNull();
  });
  it("other errors show one sentence and Try again reloads the playbook", async () => {
    const spy = vi.spyOn(client, "streamCityPlaybook").mockImplementation(async function* () {
      yield { type: "error", code: "UPSTREAM", message: "boom" };
    });
    renderAt("/tours/playbook/4005539?sample=1");
    const retry = await screen.findByRole("button", { name: "Try again" });
    const calls = spy.mock.calls.length;
    fireEvent.click(retry);
    await waitFor(() => expect(spy.mock.calls.length).toBe(calls + 1));
  });
  it.each(["BUDGET", "HTTP_502"])("error %s links to the showcase tour", async (code) => {
    vi.spyOn(client, "streamCityPlaybook").mockImplementation(async function* () {
      yield { type: "error", code, message: "boom" };
    });
    renderAt("/tours/playbook/4005539?sample=1");
    const link = await screen.findByRole("link", { name: "Try the showcase tour" });
    expect(link.getAttribute("href")).toBe("/tours/board?showcase=1");
    expect(!!screen.queryByRole("button", { name: "Try again" })).toBe(code !== "BUDGET");
  });
  it("lays out the desktop grid with one Add to tour in the identity block", async () => {
    desktop = true;
    renderAt("/tours/playbook/4005539?sample=1");
    expect(await screen.findByRole("heading", { name: "Guadalajara" })).toBeTruthy();
    expect(await screen.findByText("Cerro Alto Mezcal is the strongest sponsor fit at 0.91.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Add to tour|Remove from tour/ })).toHaveLength(1);
  });
});

describe("CityPlaybook proof entry point", () => {
  it("links to the proof page with the explanatory line", async () => {
    renderAt("/tours/playbook/4005539?sample=1");
    const link = await screen.findByRole("link", { name: /Checked against real tours/ });
    expect(link.getAttribute("href")).toBe("/proof");
    expect(screen.getByText("How often this playbook surfaced the sponsor, merch partner or local act real tours used.")).toBeTruthy();
  });
});
