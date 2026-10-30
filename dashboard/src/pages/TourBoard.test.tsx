// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useLocation, useParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TourBoardProvider, useTourBoard } from "@/lib/qloo/TourBoardProvider";
import * as client from "@/lib/qloo/client";
import { SAMPLE_BRIEF, SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { VERDICT_SHAPE } from "@/lib/qloo/labels";
import type { TourBrief } from "@/lib/qloo/types";
import { parseShowcase, setShowcase, showcaseCities } from "@/lib/qloo/showcase";
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
  it("the header links to the charts page, keeping the sample query", async () => {
    renderPage("/tours/board?sample=1");
    // One in the header (desktop) and one in the quiet link row (phones); CSS shows exactly one per width.
    const links = await screen.findAllByRole("link", { name: "Charts" });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link.getAttribute("href")).toBe("/tours/insights?sample=1");
  });
  it("Without Qloo keeps the map legend, score sheet and bars off, but keeps the next step", async () => {
    renderPage("/tours/board?sample=1&mode=without");
    await screen.findByRole("list", { name: "Generic ranking" });
    expect(screen.queryByText("Why this score?")).toBeNull();
    expect(screen.queryByRole("button", { name: "Why this score?" })).toBeNull();
    expect(screen.queryByLabelText("Map legend")).toBeNull();
    expect(screen.queryAllByRole("meter")).toHaveLength(0);
    expect(screen.getByRole("button", { name: /Review shortlist/ })).toBeTruthy();
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

  it("Without Qloo shows the generic list with Qloo's verdict chips and the banner", async () => {
    renderPage("/tours/board?sample=1&mode=without");
    expect(await screen.findByText("Generic LLM answer — no taste evidence")).toBeTruthy();
    expect(screen.getByTestId("mode-note").textContent).toMatch(/^A generic LLM's city order, with no taste data\. It is good at picking big markets/);
    const list = screen.getByRole("list", { name: "Generic ranking" });
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("Mexico City")]));
    expect(within(list).getAllByText("Hidden goldmine").length).toBeGreaterThan(0);
    expect(within(list).queryByRole("meter")).toBeNull();
    expect(screen.queryAllByTestId("city-row")).toHaveLength(0);
  });
  it("Without Qloo says where Qloo disagrees with the generic order", async () => {
    renderPage("/tours/board?sample=1&mode=without");
    const list = await screen.findByRole("list", { name: "Generic ranking" });
    expect(screen.getByTestId("without-summary").textContent).toBe("Qloo disagrees on 9 of 10: 1 Skip, 1 couldn't be scored, 7 moved.");
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(10);
    expect(rows[0]!.textContent).toContain("Mexico City");
    expect(rows[7]!.textContent).toContain("Qloo says Skip");
    expect(rows[9]!.textContent).toContain("Qloo couldn't score it");
    expect(rows[8]!.textContent).toContain("Qloo ranks it #4");
  });
  it("Without Qloo in the recorded example flags a capped city and keeps Review shortlist", async () => {
    setShowcase(parseShowcase(syntheticShowcase));
    renderPage("/tours/board?showcase=1&mode=without");
    const list = await screen.findByRole("list", { name: "Generic ranking" });
    const cabo = await within(list).findByText("Cabo Frio");
    expect(cabo.closest("li")!.textContent).toContain("Capped: no Qloo fan-heat evidence");
    expect(screen.getByTestId("without-summary").textContent).toBe("Qloo disagrees on 8 of 8: 1 capped, 1 Skip, 1 couldn't be scored, 5 moved.");
    expect(screen.getByRole("button", { name: /Review shortlist/ })).toBeTruthy();
    // Only cities with a recorded playbook are links.
    expect(within(list).getAllByRole("button").length).toBe(4);
  });
  it("Back to the Qloo ranking switches to winnability", async () => {
    renderPage("/tours/board?sample=1&mode=without");
    await screen.findByRole("list", { name: "Generic ranking" });
    fireEvent.click(screen.getByRole("button", { name: "Back to the Qloo ranking" }));
    expect(currentSearch()).not.toContain("mode=");
    expect(await screen.findAllByTestId("city-row")).toHaveLength(10);
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
  it("a live run says how long it takes while scoring, and only then", async () => {
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () { yield cityEvent(0); await new Promise(() => {}); });
    renderPage("/tours/board");
    submitArtist("Ada");
    expect((await screen.findByTestId("live-run-line")).textContent).toBe("Live Qloo run: about a minute for 3 cities.");
  });
  it("the recorded example never shows the live-run line", async () => {
    renderPage("/tours/board?sample=1");
    await waitFor(() => expect(screen.getAllByTestId("city-row").length).toBeGreaterThan(0));
    expect(screen.queryByTestId("live-run-line")).toBeNull();
  });
  it("selecting Without Qloo while streaming says to wait", async () => {
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () { yield cityEvent(0); await new Promise(() => {}); });
    renderPage("/tours/board");
    submitArtist("Ada");
    fireEvent.click(await screen.findByRole("tab", { name: "Without Qloo" }));
    expect(screen.getByText("Waiting for the board to finish…")).toBeTruthy();
  });

  it("header class contract: the title block cannot shrink to zero and the actions row can wrap", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    const title = screen.getByRole("heading", { level: 1 }).parentElement!;
    const tokens = (el: Element) => el.className.split(/\s+/);
    expect(tokens(title)).toEqual(expect.arrayContaining(["min-w-0", "basis-full"]));
    expect(tokens(title)).not.toContain("flex-1");
    expect(tokens(title)).not.toContain("shrink");
    const actions = screen.getByRole("button", { name: /Agent log|Qloo calls/ }).parentElement!;
    expect(tokens(actions)).toContain("flex-wrap");
    expect(tokens(actions)).not.toContain("shrink-0");
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
  it("opens a Why <city> scores <n>? action from the footer, naming the top row by default and the selected city otherwise", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    const top = screen.getAllByTestId("city-row")[0]!;
    const name = top.getAttribute("data-city-name")!;
    const btn = screen.getByRole("button", { name: new RegExp(`^Why ${name} scores \\d+\\?$`) });
    fireEvent.click(btn);
    expect(await screen.findByRole("dialog", { name: new RegExp(`${name} — why this score`, "i") })).toBeTruthy();
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
    await waitFor(() => expect(document.querySelector('[data-testid="city-row"][data-city-name="Guadalajara"]')).toBeTruthy());
    fireEvent.click(within(document.querySelector('[data-testid="city-row"][data-city-name="Guadalajara"]') as HTMLElement).getByRole("button"));
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
  // Codes that really occur: gateway HTTP_<status>, mcp envelope codes (UNAVAILABLE, TRANSPORT, UNKNOWN), NOT_FOUND, BUDGET, INTERNAL.
  // A fetch rejection never becomes a NETWORK code: the provider turns it into an interrupted run (tested below).
  it.each(["NOT_FOUND", "HTTP_401", "HTTP_502", "UNAVAILABLE", "TRANSPORT", "BUDGET", "INTERNAL", "SOMETHING_NEW"])("error %s offers the showcase tour", async (code) => {
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () {
      yield { type: "error", code, message: "It went wrong." };
    });
    renderPage("/tours/board");
    submitArtist("X");
    expect(await screen.findByRole("button", { name: "See the example tour" })).toBeTruthy();
    expect(!!screen.queryByRole("button", { name: "Retry" })).toBe(code !== "BUDGET");
    expect(!!screen.queryByText("Check the spelling, or pick from the suggestions.")).toBe(code === "NOT_FOUND");
  });
  it("a dropped connection (fetch rejects) also offers the showcase tour and Retry", async () => {
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () { throw new TypeError("Failed to fetch"); });
    renderPage("/tours/board");
    submitArtist("X");
    expect(await screen.findByRole("button", { name: "See the example tour" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
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
  it("Review shortlist sheet lists play and goldmine markets, opens the Tour Book, and no longer links to Taste", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    fireEvent.click(screen.getByRole("button", { name: /Review shortlist/ }));
    const dialog = await screen.findByRole("dialog", { name: "Holds" });
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(4);
    expect(within(dialog).queryByRole("link", { name: "Compare taste" })).toBeNull();
    expect(within(dialog).getByRole("link", { name: "Open Tour Book" }).getAttribute("href")).toBe("/tours/book?sample=1");
    // "Taste profile" is a quiet text link in the board footer, not a button
    expect(screen.getByRole("link", { name: "Taste profile" }).getAttribute("href")).toBe("/insights");
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
    expect(screen.getByTestId("search").textContent).toBe("?new=1");
  });
  it("a new run clears the shortlist exclusions", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Stop" })).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Review shortlist/ }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Holds" })).getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "New brief" }));
    fireEvent.click(await screen.findByRole("button", { name: "See the example tour" }));
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Stop" })).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Review shortlist/ }));
    const boxes = within(await screen.findByRole("dialog", { name: "Holds" })).getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.every((b) => b.checked)).toBe(true);
  });
  it("row accessible name includes the data warning label (from the visible badge)", async () => {
    const warned = { ...SAMPLE_CITIES[0]!, warnings: [{ tool: "qloo_recommend", kind: "partial" as const }] };
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () { yield { type: "city_scored", city: warned }; yield { type: "done", summary: {} }; });
    renderPage("/tours/board");
    submitArtist("Ada");
    const row = (await screen.findAllByTestId("city-row"))[0]!;
    expect(within(row).getByRole("button", { name: /Partial data/ })).toBeTruthy();
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
  it("map legend lists only the verdicts that occur on the board", async () => {
    const play = SAMPLE_CITIES.find((c) => c.verdict === "play")!, skip = SAMPLE_CITIES.find((c) => c.verdict === "skip")!;
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () {
      yield { type: "city_scored", city: play };
      yield { type: "city_scored", city: skip };
      yield { type: "done", summary: {} };
    });
    renderPage("/tours/board");
    submitArtist("Ada");
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(2));
    const legend = screen.getByLabelText("Map legend");
    expect(within(legend).getByText("Play")).toBeTruthy();
    expect(within(legend).getByText("Skip")).toBeTruthy();
    for (const label of ["Hidden goldmine", "De-risk", "Consider", "Not enough data"]) expect(within(legend).queryByText(label)).toBeNull();
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
  it("Review shortlist defaults to the top max-stops eligible cities and caps selection", async () => {
    renderWithRun({ ...SAMPLE_BRIEF, maxStops: 2 });
    fireEvent.click(await screen.findByRole("button", { name: "Review shortlist" }));
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
    fireEvent.click(await screen.findByRole("button", { name: "Review shortlist" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Mexico City/ }));
    expect(screen.getByText("1 of max 2 stops")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /Guadalajara/ })).toHaveProperty("disabled", false);
    expect(screen.queryByText("Max stops reached — raise it in the brief")).toBeNull();
  });
  it("the header links to the Tour budget and keeps the sample flag", async () => {
    renderPage("/tours/board?sample=1");
    expect((await screen.findByRole("link", { name: "Tour budget" })).getAttribute("href")).toBe("/tours/budget?sample=1");
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
    fireEvent.click(screen.getByRole("button", { name: "Review shortlist" }));
    fireEvent.click(screen.getByRole("link", { name: "Open Tour Book" }));
    expect(await screen.findByText("book page")).toBeTruthy();
    expect(screen.getByTestId("search").textContent).toBe("?sample=1");
  });
});

