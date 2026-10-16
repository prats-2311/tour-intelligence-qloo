// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useLocation, useParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TourBoardProvider, useTourBoard } from "@/lib/qloo/TourBoardProvider";
import * as client from "@/lib/qloo/client";
import { SAMPLE_BRIEF, SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { VERDICT_SHAPE } from "@/lib/qloo/labels";
import type { TourBrief } from "@/lib/qloo/types";
import TourBoard from "./TourBoard";

vi.mock("@/components/qloo/TourMap", () => ({ default: () => <div data-testid="map" /> }));

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const PlaybookStub = () => <p>playbook {useParams().cityId}</p>;
const Where = () => <span data-testid="search">{useLocation().search}</span>;
const wrap = (page: React.ReactNode, url: string) => (
  <TourBoardProvider sampleDelayMs={0}><MemoryRouter initialEntries={[url]} key={url}>{page}<Where /></MemoryRouter></TourBoardProvider>
);
const submitArtist = (name: string) => {
  fireEvent.change(screen.getByLabelText("Artist"), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: "Score markets" }));
};
const cityEvent = (i: number) => ({ type: "city_scored" as const, city: SAMPLE_CITIES[i]! });
const renderPage = (url = "/tours/board?sample=1") => render(wrap(<TourBoard />, url));
function RunOnce({ brief }: { brief: TourBrief }) {
  const { run } = useTourBoard();
  useEffect(() => { run(brief, { sample: true }); }, [run, brief]);
  return null;
}
const renderWithRun = (brief: TourBrief) =>
  render(
    <TourBoardProvider sampleDelayMs={0}>
      <MemoryRouter initialEntries={["/tours/board"]}>
        <Routes>
          <Route path="/tours/board" element={<TourBoard />} />
          <Route path="/tours/book" element={<><p>book page</p><Where /></>} />
        </Routes>
        <RunOnce brief={brief} />
      </MemoryRouter>
    </TourBoardProvider>,
  );


