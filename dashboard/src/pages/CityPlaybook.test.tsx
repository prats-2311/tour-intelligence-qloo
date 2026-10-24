// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "@/lib/qloo/client";
import { SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { samplePlaybookEvents } from "@/lib/qloo/fixtures/lumenValePlaybooks";
import { parseShowcase, setShowcase } from "@/lib/qloo/showcase";
import { PLACEHOLDER_SHOWCASE } from "@/lib/qloo/placeholderShowcase";
import syntheticShowcase from "@/test/fixtures/showcase.synthetic.json";
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
  setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE));
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
  it("has only the two promoter tabs, How to win and Local acts, and Local acts shows the talent card", async () => {
    renderAt("/tours/playbook/4005539?sample=1");
    const first = await screen.findByRole("tab", { name: "How to win" });
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["How to win", "Local acts"]);
    expect(screen.queryByRole("tab", { name: /Culture|Delight|Activate|Talent/ })).toBeNull();
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Local acts" }).getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByText(/Shared taste with Guadalajara's mainstream/)).toBeTruthy();
  });
  it("never mentions the campaign flow", async () => {
    renderAt("/tours/playbook/4005539?sample=1");
    await screen.findByRole("tab", { name: "How to win" });
    expect(document.body.textContent).not.toMatch(/save this tour as a campaign/i);
  });
  it("shows the city name once in the header: the poster is decorative and sits after the score block on phones", async () => {
    renderAt("/tours/playbook/4005539?sample=1");
    const h1 = await screen.findByRole("heading", { name: "Guadalajara", level: 1 });
    expect(screen.queryByRole("img", { name: /poster/ })).toBeNull();
    const header = h1.closest("header")!;
    expect([...header.querySelectorAll("svg text")].filter((t) => /Guadalajara/.test(t.textContent ?? ""))).toHaveLength(0);
    const strip = header.querySelector("[data-testid='poster-strip']")!;
    expect(strip).toBeTruthy();
    expect(!!(h1.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(strip.getAttribute("aria-hidden")).toBe("true");
  });
  it("keeps the showcase flag on the back link", async () => {
    setShowcase(parseShowcase(syntheticShowcase));
    renderAt("/tours/playbook/3520339?showcase=1");
    const back = await screen.findByRole("link", { name: "Back to Tour Board" });
    expect(back.getAttribute("href")).toBe("/tours/board?showcase=1");
  });
  it("cards scroll sideways with a visible Swipe for more hint, and the scroller is keyboard reachable", async () => {
    renderAt("/tours/playbook/4005539?sample=1");
    await screen.findByText("Cerro Alto Mezcal is the strongest sponsor fit at 0.91.");
    expect(screen.getByText("Swipe for more")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Playbook cards" }).getAttribute("tabindex")).toBe("0");
  });
  it("when held, Remove from tour is secondary and the primary action moves on to the Tour Book", async () => {
    renderAt("/tours/playbook/3995465?sample=1");
    const add = await screen.findByRole("button", { name: "Add to tour" });
    expect(add.className).toMatch(/btn-gold/);
    expect(screen.queryByRole("link", { name: /^Next:/ })).toBeNull();
    fireEvent.click(add);
    const remove = screen.getByRole("button", { name: "Remove from tour" });
    expect(remove.className).not.toMatch(/btn-gold/);
    const next = screen.getByRole("link", { name: /^Next:/ });
    expect(next.className).toMatch(/btn-gold/);
  });
});

describe("CityPlaybook in showcase mode", () => {
  const recordedIds = () => Object.keys(parseShowcase(syntheticShowcase).playbooks);
  it("a city with no recorded playbook shows the explanation and a way back, no empty tiles", async () => {
    setShowcase(parseShowcase(syntheticShowcase));
    const missing = parseShowcase(syntheticShowcase).boardEvents.flatMap((e) => (e.type === "city_scored" ? [e.city] : [])).find((c) => !recordedIds().includes(c.id))!;
    renderAt(`/tours/playbook/${missing.id}?showcase=1`);
    expect(await screen.findByText(`Playbooks are recorded for ${recordedIds().length} cities in this example. Try your own artist to open any city.`)).toBeTruthy();
    expect(screen.getByRole("heading", { name: missing.name })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to the Tour Board" }).getAttribute("href")).toBe("/tours/board?showcase=1");
    expect(screen.queryByText("—")).toBeNull();
    expect(screen.queryByText("TOP ZONE")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });
});

describe("CityPlaybook (shared)", () => {
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
