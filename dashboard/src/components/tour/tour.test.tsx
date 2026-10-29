// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetPlaybooks } from "@/lib/qloo/playbookStore";
import { PLACEHOLDER_SHOWCASE } from "@/lib/qloo/placeholderShowcase";
import { computeMoves } from "@/lib/qloo/moves";
import { parseShowcase, setShowcase, showcaseCities } from "@/lib/qloo/showcase";
import { TourBoardProvider } from "@/lib/qloo/TourBoardProvider";
import { TOUR_STORAGE_KEY } from "@/lib/tour/tourStorage";
import { buildTourSteps, TOUR_STEP_COUNT } from "@/lib/tour/tourSteps";
import syntheticShowcase from "@/test/fixtures/showcase.synthetic.json";
import Landing from "@/pages/Landing";
import CityPlaybook from "@/pages/CityPlaybook";
import TourBoard from "@/pages/TourBoard";
import TourBook from "@/pages/TourBook";
import { TourProvider } from "./TourProvider";

vi.mock("@/components/qloo/TourMap", () => ({ default: () => <div data-testid="map" /> }));

let desktop = true;
let reduced = false;
beforeEach(() => {
  desktop = true;
  reduced = false;
  window.localStorage.clear();
  setShowcase(parseShowcase(syntheticShowcase));
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("prefers-reduced-motion") ? reduced : desktop, addEventListener() {}, removeEventListener() {} }));
  // jsdom has no layout: give every element a box so targets count as visible.
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

const Where = () => { const l = useLocation(); return <output data-testid="where">{l.pathname}{l.search}</output>; };
const mount = (url = "/", routes?: React.ReactNode) => render(
  <QueryClientProvider client={new QueryClient()}>
    <TourBoardProvider>
      <MemoryRouter initialEntries={[url]}>
        <TourProvider>
          <Routes>
            {routes ?? <>
              <Route path="/" element={<Landing />} />
              <Route path="/tours/board" element={<TourBoard />} />
              <Route path="/tours/playbook/:cityId" element={<CityPlaybook />} />
              <Route path="/tours/book" element={<TourBook />} />
            </>}
          </Routes>
        </TourProvider>
        <Where />
      </MemoryRouter>
    </TourBoardProvider>
  </QueryClientProvider>,
);
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const popover = () => screen.getByTestId("tour-popover");
const counter = () => screen.getByText(/^\d of 8$/).textContent;

describe("first-visit prompt", () => {
  it("shows on the first visit, is not modal, and does not start the tour", async () => {
    mount("/");
    const prompt = screen.getByTestId("tour-prompt");
    expect(prompt.textContent).toContain("New here? Take the 60-second tour");
    expect(screen.getByRole("button", { name: "Start tour" })).toBeTruthy();
    expect(prompt.getAttribute("aria-modal")).toBeNull();
    expect(screen.queryByTestId("tour-popover")).toBeNull();
  });
  it("No thanks dismisses it and stores the outcome; a later visit does not show it", () => {
    mount("/");
    fireEvent.click(screen.getByRole("button", { name: "No thanks" }));
    expect(screen.queryByTestId("tour-prompt")).toBeNull();
    expect(window.localStorage.getItem(TOUR_STORAGE_KEY)).toBe("dismissed");
    cleanup();
    mount("/");
    expect(screen.queryByTestId("tour-prompt")).toBeNull();
  });
  it("shows on the recorded board too, and not on the proof route", async () => {
    mount("/tours/board?showcase=1");
    await flush();
    expect(screen.getByTestId("tour-prompt")).toBeTruthy();
    cleanup();
    mount("/proof", <Route path="/proof" element={<p>proof</p>} />);
    expect(screen.queryByTestId("tour-prompt")).toBeNull();
  });
  it("storage that throws still renders the page and the prompt, and dismissing works for the visit", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    mount("/");
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.getByTestId("tour-prompt")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "No thanks" }));
    expect(screen.queryByTestId("tour-prompt")).toBeNull();
  });
  it("is hidden when no real recording is loaded", () => {
    setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE));
    mount("/");
    expect(screen.queryByTestId("tour-prompt")).toBeNull();
    expect(screen.queryByTestId("take-tour")).toBeNull();
  });
});

describe("persistent entry", () => {
  it("Landing offers Take the tour and it starts step 1 on the board even after dismissal", async () => {
    window.localStorage.setItem(TOUR_STORAGE_KEY, "dismissed");
    mount("/");
    expect(screen.queryByTestId("tour-prompt")).toBeNull();
    fireEvent.click(screen.getByTestId("take-tour"));
    await flush();
    expect(counter()).toBe("1 of 8");
    expect(screen.getByTestId("where").textContent).toBe("/tours/board?showcase=1");
  });
});

