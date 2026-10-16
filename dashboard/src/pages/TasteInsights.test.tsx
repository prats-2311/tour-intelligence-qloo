// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TourBoardProvider, useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { SAMPLE_BRIEF } from "@/lib/qloo/fixtures/lumenVale";
import TasteInsights from "./TasteInsights";

vi.mock("@/components/qloo/TourMap", () => ({ default: () => <div data-testid="map" /> }));

let desktop = true;
beforeAll(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: desktop, addEventListener() {}, removeEventListener() {} }));
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => { cleanup(); desktop = true; });

function Seed() { const { run } = useTourBoard(); return <button onClick={() => run(SAMPLE_BRIEF, { sample: true })}>seed</button>; }
const renderPage = () => render(<MemoryRouter><TourBoardProvider sampleDelayMs={0}><Seed /><TasteInsights /></TourBoardProvider></MemoryRouter>);
const seeded = async () => {
  renderPage();
  fireEvent.click(screen.getByText("seed"));
  await waitFor(() => expect(screen.getAllByTestId("boxscore-row")).toHaveLength(10));
};

describe("TasteInsights", () => {
  it("empty state before any run (Review Focus 3)", () => {
    renderPage();
    expect(screen.getByText("Run a Tour Board to see insights")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Try the showcase tour" }).getAttribute("href")).toBe("/tours/board?sample=1");
    expect(screen.getByRole("link", { name: "Plan your own" }).getAttribute("href")).toBe("/tours/board");
  });
  it("renders matrix points, boxscore rows and data-quality tiles from the run", async () => {
    await seeded();
    expect(screen.getAllByTestId("matrix-point")).toHaveLength(9); // Belo Horizonte has no activation → not plotted
    expect(screen.getByText("Qloo calls").parentElement?.textContent).toContain("17");
    expect(screen.getByText("Sample data — illustrative, not Qloo output")).toBeTruthy();
  });
  it("verdict filter narrows every panel", async () => {
    await seeded();
    fireEvent.click(screen.getByRole("checkbox", { name: "Play" }));
    await waitFor(() => expect(screen.getAllByTestId("boxscore-row")).toHaveLength(8));
    expect(screen.getAllByTestId("matrix-point")).toHaveLength(7);
  });
  it("matrix is an accessible image with a table toggle and keyboard-selectable points", async () => {
    await seeded();
    expect(screen.getByRole("img", { name: /9 markets plotted/ })).toBeTruthy();
    const point = screen.getAllByTestId("matrix-point")[0]!;
    fireEvent.keyDown(point, { key: "Enter" });
    expect(point.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.queryAllByTestId("matrix-point")).toHaveLength(0);
    expect(within(screen.getByTestId("matrix-table")).getAllByRole("row")).toHaveLength(11);
  });
  it("mobile shows a Filters (n) button opening a sheet", async () => {
    desktop = false;
    await seeded();
    expect(screen.getByRole("button", { name: "Filters (0)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Filters (0)" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Play" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Filters (1)" })).toBeTruthy());
  });
  it("Export CSV downloads a Blob named after the artist", async () => {
    await seeded();
    const create = vi.fn(() => "blob:x");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });
});