function HoldButton({ id }: { id: string }) {
  const { toggleShortlist } = useTourBoard();
  return <button type="button" onClick={() => toggleShortlist(id)}>hold {id}</button>;
}

describe("TourBoard shortlist count", () => {
  it("lists every held city, including one whose verdict is not play or goldmine, and every count equals the list length", async () => {
    const gdl = SAMPLE_CITIES.find((c) => c.verdict === "consider" || c.verdict === "skip")!;
    expect(["play", "hidden_goldmine"]).not.toContain(gdl.verdict);
    render(
      <QueryClientProvider client={qc()}>
        <TourBoardProvider sampleDelayMs={0}>
          <MemoryRouter initialEntries={["/tours/board"]}>
            <Routes><Route path="/tours/board" element={<TourBoard />} /></Routes>
            <RunOnce brief={SAMPLE_BRIEF} />
            <HoldButton id={gdl.id} />
          </MemoryRouter>
        </TourBoardProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    fireEvent.click(screen.getByRole("button", { name: `hold ${gdl.id}` }));
    expect(screen.getByText("5 markets shortlisted")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Review shortlist/ }));
    const dialog = await screen.findByRole("dialog", { name: "Holds" });
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(5);
    expect(within(dialog).getByRole("checkbox", { name: new RegExp(gdl.name) })).toHaveProperty("checked", true);
    expect(within(dialog).getByText("5 of max 8 stops")).toBeTruthy();
  });
});