describe("the tour", () => {
  const begin = async () => {
    mount("/");
    fireEvent.click(screen.getByRole("button", { name: "Start tour" }));
    await flush();
  };
  it("is a non-modal labelled dialog with the title, body, count and Back / Next / Skip", async () => {
    await begin();
    const pop = popover();
    expect(pop.getAttribute("role")).toBe("dialog");
    expect(pop.getAttribute("aria-modal")).toBe("false");
    expect(document.getElementById(pop.getAttribute("aria-labelledby")!)!.textContent).toBe("Markets");
    expect(counter()).toBe("1 of 8");
    expect((screen.getByRole("button", { name: "Back" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
    expect(document.activeElement).toBe(pop);
  });
  it("Next and Back move through the steps and navigate between routes", async () => {
    await begin();
    const where = () => screen.getByTestId("where").textContent;
    fireEvent.click(screen.getByRole("button", { name: "Next" })); await flush();
    expect(counter()).toBe("2 of 8");
    fireEvent.click(screen.getByRole("button", { name: "Next" })); await flush();
    fireEvent.click(screen.getByRole("button", { name: "Next" })); await flush();
    expect(counter()).toBe("4 of 8");
    expect(where()).toBe("/tours/board?showcase=1&mode=without");
    fireEvent.click(screen.getByRole("button", { name: "Next" })); await flush();
    expect(counter()).toBe("5 of 8");
    expect(where()).toMatch(/^\/tours\/playbook\/.+\?showcase=1$/);
    fireEvent.click(screen.getByRole("button", { name: "Back" })); await flush();
    expect(counter()).toBe("4 of 8");
    expect(where()).toBe("/tours/board?showcase=1&mode=without");
  });
  it("highlights real elements by data-tour with a ring", async () => {
    await begin();
    await waitFor(() => expect(screen.getByTestId("tour-ring")).toBeTruthy());
    expect(document.querySelector('[data-tour="board-header"]')).toBeTruthy();
    expect(popover().getAttribute("data-layout")).toBe("beside");
  });
  it("walks every step to Done, the last Next reads Done and completion is stored", async () => {
    await begin();
    for (let i = 1; i < TOUR_STEP_COUNT; i++) { fireEvent.click(screen.getByRole("button", { name: "Next" })); await flush(); }
    expect(counter()).toBe("8 of 8");
    expect(screen.getByTestId("where").textContent).toBe("/tours/book?showcase=1");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByTestId("tour-popover")).toBeNull();
    expect(window.localStorage.getItem(TOUR_STORAGE_KEY)).toBe("completed");
  });
  it("Skip ends the tour and stores the dismissal", async () => {
    await begin();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.queryByTestId("tour-popover")).toBeNull();
    expect(window.localStorage.getItem(TOUR_STORAGE_KEY)).toBe("dismissed");
  });
  it("Esc skips; arrow keys move; Tab stays inside the popover", async () => {
    await begin();
    fireEvent.keyDown(document, { key: "ArrowRight" }); await flush();
    expect(counter()).toBe("2 of 8");
    fireEvent.keyDown(document, { key: "ArrowLeft" }); await flush();
    expect(counter()).toBe("1 of 8");
    const skip = screen.getByRole("button", { name: "Skip" });
    skip.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Next" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("tour-popover")).toBeNull();
  });
  it("Tab pulled from the page lands on the popover's first button", async () => {
    await begin();
    (document.body as HTMLElement).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(popover().contains(document.activeElement)).toBe(true);
  });
  it("the page stays usable while the tour runs (no blocking backdrop)", async () => {
    await begin();
    expect(screen.getByTestId("tour-overlay").className).toContain("pointer-events-none");
  });
  it("a missing target shows the step centred with no ring and never crashes", async () => {
    mount("/", <>
      <Route path="/" element={<p>start here</p>} />
      <Route path="/tours/board" element={<p>empty board</p>} />
      <Route path="/tours/playbook/:cityId" element={<p>empty playbook</p>} />
      <Route path="/tours/book" element={<p>empty book</p>} />
    </>);
    fireEvent.click(screen.getByRole("button", { name: "Start tour" }));
    await flush();
    expect(popover().getAttribute("data-layout")).toBe("centred");
    expect(screen.queryByTestId("tour-ring")).toBeNull();
    for (let i = 1; i < TOUR_STEP_COUNT; i++) { fireEvent.click(screen.getByRole("button", { name: "Next" })); await flush(); expect(screen.queryByTestId("tour-ring")).toBeNull(); }
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByTestId("tour-popover")).toBeNull();
  });
  it("the placeholder showcase builds eight centred-safe steps without throwing", () => {
    const steps = buildTourSteps(parseShowcase(PLACEHOLDER_SHOWCASE));
    expect(steps).toHaveLength(TOUR_STEP_COUNT);
    expect(steps.every((s) => s.body.length > 0 && s.route.startsWith("/"))).toBe(true);
  });
});

describe("layout and motion", () => {
  it("is a bottom sheet under the mobile query", async () => {
    desktop = false;
    mount("/");
    fireEvent.click(screen.getByRole("button", { name: "Start tour" }));
    await flush();
    const pop = popover();
    expect(pop.getAttribute("data-layout")).toBe("sheet");
    expect(pop.className).toContain("inset-x-0");
    expect(pop.className).toContain("rounded-t-[18px]");
  });
  it("is a floating popover on desktop", async () => {
    mount("/");
    fireEvent.click(screen.getByRole("button", { name: "Start tour" }));
    await flush();
    expect(popover().getAttribute("data-layout")).not.toBe("sheet");
  });
  it("prefers-reduced-motion: no smooth scrolling and no animated ring", async () => {
    reduced = true;
    mount("/");
    fireEvent.click(screen.getByRole("button", { name: "Start tour" }));
    await waitFor(() => expect(screen.getByTestId("tour-ring")).toBeTruthy());
    expect(popover().getAttribute("data-motion")).toBe("reduced");
    expect(screen.getByTestId("tour-ring").className).not.toContain("transition");
    for (const c of vi.mocked(window.scrollBy).mock.calls) expect((c[0] as ScrollToOptions).behavior).toBe("auto");
    for (const c of vi.mocked(Element.prototype.scrollIntoView).mock.calls) expect((c[0] as ScrollIntoViewOptions).behavior).not.toBe("smooth");
  });
  it("without the preference the ring animates and scrolling is smooth", async () => {
    mount("/");
    fireEvent.click(screen.getByRole("button", { name: "Start tour" }));
    await waitFor(() => expect(screen.getByTestId("tour-ring")).toBeTruthy());
    expect(popover().getAttribute("data-motion")).toBe("full");
    expect(screen.getByTestId("tour-ring").className).toContain("transition");
    expect(vi.mocked(window.scrollBy).mock.calls.some((c) => (c[0] as ScrollToOptions).behavior === "smooth")).toBe(true);
  });
});

describe("copy is derived from the recording", () => {
  const show = () => parseShowcase(syntheticShowcase);
  it("step 1 reads the artist, city count and regions from the recording", () => {
    const s = show();
    const n = showcaseCities(s).length;
    expect(buildTourSteps(s)[0]!.body).toBe(`This is a recorded tour for ${s.artist}: ${n} cities across ${s.brief.regions.slice(0, -1).join(", ")} and ${s.brief.regions.at(-1)}. Fan heat shows where the artist's fans are most concentrated, using Qloo taste data.`);
  });
  it("step 3 quotes the mover's fan-heat and winnability ranks", () => {
    const s = show();
    const top = computeMoves(showcaseCities(s)).find((m) => m.delta > 0)!;
    expect(buildTourSteps(s)[2]!.body).toContain(`${top.city.name} moves from #${top.fanRank} on fan heat to #${top.winRank} on winnability.`);
  });
  it("steps 5 and 6 quote the recorded venue and co-billing act, and nothing is hard-coded", () => {
    const s = show();
    const steps = buildTourSteps(s);
    expect(steps[4]!.body).toMatch(/co-branded night at Synthetic Place \d+\./);
    expect(steps[1]!.body).toContain("That gap is the sponsor pitch");
    expect(steps[5]!.body).toMatch(/shared taste/);
    expect(steps.map((x) => x.body).join(" ")).not.toContain("Stüssy");
    expect(steps.map((x) => x.body).join(" ")).not.toContain("King Krule");
  });
  it("a different recording changes the numbers and names", () => {
    const s = show();
    const mover = computeMoves(showcaseCities(s)).find((m) => m.delta > 0)!.city;
    const pb = s.playbooks[mover.id]!.find((e) => e.type === "playbook")! as { playbook: { cards: Array<{ kind: string; items: Array<Record<string, unknown>> }> } };
    const card = (k: string) => pb.playbook.cards.find((c) => c.kind === k)!;
    card("co_billing").items[0]!.name = "Fixture Act";
    card("co_billing").items[0]!.sharedTaste = 0.42;
    card("venue_fit").items[0]!.name = "Fixture Room";
    Object.assign(card("sponsors").items[0]!, { name: "Fixture Brand", artistRank: 1, cityRank: null });
    const steps = buildTourSteps(s);
    expect(steps[1]!.body).toContain(`In ${mover.name} the artist's fans rank Fixture Brand #1, and Fixture Brand isn't in ${mover.name}'s own top 20.`);
    expect(steps[4]!.body).toContain("a presale or a co-branded night at Fixture Room.");
    expect(steps[5]!.body).toContain("(Fixture Act: fans share taste 42%)");
  });
});
