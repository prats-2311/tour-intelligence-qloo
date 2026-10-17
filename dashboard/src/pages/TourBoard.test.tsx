// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useLocation, useParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TourBoardProvider, useTourBoard } from "@/lib/qloo/TourBoardProvider";
import * as client from "@/lib/qloo/client";
import { SAMPLE_BRIEF, SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { VERDICT_LABEL, VERDICT_SHAPE } from "@/lib/qloo/labels";
import type { TourBrief } from "@/lib/qloo/types";
import { parseShowcase, setShowcase } from "@/lib/qloo/showcase";
import { PLACEHOLDER_SHOWCASE } from "@/lib/qloo/placeholderShowcase";
import syntheticShowcase from "@/test/fixtures/showcase.synthetic.json";
import TourBoard from "./TourBoard";

const recorded = vi.hoisted(() => ({ raw: undefined as unknown }));
vi.mock("@/lib/qloo/showcase", async (orig) => {
  const mod = await orig<typeof import("@/lib/qloo/showcase")>();
  const { WITHOUT_SHOWCASE_MISSING } = await import("@/lib/qloo/withoutQloo");
  return { ...mod, showcaseWithoutQloo: () => (recorded.raw === undefined ? mod.showcaseWithoutQloo() : mod.parseShowcase({ withoutQloo: recorded.raw }).withoutQloo ?? WITHOUT_SHOWCASE_MISSING) };
});
vi.mock("@/components/qloo/TourMap", () => ({ default: () => <div data-testid="map" /> }));

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE));
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const PlaybookStub = () => <p>playbook {useParams().cityId}</p>;
const Where = () => <span data-testid="search">{useLocation().search}</span>;
const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = (page: React.ReactNode, url: string) => (
  <QueryClientProvider client={qc()}>
    <TourBoardProvider sampleDelayMs={0}><MemoryRouter initialEntries={[url]} key={url}>{page}<Where /></MemoryRouter></TourBoardProvider>
  </QueryClientProvider>
);
const currentSearch = () => screen.getByTestId("search").textContent ?? "";
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
    <QueryClientProvider client={qc()}>
      <TourBoardProvider sampleDelayMs={0}>
        <MemoryRouter initialEntries={["/tours/board"]}>
          <Routes>
            <Route path="/tours/board" element={<TourBoard />} />
            <Route path="/tours/book" element={<><p>book page</p><Where /></>} />
          </Routes>
          <RunOnce brief={brief} />
        </MemoryRouter>
      </TourBoardProvider>
    </QueryClientProvider>,
  );