describe("TourBoard showcase rows without a recorded playbook", () => {
  const rec = () => parseShowcase(syntheticShowcase);
  it("only rows with a recorded playbook are buttons, and a quiet line explains the rest", async () => {
    setShowcase(rec());
    const recordedIds = Object.keys(rec().playbooks);
    renderPage("/tours/board?showcase=1");
    await waitFor(() => expect(screen.getAllByTestId("city-row").length).toBeGreaterThanOrEqual(8));
    for (const row of screen.getAllByTestId("city-row")) {
      const isRecorded = recordedIds.includes(row.getAttribute("data-city-id")!);
      expect(within(row).queryAllByRole("button").length > 0, row.getAttribute("data-city-name")!).toBe(isRecorded);
    }
    expect(screen.getByText(`Playbooks are recorded for ${recordedIds.length} cities in this example. Try your own artist to open any city.`)).toBeTruthy();
  });
  it("live and sample mode rows are all buttons and carry no such line", async () => {
    renderPage("/tours/board?sample=1");
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    for (const row of screen.getAllByTestId("city-row")) expect(within(row).getAllByRole("button").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Playbooks are recorded for/)).toBeNull();
  });
});

describe("TourBoard proof entry point", () => {
  it("links to the proof page", () => {
    renderPage();
    expect(screen.getByRole("link", { name: /How we tested it/ }).getAttribute("href")).toBe("/proof");
  });
});

