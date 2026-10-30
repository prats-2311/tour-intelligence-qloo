// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/AppShell";
import { TourProvider } from "@/components/tour/TourProvider";
import { PLACEHOLDER_SHOWCASE } from "@/lib/qloo/placeholderShowcase";
import { resetPlaybooks } from "@/lib/qloo/playbookStore";
import { parseShowcase, setShowcase, SHOWCASE } from "@/lib/qloo/showcase";
import { TourBoardProvider } from "@/lib/qloo/TourBoardProvider";
import { TOUR_STORAGE_KEY } from "@/lib/tour/tourStorage";
import { BRAND_CATEGORY, categoryOf, isNoGo } from "@/lib/v2/tasteLoop";
import { V2_TOUR_STEP_COUNT } from "@/lib/tour/v2TourSteps";
import syntheticShowcase from "@/test/fixtures/showcase.synthetic.json";
import Landing from "./Landing";
import V2Preview from "./V2Preview";

vi.mock("@/components/qloo/TourMap", () => ({ default: () => <div data-testid="map" /> }));

const SPONSORS = ["Stüssy", "OBEY", "Kith", "HUF", "Off-white", "Fear Of God", "Y-3"];
const VENUES = ["The Moroccan Lounge", "REDCAT ROY AND EDNA DISNEY/CALARTS THEATER", "The Smell"];

/** The synthetic recording with its first playbook relabelled as Los Angeles and filled with the recorded LA sponsor and venue names. */
function laShowcase() {
  const raw = JSON.parse(JSON.stringify(syntheticShowcase));
  const id = Object.keys(raw.playbooks)[0]!;
  for (const e of raw.boardEvents) if (e.type === "city_scored" && e.city.id === id) e.city.name = "Los Angeles";
  for (const e of raw.playbooks[id]) {
    if (e.type !== "playbook") continue;
    for (const c of e.playbook.cards) {
      const proto = c.items[0] ?? {};
      if (c.kind === "sponsors") c.items = SPONSORS.map((name, i) => ({ ...proto, name, artistRank: i + 1, cityRank: null }));
      if (c.kind === "venue_fit") c.items = VENUES.map((name, i) => ({ ...proto, name, category: "place", affinity: 0.94 - i / 100 }));
    }
  }
  raw.artist = "Mac DeMarco";
  raw.recordedAt = "2026-10-28T09:52:30.982Z";
  return raw;
}