describe("TourBoard", () => {
  it("sample run renders 10 rows, the sample banner and verdict summary", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    expect(screen.getByText("Sample data — illustrative, not Qloo output")).toBeTruthy();
    expect(screen.getByText(/10 markets scored/)).toBeTruthy();
  });
  it("?sample=long starts a long-names sample run with the banner", async () => {
    const spy = vi.spyOn(client, "streamTourBoard");
    renderPage("/tours/board?sample=long");
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    expect(spy.mock.calls[0]![1]).toMatchObject({ sample: true, sampleSet: "long" });
    expect(screen.getByText("Sample data — illustrative, not Qloo output")).toBeTruthy();
    expect(screen.getAllByText("Santiago de Querétaro").length).toBeGreaterThan(0);
  });
  it("density-only re-sorts the list", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    fireEvent.click(screen.getByRole("tab", { name: "Density-only" }));
    const rows = screen.getAllByTestId("city-row");
    expect(within(rows[5]!).getByText("Guadalajara")).toBeTruthy();
  });
  it("opens Why this score? from the footer action", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    fireEvent.click(screen.getByRole("button", { name: "Why this score?" }));
    expect(await screen.findByRole("dialog", { name: /why this score/i })).toBeTruthy();
  });
  it("tapping a city row opens its playbook (sample query kept)", async () => {
    render(
      <TourBoardProvider sampleDelayMs={0}>
        <MemoryRouter initialEntries={["/tours/board?sample=1"]}>
          <Routes>
            <Route path="/tours/board" element={<TourBoard />} />
            <Route path="/tours/playbook/:cityId" element={<><PlaybookStub /><Where /></>} />
          </Routes>
        </MemoryRouter>
      </TourBoardProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /^Guadalajara/ }));
    expect(await screen.findByText("playbook 4005539")).toBeTruthy();
    expect(screen.getByTestId("search").textContent).toBe("?sample=1");
  });
  it("shows the needs_input picker and re-runs with the chosen id", async () => {
    const spy = vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () {
      yield { type: "needs_input", field: "entity", summary: "Choose", candidates: [{ id: "P1", name: "Pedro Infante" }, { id: "P2", name: "Pedro Capó" }] };
    });
    renderPage("/tours/board");
    fireEvent.change(screen.getByLabelText("Artist"), { target: { value: "Pedro" } });
    fireEvent.click(screen.getByRole("button", { name: "Score markets" }));
    fireEvent.click(await screen.findByRole("button", { name: "Pedro Capó" }));
    await waitFor(() => expect(spy.mock.calls.at(-1)![0]).toMatchObject({ artist: "Pedro", artistEntityId: "P2" }));
  });
  it("zero cities shows the empty state naming the regions (Review Focus 3)", async () => {
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () {
      yield { type: "region_empty", region: "Atlantis" };
      yield { type: "done", summary: {} };
    });
    renderPage("/tours/board");
    fireEvent.change(screen.getByLabelText("Artist"), { target: { value: "Beyoncé" } });
    fireEvent.click(screen.getByRole("button", { name: "Score markets" }));
    expect(await screen.findByText(/No Qloo signal in Atlantis/)).toBeTruthy();
  });
  it("budget error offers the showcase tour", async () => {
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () {
      yield { type: "error", code: "BUDGET", message: "Session limit reached — try the showcase tour." };
    });
    renderPage("/tours/board");
    fireEvent.change(screen.getByLabelText("Artist"), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: "Score markets" }));
    expect(await screen.findByRole("button", { name: "Try the showcase tour" })).toBeTruthy();
  });
  it("Belo Horizonte renders as Not enough data and sorts last", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    const last = screen.getAllByTestId("city-row").at(-1)!;
    expect(within(last).getByText("Belo Horizonte")).toBeTruthy();
    expect(within(last).getAllByText("Not enough data").length).toBeGreaterThan(0);
  });
  it("interrupted stream keeps results and offers Retry for the same brief", async () => {
    const spy = vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () {
      yield { type: "resolve", entity: { entityId: "A1", name: "Ada" } };
      yield cityEvent(2);
    });
    renderPage("/tours/board");
    fireEvent.change(screen.getByLabelText("Artist"), { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("button", { name: "Score markets" }));
    expect(await screen.findByText("Connection lost — results so far shown")).toBeTruthy();
    const rows = screen.getAllByTestId("city-row");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText("Guadalajara")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy.mock.calls[1]![0]).toMatchObject({ artist: "Ada" });
  });
  it("Stop aborts a live stream", async () => {
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* (_b, opts) {
      yield { type: "resolve", entity: { entityId: "A1", name: "Ada" } };
      await new Promise((_, rej) => opts?.signal?.addEventListener("abort", () => rej(new Error("aborted"))));
    });
    renderPage("/tours/board");
    fireEvent.change(screen.getByLabelText("Artist"), { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("button", { name: "Score markets" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
    expect(await screen.findByText("Stopped — results so far shown")).toBeTruthy();
    expect(screen.queryByText("Connection lost — results so far shown")).toBeNull();
  });
  it("navigating away and back does not start a second stream", async () => {
    const spy = vi.spyOn(client, "streamTourBoard");
    const { rerender } = renderPage();
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    rerender(wrap(<div>elsewhere</div>, "/tours/board?sample=1"));
    rerender(wrap(<TourBoard />, "/tours/board?sample=1"));
    expect(screen.getAllByTestId("city-row")).toHaveLength(10);
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it("Build tour sheet lists play and goldmine markets and links to Taste Insights only", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    fireEvent.click(screen.getByRole("button", { name: /Build tour/ }));
    const dialog = await screen.findByRole("dialog", { name: "Shortlist" });
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(4);
    expect(within(dialog).getByRole("link", { name: "Compare in Taste Insights" }).getAttribute("href")).toBe("/insights");
  });
  it("passes the typed artist unchanged to the stream (Beyoncé)", async () => {
    const spy = vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () { yield { type: "done", summary: {} }; });
    renderPage("/tours/board");
    submitArtist("Beyoncé");
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0]![0].artist).toBe("Beyoncé");
  });
  it("?sample=1 starts the showcase even when a live run is already held", async () => {
    vi.spyOn(client, "streamTourBoard").mockImplementationOnce(async function* () { yield { type: "done", summary: {} }; });
    const { rerender } = render(wrap(<TourBoard />, "/tours/board"));
    submitArtist("Ada");
    await screen.findByText("No markets scored");
    rerender(wrap(<TourBoard />, "/tours/board?sample=1"));
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    expect(screen.getByText("Sample data — illustrative, not Qloo output")).toBeTruthy();
  });
  it("keeps region notices visible after the run finishes with cities", async () => {
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () {
      yield { type: "region_empty", region: "Atlantis" };
      yield { type: "region_unavailable", region: "Brazil", code: "QLOO_AUTH", message: "no access" };
      yield cityEvent(0);
      yield { type: "done", summary: {} };
    });
    renderPage("/tours/board");
    submitArtist("Ada");
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Stop" })).toBeNull());
    expect(screen.getByText(/No Qloo signal in Atlantis/)).toBeTruthy();
    expect(screen.getByText(/Brazil unavailable/)).toBeTruthy();
  });
  it("keeps region notices after an interruption", async () => {
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () {
      yield { type: "region_empty", region: "Atlantis" };
      yield cityEvent(0);
    });
    renderPage("/tours/board");
    submitArtist("Ada");
    await screen.findByText("Connection lost — results so far shown");
    expect(screen.getByText(/No Qloo signal in Atlantis/)).toBeTruthy();
  });
  it("New brief pre-fills the last brief and drops ?sample from the URL", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Stop" })).toBeNull());
    expect(screen.getByTestId("search").textContent).toBe("?sample=1");
    fireEvent.click(screen.getByRole("button", { name: "New brief" }));
    expect((await screen.findByLabelText("Artist") as HTMLInputElement).value).toBe("Lumen Vale");
    expect(screen.getByTestId("search").textContent).toBe("");
  });
  it("a new run clears the shortlist exclusions", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Stop" })).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Build tour/ }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Shortlist" })).getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "New brief" }));
    fireEvent.click(await screen.findByRole("button", { name: "Try the showcase tour" }));
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Stop" })).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Build tour/ }));
    const boxes = within(await screen.findByRole("dialog", { name: "Shortlist" })).getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.every((b) => b.checked)).toBe(true);
  });
  it("row aria-label includes the data warning label", async () => {
    const warned = { ...SAMPLE_CITIES[0]!, warnings: [{ tool: "qloo_recommend", kind: "partial" as const }] };
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () { yield { type: "city_scored", city: warned }; yield { type: "done", summary: {} }; });
    renderPage("/tours/board");
    submitArtist("Ada");
    const row = (await screen.findAllByTestId("city-row"))[0]!;
    expect(within(row).getByRole("button").getAttribute("aria-label")).toMatch(/Partial data/);
  });
  it("map legend shows all six verdicts with the shared shapes", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    const legend = screen.getByLabelText("Map legend");
    for (const [v, label] of [["play", "Play"], ["hidden_goldmine", "Hidden goldmine"], ["de_risk", "De-risk"], ["consider", "Consider"], ["skip", "Skip"], ["insufficient_data", "Not enough data"]] as const) {
      const item = within(legend).getByText(label);
      expect(item.querySelector("[data-shape]")!.getAttribute("data-shape")).toBe(VERDICT_SHAPE[v]);
    }
  });
  it("needs_input picker offers 'Search a different artist' that returns to the brief with the artist kept", async () => {
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () {
      yield { type: "needs_input", field: "entity", summary: "Choose", candidates: [{ id: "P1", name: "Pedro Infante" }] };
    });
    renderPage("/tours/board");
    submitArtist("Pedro");
    fireEvent.click(await screen.findByRole("button", { name: "Search a different artist" }));
    expect((await screen.findByLabelText("Artist") as HTMLInputElement).value).toBe("Pedro");
  });
  it("empty state 'Try other regions' returns to the brief and keeps the artist", async () => {
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () {
      yield { type: "region_empty", region: "Atlantis" };
      yield { type: "done", summary: {} };
    });
    renderPage("/tours/board");
    submitArtist("Beyoncé");
    fireEvent.click(await screen.findByRole("button", { name: "Try other regions" }));
    expect((await screen.findByLabelText("Artist") as HTMLInputElement).value).toBe("Beyoncé");
  });
  it("Build tour defaults to the top max-stops eligible cities and caps selection", async () => {
    renderWithRun({ ...SAMPLE_BRIEF, maxStops: 2 });
    fireEvent.click(await screen.findByRole("button", { name: "Build tour" }));
    expect(screen.getByRole("checkbox", { name: /Mexico City/ })).toHaveProperty("checked", true);
    expect(screen.getByRole("checkbox", { name: /São Paulo/ })).toHaveProperty("checked", true);
    const gdl = screen.getByRole("checkbox", { name: /Guadalajara/ });
    expect(gdl).toHaveProperty("checked", false);
    expect(gdl).toHaveProperty("disabled", true);
    expect(screen.getByText("Max stops reached — raise it in the brief")).toBeTruthy();
    expect(screen.getByText("2 of max 2 stops")).toBeTruthy();
  });
  it("unchecking a stop frees a slot and keeps the count honest", async () => {
    renderWithRun({ ...SAMPLE_BRIEF, maxStops: 2 });
    fireEvent.click(await screen.findByRole("button", { name: "Build tour" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Mexico City/ }));
    expect(screen.getByText("1 of max 2 stops")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /Guadalajara/ })).toHaveProperty("disabled", false);
    expect(screen.queryByText("Max stops reached — raise it in the brief")).toBeNull();
  });
  it("Open Tour Book navigates to the book in sample mode", async () => {
    render(
      <TourBoardProvider sampleDelayMs={0}>
        <MemoryRouter initialEntries={["/tours/board?sample=1"]}>
          <Routes>
            <Route path="/tours/board" element={<TourBoard />} />
            <Route path="/tours/book" element={<><p>book page</p><Where /></>} />
          </Routes>
        </MemoryRouter>
      </TourBoardProvider>,
    );
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    fireEvent.click(screen.getByRole("button", { name: "Build tour" }));
    fireEvent.click(screen.getByRole("link", { name: "Open Tour Book" }));
    expect(await screen.findByText("book page")).toBeTruthy();
    expect(screen.getByTestId("search").textContent).toBe("?sample=1");
  });
});