describe("TourBoard opens ready", () => {
  const load = () => setShowcase(parseShowcase(syntheticShowcase));
  it("a bare /tours/board with no run loads the recorded example, with no network call", async () => {
    load();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderPage("/tours/board");
    await waitFor(() => expect(screen.getAllByTestId("city-row").length).toBeGreaterThanOrEqual(8));
    expect(screen.queryByLabelText("Artist")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("the form's pointer to the example never says 'showcase tour'", async () => {
    renderPage("/tours/board?new=1");
    await screen.findByLabelText("Artist");
    expect(document.body.textContent).toMatch(/The example tour (replays a recorded Qloo run|runs on sample data)/);
    expect(document.body.textContent).not.toMatch(/showcase tour/i);
  });
  it("a live run with no Play or Hidden goldmine market still has a next action: Consider cities are holdable", async () => {
    const consider = (i: number) => ({ type: "city_scored" as const, city: { ...SAMPLE_CITIES[i]!, verdict: "consider" as const } });
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () { yield consider(0); yield consider(1); yield { type: "done", summary: {} }; });
    renderPage("/tours/board?new=1");
    submitArtist("Ada");
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: /Review shortlist/ }));
    const dialog = await screen.findByRole("dialog", { name: "Holds" });
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(2);
    expect(within(dialog).getByText("None scored Play, so these are the Consider markets.")).toBeTruthy();
    fireEvent.click(within(dialog).getAllByRole("checkbox")[0]!);
    expect(within(dialog).getByText(/^1 of max \d+ stops$/)).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: "Open Tour Book" })).toBeTruthy();
  });
  it("?new=1 shows the brief form instead of the example", async () => {
    load();
    renderPage("/tours/board?new=1");
    expect(await screen.findByLabelText("Artist")).toBeTruthy();
    expect(screen.queryAllByTestId("city-row")).toHaveLength(0);
  });
  it("New brief on the example run keeps the form (no re-open of the example)", async () => {
    load();
    renderPage("/tours/board");
    await waitFor(() => expect(screen.getAllByTestId("city-row").length).toBeGreaterThanOrEqual(8));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Stop" })).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "New brief" }));
    expect(await screen.findByLabelText("Artist")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryAllByTestId("city-row")).toHaveLength(0);
  });
  it("without a recording a bare /tours/board shows the form", async () => {
    renderPage("/tours/board");
    expect(await screen.findByLabelText("Artist")).toBeTruthy();
  });
  it("the Open Tour Book link is never a disabled control, even with nothing held", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    fireEvent.click(screen.getByRole("button", { name: /Review shortlist/ }));
    const dialog = await screen.findByRole("dialog", { name: "Holds" });
    for (const box of within(dialog).getAllByRole("checkbox") as HTMLInputElement[]) if (box.checked) fireEvent.click(box);
    expect(within(dialog).getByRole("link", { name: "Open Tour Book" }).getAttribute("href")).toBe("/tours/book?sample=1");
    expect(within(dialog).getByText("Nothing held yet, so the book covers the default shortlist.")).toBeTruthy();
  });
});