beforeEach(() => {
  window.localStorage.clear();
  setShowcase(parseShowcase(laShowcase()));
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: !q.includes("prefers-reduced-motion"), addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function () { return [{ width: 10, height: 10 }] as unknown as DOMRectList; });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() => ({ top: 100, left: 100, width: 200, height: 80, right: 300, bottom: 180, x: 100, y: 100, toJSON() {} }));
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollBy = vi.fn();
});
afterEach(() => {
  cleanup();
  resetPlaybooks();
  setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const mount = (url = "/v2") => render(
  <QueryClientProvider client={new QueryClient()}>
    <TourBoardProvider>
      <MemoryRouter initialEntries={[url]}>
        <TourProvider>
          <AppShell>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/v2" element={<V2Preview />} />
            </Routes>
          </AppShell>
        </TourProvider>
      </MemoryRouter>
    </TourBoardProvider>
  </QueryClientProvider>,
);

describe("/v2 concept preview", () => {
  it("is labelled as a concept and the profile as fictional", () => {
    mount();
    expect(screen.getByText("Concept preview — not built yet")).toBeTruthy();
    expect(screen.getAllByText("Fictional example").length).toBeGreaterThan(0);
    expect(screen.getByText("Mac DeMarco", { selector: "dd" })).toBeTruthy();
    expect(screen.getByText(/Real Qloo data: fans of Mac DeMarco in Los Angeles, recorded 28 Oct 2026/)).toBeTruthy();
  });

  it("crosses out a no-go brand that is in the recorded sponsors list", () => {
    mount();
    const crossed = screen.getAllByTestId("no-go-item");
    expect(crossed.length).toBeGreaterThan(0);
    const row = crossed[0]!.closest("li")!;
    const name = SPONSORS.find((s) => row.textContent?.includes(s))!;
    expect(name).toBe("Off-white");
    const recorded = Object.values(SHOWCASE.playbooks).flat().flatMap((e) => (e.type === "playbook" ? e.playbook.cards : [])).filter((c) => c.kind === "sponsors").flatMap((c) => c.items.map((i) => i.name));
    expect(recorded).toContain(name);
    expect(within(row).getByText(/Artist's no-go list/)).toBeTruthy();
    expect(categoryOf(name)).toBe("Luxury fashion");
    // The match draws only on brands that are not crossed out for the suggestion.
    expect(screen.getByRole("heading", { name: /Listening session at The Moroccan Lounge/ })).toBeTruthy();
    expect(screen.getByTestId("outreach-draft").textContent).not.toContain("Off-white");
  });

  it("shows No data yet for every outcome metric and never a percent sign", () => {
    const { container } = mount();
    expect(screen.getAllByText("No data yet — v2 collects this")).toHaveLength(4);
    expect(container.querySelector("[data-tour='v2-outcome']")!.textContent).not.toContain("%");
    expect(container.textContent).not.toContain("%");
  });

  it("mocks the RSVP card with disabled buttons", () => {
    mount();
    for (const t of ["Going", "Waitlist", "I was there"]) expect((screen.getByRole("button", { name: t }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("has no active journey step", () => {
    const { container } = mount();
    expect(container.querySelectorAll("[data-step][data-state='current']")).toHaveLength(0);
    expect(container.querySelectorAll("[aria-current='page']")).toHaveLength(0);
  });

  it("has every section the tour points at", () => {
    const { container } = mount();
    for (const id of ["hero", "profile", "venues", "match", "act", "rsvp", "outcome", "loop", "compare"]) expect(container.querySelector(`[data-tour='v2-${id}']`)).toBeTruthy();
  });
});

describe("no-go category map", () => {
  it("only excludes brands whose category is on the list", () => {
    expect(isNoGo("Off-white")).toBe(true);
    expect(isNoGo("Fear Of God")).toBe(true);
    expect(isNoGo("Stüssy")).toBe(false);
    expect(isNoGo("Off-white", ["Sportswear"])).toBe(false);
    expect(Object.values(BRAND_CATEGORY).every((c) => c === "Luxury fashion")).toBe(true);
  });
});

describe("v2 tour", () => {
  const popover = () => screen.getByTestId("tour-popover");
  it("does not prompt, starts from the button, walks every step and stores only the v2 key", async () => {
    mount();
    expect(screen.queryByTestId("tour-prompt")).toBeNull();
    expect(screen.queryByTestId("tour-popover")).toBeNull();
    await act(async () => { fireEvent.click(screen.getByTestId("take-v2-tour")); });
    expect(screen.getByText(`1 of ${V2_TOUR_STEP_COUNT}`)).toBeTruthy();
    for (let i = 1; i < V2_TOUR_STEP_COUNT; i++) {
      await act(async () => { fireEvent.click(within(popover()).getByRole("button", { name: "Next" })); });
      expect(screen.getByText(`${i + 1} of ${V2_TOUR_STEP_COUNT}`)).toBeTruthy();
    }
    await act(async () => { fireEvent.click(within(popover()).getByRole("button", { name: "Done" })); });
    expect(screen.queryByTestId("tour-popover")).toBeNull();
    expect(window.localStorage.getItem(TOUR_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem("tiq.tour.v2")).toBe("completed");
  });

  it("Skip and Esc end it without touching the v1 key", async () => {
    mount();
    await act(async () => { fireEvent.click(screen.getByTestId("take-v2-tour")); });
    await act(async () => { fireEvent.click(within(popover()).getByRole("button", { name: "Next" })); });
    await act(async () => { fireEvent.click(within(popover()).getByRole("button", { name: "Skip" })); });
    expect(screen.queryByTestId("tour-popover")).toBeNull();
    await act(async () => { fireEvent.click(screen.getByTestId("take-v2-tour")); });
    await act(async () => { fireEvent.keyDown(document, { key: "Escape" }); });
    expect(screen.queryByTestId("tour-popover")).toBeNull();
    expect(window.localStorage.getItem(TOUR_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem("tiq.tour.v2")).toBe("dismissed");
  });
});

describe("landing link", () => {
  it("offers the concept preview after the proof link", () => {
    mount("/");
    const link = screen.getByRole("link", { name: /Preview: what's next \(concept\)/ });
    expect(link.getAttribute("href")).toBe("/v2");
  });
});
