// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TourBoardProvider } from "@/lib/qloo/TourBoardProvider";
import * as client from "@/lib/qloo/client";
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

const wrap = (page: React.ReactNode, url: string) => (
  <MemoryRouter initialEntries={[url]}><TourBoardProvider sampleDelayMs={0}>{page}</TourBoardProvider></MemoryRouter>
);
const renderPage = (url = "/tours/board?sample=1") => render(wrap(<TourBoard />, url));

describe("TourBoard", () => {
  it("sample run renders 10 rows, the sample banner and verdict summary", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    expect(screen.getByText("Sample data — illustrative, not Qloo output")).toBeTruthy();
    expect(screen.getByText(/10 markets scored/)).toBeTruthy();
  });
  it("density-only re-sorts the list", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    fireEvent.click(screen.getByRole("tab", { name: "Density-only" }));
    const rows = screen.getAllByTestId("city-row");
    expect(within(rows[5]!).getByText("Guadalajara")).toBeTruthy();
  });
  it("opens Why this score? for a row", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    fireEvent.click(within(screen.getAllByTestId("city-row")[2]!).getByText("Guadalajara"));
    expect(await screen.findByRole("dialog", { name: /Guadalajara/ })).toBeTruthy();
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
    });
    renderPage("/tours/board");
    fireEvent.change(screen.getByLabelText("Artist"), { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("button", { name: "Score markets" }));
    expect(await screen.findByText("Connection lost — results so far shown")).toBeTruthy();
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
    expect(await screen.findByText("Connection lost — results so far shown")).toBeTruthy();
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
});