describe("TourBoard", () => {
  it("Without Qloo hides every verdict and score surface on the page", async () => {
    renderPage("/tours/board?sample=1&mode=without");
    await screen.findByRole("list", { name: "Generic ranking" });
    for (const label of Object.values(VERDICT_LABEL)) expect(screen.queryByText(label as string)).toBeNull();
    expect(screen.queryByText("Why this score?")).toBeNull();
    expect(screen.queryByRole("button", { name: "Why this score?" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Build tour" })).toBeNull();
    expect(screen.queryByLabelText("Map legend")).toBeNull();
    expect(screen.queryByText(/markets scored.*(Play|Hidden goldmine)/)).toBeNull();
    expect(screen.getByText(/10 markets scored/).textContent).not.toMatch(/Play|Hidden goldmine|De-risk/);
  });
  it("?sample=long applies the long city names to the generic list", async () => {
    renderPage("/tours/board?sample=long&mode=without");
    const list = await screen.findByRole("list", { name: "Generic ranking" });
    await waitFor(() => expect(within(list).getAllByText("Santiago de Querétaro").length).toBeGreaterThan(0));
  });
  it("a thrown live fetch shows the unavailable notice with Try again, not skeletons", async () => {
    vi.spyOn(client, "fetchWithoutQloo").mockRejectedValue(new Error("boom"));
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () { yield cityEvent(0); yield { type: "done", summary: {} }; });
    renderPage("/tours/board");
    submitArtist("Ada");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Stop" })).toBeNull());
    fireEvent.click(await screen.findByRole("tab", { name: "Without Qloo" }));
    expect(await screen.findByText("Generic ranking unavailable")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("Without Qloo sends the resolved artist name, not the raw brief text", async () => {
    const spy = vi.spyOn(client, "fetchWithoutQloo").mockResolvedValue({ status: "unavailable", reason: "error", message: "Generic ranking unavailable" });
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () {
      yield { type: "resolve", entity: { entityId: "Q1", name: "Florence + the Machine" } }; yield cityEvent(0); yield { type: "done", summary: {} };
    });
    renderPage("/tours/board");
    submitArtist("florence and the machine");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Stop" })).toBeNull());
    fireEvent.click(await screen.findByRole("tab", { name: "Without Qloo" }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0]![0].artist).toBe("Florence + the Machine");
  });

  it("Without Qloo shows the generic list with no bars, verdicts or scores, and the banner", async () => {
    renderPage("/tours/board?sample=1&mode=without");
    expect(await screen.findByText("Generic LLM answer — no taste evidence")).toBeTruthy();
    expect(screen.getByText("No taste data. This is the ranking you'd get without Qloo.")).toBeTruthy();
    const list = screen.getByRole("list", { name: "Generic ranking" });
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("Mexico City")]));
    expect(within(list).queryByText("Hidden goldmine")).toBeNull();
    expect(within(list).queryByRole("meter")).toBeNull();
    expect(screen.queryAllByTestId("city-row")).toHaveLength(0);
  });
  it("switching to Without Qloo updates the URL and keeps the sample flag", async () => {
    renderPage("/tours/board?sample=1");
    fireEvent.click(await screen.findByRole("tab", { name: "Without Qloo" }));
    expect(currentSearch()).toContain("mode=without");
    expect(currentSearch()).toContain("sample=1");
    fireEvent.click(screen.getByRole("tab", { name: "Winnability" }));
    expect(currentSearch()).not.toContain("mode=");
    expect(currentSearch()).toContain("sample=1");
  });
  it("live mode fetches the generic ranking only when the user selects it, and shows a retry on failure", async () => {
    const spy = vi.spyOn(client, "fetchWithoutQloo").mockResolvedValue({ status: "unavailable", reason: "error", message: "Generic ranking unavailable" });
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () { yield cityEvent(0); yield { type: "done", summary: {} }; });
    renderPage("/tours/board");
    submitArtist("Ada");
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Stop" })).toBeNull());
    expect(spy).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("tab", { name: "Without Qloo" }));
    expect(await screen.findByText("Generic ranking unavailable")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });
  it("showcase replays the recorded generic ranking with no request and no Try again", async () => {
    setShowcase(parseShowcase(syntheticShowcase));
    recorded.raw = { status: "ok", ranked: [{ name: "Recorded Town", country: "MX" }, { name: "Other Town", country: "BR" }], model: "m", cached: false };
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const spy = vi.spyOn(client, "fetchWithoutQloo");
    renderPage("/tours/board?showcase=1&mode=without");
    const list = await screen.findByRole("list", { name: "Generic ranking" });
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual([expect.stringContaining("Recorded Town"), expect.stringContaining("Other Town")]);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(fetchSpy.mock.calls.some((c) => String(c[0]).includes("/api/qloo/without-qloo"))).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    recorded.raw = undefined;
  });

  it("showcase without a recorded ranking says so and offers no Try again", async () => {
    setShowcase(parseShowcase(syntheticShowcase));
    recorded.raw = null;
    renderPage("/tours/board?showcase=1&mode=without");
    expect(await screen.findByText("This recording has no generic ranking")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    recorded.raw = undefined;
  });

  it("sample mode never calls fetchWithoutQloo", async () => {
    const spy = vi.spyOn(client, "fetchWithoutQloo");
    renderPage("/tours/board?sample=1&mode=without");
    await screen.findByRole("list", { name: "Generic ranking" });
    expect(spy).not.toHaveBeenCalled();
  });
  it("selecting Without Qloo while streaming says to wait", async () => {
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () { yield cityEvent(0); await new Promise(() => {}); });
    renderPage("/tours/board");
    submitArtist("Ada");
    fireEvent.click(await screen.findByRole("tab", { name: "Without Qloo" }));
    expect(screen.getByText("Waiting for the board to finish…")).toBeTruthy();
  });

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
      <QueryClientProvider client={qc()}><TourBoardProvider sampleDelayMs={0}>
        <MemoryRouter initialEntries={["/tours/board?sample=1"]}>
          <Routes>
            <Route path="/tours/board" element={<TourBoard />} />
            <Route path="/tours/playbook/:cityId" element={<><PlaybookStub /><Where /></>} />
          </Routes>
        </MemoryRouter>
      </TourBoardProvider></QueryClientProvider>,
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
      <QueryClientProvider client={qc()}><TourBoardProvider sampleDelayMs={0}>
        <MemoryRouter initialEntries={["/tours/board?sample=1"]}>
          <Routes>
            <Route path="/tours/board" element={<TourBoard />} />
            <Route path="/tours/book" element={<><p>book page</p><Where /></>} />
          </Routes>
        </MemoryRouter>
      </TourBoardProvider></QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    fireEvent.click(screen.getByRole("button", { name: "Build tour" }));
    fireEvent.click(screen.getByRole("link", { name: "Open Tour Book" }));
    expect(await screen.findByText("book page")).toBeTruthy();
    expect(screen.getByTestId("search").textContent).toBe("?sample=1");
  });
});

describe("TourBoard proof entry point", () => {
  it("links to the proof page", () => {
    renderPage();
    expect(screen.getByRole("link", { name: /Checked against real tours/ }).getAttribute("href")).toBe("/proof");
  });
});