describe("TourBoard explains each tab", () => {
  const note = () => screen.getByTestId("mode-note").textContent;
  it("winnability and density-only each get their line", async () => {
    renderPage("/tours/board?sample=1");
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    expect(note()).toBe("Ranked by winnability: fan heat and how winnable the city is, 50/50.");
    fireEvent.click(screen.getByRole("tab", { name: "Density-only" }));
    expect(note()).toBe("Same scores, sorted by fan heat only — the order a density-only tool would give.");
  });
  it("Without Qloo keeps its note and adds the agreement sentence only when the top cities match", async () => {
    renderPage("/tours/board?sample=1&mode=without");
    await screen.findByRole("list", { name: "Generic ranking" });
    const first = screen.getByRole("list", { name: "Generic ranking" }).querySelector("li")!.textContent!;
    const agrees = first.includes(SAMPLE_CITIES.slice().sort((a, b) => (b.winnability.value ?? 0) - (a.winnability.value ?? 0))[0]!.name);
    expect(note()).toBe(agrees ? "A generic LLM's city order, with no taste data. It is good at picking big markets (it beat winnability in our Test A); it can't tell you which brands or acts to pitch in each city. On the top city, the generic answer agrees." : "A generic LLM's city order, with no taste data. It is good at picking big markets (it beat winnability in our Test A); it can't tell you which brands or acts to pitch in each city.");
  });
  it("Without Qloo says nothing about agreement when the generic top city differs", async () => {
    load2();
    renderPage("/tours/board?showcase=1&mode=without");
    await screen.findByRole("list", { name: "Generic ranking" });
    expect(note()).toBe("A generic LLM's city order, with no taste data. It is good at picking big markets (it beat winnability in our Test A); it can't tell you which brands or acts to pitch in each city.");
  });
  it("Without Qloo adds the agreement sentence when the generic top city is the winnability top city", async () => {
    const raw = JSON.parse(JSON.stringify(syntheticShowcase));
    setShowcase(parseShowcase(raw));
    const top = [...showcaseCities()].sort((a, b) => (b.winnability.value ?? -1) - (a.winnability.value ?? -1))[0]!;
    raw.withoutQloo = { status: "ok", ranked: [{ name: top.name, country: top.country }, { name: "Other Town", country: "XX" }] };
    setShowcase(parseShowcase(raw));
    renderPage("/tours/board?showcase=1&mode=without");
    await screen.findByRole("list", { name: "Generic ranking" });
    expect(note()).toBe("A generic LLM's city order, with no taste data. It is good at picking big markets (it beat winnability in our Test A); it can't tell you which brands or acts to pitch in each city. On the top city, the generic answer agrees.");
  });
  function load2() {
    const raw = JSON.parse(JSON.stringify(syntheticShowcase));
    raw.withoutQloo = { status: "ok", ranked: [{ name: "Nowhere Town", country: "XX" }, { name: "El Paso", country: "US" }] };
    setShowcase(parseShowcase(raw));
  }
});

