// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrategistPanel } from "@/components/strategist/StrategistPanel";
import { parseShowcase, setShowcase, showcaseBannerText } from "@/lib/qloo/showcase";
import { PLACEHOLDER_SHOWCASE } from "@/lib/qloo/placeholderShowcase";
import Landing from "./Landing";
import TourBoard from "./TourBoard";
import TourBook from "./TourBook";
import CityPlaybook from "./CityPlaybook";
import { resetPlaybooks } from "@/lib/qloo/playbookStore";
import { TourBoardProvider } from "@/lib/qloo/TourBoardProvider";
import type { GatewayEvent, ScoredCity } from "@/lib/qloo/types";
import { SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";

vi.mock("@/components/qloo/TourMap", () => ({ default: () => <div data-testid="map" /> }));

const city = (id: string, name: string, fan: number, win: number, verdict: ScoredCity["verdict"]): ScoredCity => ({
  ...SAMPLE_CITIES[0]!, id, name, verdict, fanHeat: { value: fan, refs: [] }, winnability: { value: win, refs: [] },
});
const mk = (cities: ScoredCity[]) => ({
  recordedAt: "2026-10-16T10:00:00.000Z", artist: "Hand Made",
  brief: { artist: "Hand Made", regions: ["Mexico"], maxStops: 8 },
  boardEvents: [
    { type: "resolve", entity: { entityId: "E1", name: "Hand Made" } },
    { type: "surprise_event", payload: 1 },
    ...cities.map((c) => ({ type: "city_scored", city: c })),
    { type: "done", summary: {} },
  ] as unknown[],
  playbooks: Object.fromEntries(cities.map((c) => [c.id, [{ type: "playbook", playbook: { city: { name: c.name, country: c.country }, cards: [] } }, { type: "done", summary: {} }] as GatewayEvent[]])),
  thisWeek: {},
});
const CLIMB = mk([city("a", "Alpha", 90, 60, "play"), city("b", "Beta", 80, 50, "play"), city("d", "Delta", 60, 95, "hidden_goldmine")]);
const NO_CLIMB = mk([city("a", "Alpha", 90, 95, "play"), city("b", "Beta", 80, 50, "consider")]);

async function load(fixture: unknown) {
  setShowcase(parseShowcase(fixture));
  return { Landing, TourBoard, TourBook, Provider: TourBoardProvider };
}

beforeEach(() => { vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} })); });
afterEach(() => { cleanup(); resetPlaybooks(); setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE)); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("recorded showcase", () => {
  it("Landing proof card shows the biggest climb from the recording", async () => {
    const { Landing } = await load(CLIMB);
    render(<MemoryRouter><Landing /></MemoryRouter>);
    const card = screen.getByRole("region", { name: "Delta recorded routing row" });
    expect(within(card).getByText("Fan density ranks it 3rd of 3. Adding winnability puts it 1st.")).toBeTruthy();
    expect(within(card).getByText("Example · Recorded Qloo run · 2026-10-16 — not live")).toBeTruthy();
    expect(within(card).getByRole("link", { name: "Delta" }).getAttribute("href")).toBe("/tours/playbook/d?showcase=1");
    expect(screen.getByRole("link", { name: "See the example tour" }).getAttribute("href")).toBe("/tours/board?showcase=1");
  });
  it("Landing proof card claims no rank shift when nothing climbs", async () => {
    const { Landing } = await load(NO_CLIMB);
    render(<MemoryRouter><Landing /></MemoryRouter>);
    const card = screen.getByRole("region", { name: "Alpha recorded routing row" });
    expect(within(card).getByText("Ranked 1st of 2 scored markets on winnability.")).toBeTruthy();
    expect(within(card).queryByText(/fan density/)).toBeNull();
  });
  it("the board replays the recording with the recorded banner, zero fetches, and skips the unknown event", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { TourBoard, Provider } = await load(CLIMB);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Provider sampleDelayMs={0}><MemoryRouter initialEntries={["/tours/board?showcase=1"]}><TourBoard /></MemoryRouter></Provider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(3));
    expect(screen.getAllByText("Recorded Qloo run · 2026-10-16 — not live").length).toBeGreaterThan(0);
    expect(screen.queryByText("Sample data — illustrative, not Qloo output")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("the Tour Book carries the recorded label in print", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { TourBook, Provider } = await load(CLIMB);
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <Provider sampleDelayMs={0}><MemoryRouter initialEntries={["/tours/book?showcase=1"]}><Routes><Route path="/tours/book" element={<TourBook />} /></Routes></MemoryRouter></Provider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(container.querySelector("[data-print-footer]")?.textContent).toBe("Recorded Qloo run · 2026-10-16 — not live"), { timeout: 5000 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("the strategist builds chips from the recorded board and answers with the honest note", async () => {
    const context = { cities: [{ id: "d", name: "Delta", country: "MX", verdict: "hidden_goldmine", fanHeat: 60, activation: 50, winnability: 95 }] };
    render(<StrategistPanel context={context} sample showcase title="About Hand Made" />);
    expect(screen.getByText(showcaseBannerText())).toBeTruthy(); // whichever recording is loaded
    expect(screen.queryByRole("button", { name: "Why is Guadalajara a hidden goldmine?" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Why is Delta ranked here?" }));
    await waitFor(() => expect(screen.getByText("The live strategist needs a live run")).toBeTruthy());
  });
  it("when the recording is unavailable the board says so and links the sample; the landing still shows the sample proof card", async () => {
    setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE)); // what the boot loader leaves behind when /api/recordings/showcase fails
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TourBoardProvider sampleDelayMs={0}><MemoryRouter initialEntries={["/tours/board?showcase=1"]}><TourBoard /></MemoryRouter></TourBoardProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByText("The showcase recording is unavailable right now.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open the sample tour" }).getAttribute("href")).toBe("/tours/board?sample=1");
    expect(screen.queryAllByTestId("city-row")).toHaveLength(0);
    cleanup();
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.getByRole("region", { name: "Guadalajara sample routing row" })).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it.each([
    ["/tours/book?showcase=1", "/tours/book?sample=1"],
    ["/tours/playbook/4013708?showcase=1", `/tours/playbook/${SAMPLE_CITIES[2]!.id}?sample=1`],
  ])("%s shows the unavailable notice and links the sample instead of replaying the placeholder", async (url, sampleHref) => {
    setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TourBoardProvider sampleDelayMs={0}>
          <MemoryRouter initialEntries={[url]}>
            <Routes><Route path="/tours/book" element={<TourBook />} /><Route path="/tours/playbook/:cityId" element={<CityPlaybook />} /></Routes>
          </MemoryRouter>
        </TourBoardProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByText("The showcase recording is unavailable right now.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open the sample tour" }).getAttribute("href")).toBe(sampleHref);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