describe("TourBoard moves section", () => {
  it("leads the list column above the tabs, filling in when the board finishes", async () => {
    setShowcase(parseShowcase(syntheticShowcase));
    renderPage("/tours/board?showcase=1");
    const heading = await screen.findByRole("heading", { name: "Where fan heat and winnability disagree" });
    const tabs = screen.getByRole("tablist", { name: "Ranking" });
    expect(heading.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await waitFor(() => expect(screen.getAllByTestId("move-row").length + (screen.queryByText("Fan heat and winnability agree on this board.") ? 1 : 0)).toBeGreaterThan(0));
    expect(screen.queryByText("Ranking moves appear when the board finishes.")).toBeNull();
  });
  it("selects the city's board row when a move is tapped", async () => {
    renderPage("/tours/board?sample=1");
    await waitFor(() => expect(screen.getAllByTestId("move-row").length).toBeGreaterThan(0));
    const row = screen.getAllByTestId("move-row")[0]!;
    const name = row.querySelector(".font-title")!.textContent!;
    fireEvent.click(within(row).getByRole("button"));
    expect(within(row).getByRole("button").getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(`[data-testid="city-row"][data-city-name="${name}"]`)).toBeTruthy();
  });
});

describe("TourBoard paste your cities", () => {
  const pastedCity = (i: number) => ({ type: "city_scored" as const, city: { ...SAMPLE_CITIES[i]!, candidateSource: "your_routing" as const } });

  it("runs the board in pasted mode and shows Your routing on each city plus the unmatched banner above the list", async () => {
    const spy = vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () {
      yield { type: "routing_unmatched", names: ["Atlantis", "Nowhere, MX"] };
      yield pastedCity(0); yield pastedCity(1);
      yield { type: "done", summary: {} };
    });
    renderPage("/tours/board?new=1");
    fireEvent.change(screen.getByLabelText("Artist"), { target: { value: "Lumen Vale" } });
    fireEvent.change(screen.getByLabelText("Paste your cities"), { target: { value: "Aldea, MX\nAtlantis\nNowhere, MX" } });
    fireEvent.click(screen.getByRole("button", { name: "Score markets" }));
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(2));
    expect(spy.mock.calls[0]![0].cities).toEqual([{ name: "Aldea", country: "MX" }, { name: "Atlantis" }, { name: "Nowhere", country: "MX" }]);
    expect(screen.getAllByText("Your routing")).toHaveLength(2);
    const banner = screen.getByText("Not in our city list: Atlantis, Nowhere, MX. Check the spelling or add the country.");
    const list = screen.getAllByTestId("city-row")[0]!;
    expect(banner.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(/Your routing · 2 cities/)).toBeTruthy();
  });
  it("no banner and no tag on a normal run", async () => {
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () { yield cityEvent(0); yield { type: "done", summary: {} }; });
    renderPage("/tours/board?new=1");
    submitArtist("X");
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(1));
    expect(screen.queryByText(/Not in our city list/)).toBeNull();
    expect(screen.queryByText("Your routing")).toBeNull();
  });
  it("nothing matched: the banner and the error show, with no Retry that would fail the same way", async () => {
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () {
      yield { type: "routing_unmatched", names: ["Atlantis"] };
      yield { type: "error", code: "ROUTING_EMPTY", message: "None of the pasted cities are in our city list." };
    });
    renderPage("/tours/board?new=1");
    fireEvent.change(screen.getByLabelText("Artist"), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText("Paste your cities"), { target: { value: "Atlantis" } });
    fireEvent.click(screen.getByRole("button", { name: "Score markets" }));
    expect(await screen.findByText("Not in our city list: Atlantis. Check the spelling or add the country.")).toBeTruthy();
    expect(screen.getByText("None of the pasted cities are in our city list.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});

describe("TourBoard recorded routing example", () => {
  it("?showcase=routing replays the recorded routing with zero live calls, tags, and the unmatched banner", async () => {
    setShowcase(parseShowcase(syntheticShowcase));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const stream = vi.spyOn(client, "streamTourBoard");
    renderPage("/tours/board?showcase=routing");
    await waitFor(() => expect(screen.getAllByTestId("city-row").length).toBe(6), { timeout: 4000 });
    expect(screen.getAllByText("Your routing")).toHaveLength(6);
    expect(screen.getByText("Not in our city list: Atlantis. Check the spelling or add the country.")).toBeTruthy();
    expect(stream.mock.calls[0]![1]).toMatchObject({ sample: true, sampleSet: "showcase" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.queryByText("Major market")).toBeNull();
  });
  it("opens a recorded city with the routing query and a city with no recorded playbook is not a link", async () => {
    setShowcase(parseShowcase(syntheticShowcase));
    render(
      <QueryClientProvider client={qc()}>
        <TourBoardProvider sampleDelayMs={0}>
          <MemoryRouter initialEntries={["/tours/board?showcase=routing"]}>
            <Routes><Route path="/tours/board" element={<TourBoard />} /><Route path="/tours/playbook/:cityId" element={<><PlaybookStub /><Where /></>} /></Routes>
          </MemoryRouter>
        </TourBoardProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getAllByTestId("city-row").length).toBe(6), { timeout: 4000 });
    const recordedId = Object.keys(parseShowcase(syntheticShowcase).routing!.playbooks)[0]!;
    const name = parseShowcase(syntheticShowcase).routing!.boardEvents.flatMap((e) => (e.type === "city_scored" && e.city.id === recordedId ? [e.city.name] : []))[0]!;
    fireEvent.click(within(document.querySelector(`[data-testid="city-row"][data-city-name="${name}"]`) as HTMLElement).getByRole("button"));
    expect(await screen.findByText(`playbook ${recordedId}`)).toBeTruthy();
    expect(screen.getByTestId("search").textContent).toBe("?showcase=routing");
  });
  it("without a routing in the recording, ?showcase=routing falls back to the main example", async () => {
    setShowcase(parseShowcase({ ...(syntheticShowcase as object), routing: undefined }));
    renderPage("/tours/board?showcase=routing");
    await waitFor(() => expect(screen.getAllByTestId("city-row").length).toBe(8), { timeout: 4000 });
    expect(screen.queryByText("Your routing")).toBeNull();
  });
});

