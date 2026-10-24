// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TourBoardProvider, useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { matrixPoints } from "@/lib/qloo/geometry";
import { SAMPLE_BRIEF, SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { loadPlaybook, resetPlaybooks } from "@/lib/qloo/playbookStore";
import * as client from "@/lib/qloo/client";
import { parseShowcase, setShowcase } from "@/lib/qloo/showcase";
import { PLACEHOLDER_SHOWCASE } from "@/lib/qloo/placeholderShowcase";
import syntheticShowcase from "@/test/fixtures/showcase.synthetic.json";
import TasteInsights from "./TasteInsights";

vi.mock("@/components/qloo/TourMap", () => ({ default: () => <div data-testid="map" /> }));

let desktop = true;
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: desktop, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE));
  cleanup();
  resetPlaybooks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  desktop = true;
});

function Seed() {
  const { run } = useTourBoard();
  return (
    <>
      <button onClick={() => run(SAMPLE_BRIEF, { sample: true })}>seed</button>
      <button onClick={() => run({ ...SAMPLE_BRIEF, artist: "Other Act" }, { sample: true })}>seed2</button>
    </>
  );
}
const renderPage = (delay = 0) => render(<MemoryRouter><TourBoardProvider sampleDelayMs={delay}><Seed /><TasteInsights /></TourBoardProvider></MemoryRouter>);
const seeded = async () => {
  renderPage();
  fireEvent.click(screen.getByText("seed"));
  await waitFor(() => expect(screen.getAllByTestId("boxscore-row")).toHaveLength(10));
};

describe("TasteInsights opened directly", () => {
  it("with no run shows the example run's taste data, not an empty state", async () => {
    setShowcase(parseShowcase(syntheticShowcase));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("boxscore-row").length).toBeGreaterThan(0));
    expect(screen.queryByText("Score a Tour Board to see taste by market")).toBeNull();
    expect(screen.getByText(/recorded/i)).toBeTruthy();
    expect(fetchSpy.mock.calls.filter(([u]) => String(u).includes("/api/qloo"))).toHaveLength(0);
  });
});

describe("TasteInsights", () => {
  it("empty state before any run (Review Focus 3)", () => {
    renderPage();
    expect(screen.getByText("Score a Tour Board to see taste by market")).toBeTruthy();
    expect(screen.getByRole("link", { name: "See the example tour" }).getAttribute("href")).toBe("/tours/board?showcase=1");
    expect(screen.getByRole("link", { name: "Try your own artist" }).getAttribute("href")).toBe("/tours/board?new=1");
  });
  it("renders matrix points, boxscore rows and data-quality tiles from the run", async () => {
    await seeded();
    expect(screen.getAllByTestId("matrix-point")).toHaveLength(9); // Belo Horizonte has no activation → not plotted
    expect(screen.getByText("Qloo calls").parentElement?.textContent).toContain("17");
    expect(screen.getByText("Sample data — illustrative, not Qloo output")).toBeTruthy();
  });
  it("lets the market map grow with its section at xl instead of h-full", async () => {
    await seeded();
    const map = screen.getByRole("region", { name: "Market map" }).querySelector("div.relative")!;
    expect(map.className).toContain("xl:flex-1");
    expect(map.className).not.toContain("xl:h-full");
  });
  it("verdict filter narrows every panel", async () => {
    await seeded();
    fireEvent.click(screen.getByRole("checkbox", { name: "Play" }));
    await waitFor(() => expect(screen.getAllByTestId("boxscore-row")).toHaveLength(8));
    expect(screen.getAllByTestId("matrix-point")).toHaveLength(7);
  });
  it("filter changed mid-stream sticks, and later countries are visible", async () => {
    renderPage(25);
    fireEvent.click(screen.getByText("seed"));
    await waitFor(() => expect(screen.getAllByTestId("boxscore-row").length).toBeGreaterThan(0), { timeout: 3000 });
    fireEvent.click(await screen.findByRole("checkbox", { name: "Play" }));
    await waitFor(() => expect(screen.getByText("Chicago")).toBeTruthy(), { timeout: 5000 });
    await waitFor(() => expect(screen.getByText("Belo Horizonte")).toBeTruthy(), { timeout: 5000 });
    expect((screen.getByRole("checkbox", { name: "Play" }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getAllByTestId("boxscore-row")).toHaveLength(8);
  });
  it("a new brief resets filters", async () => {
    await seeded();
    fireEvent.click(screen.getByRole("checkbox", { name: "Play" }));
    await waitFor(() => expect(screen.getAllByTestId("boxscore-row")).toHaveLength(8));
    fireEvent.click(screen.getByText("seed2"));
    await waitFor(() => expect(screen.getAllByTestId("boxscore-row")).toHaveLength(10), { timeout: 3000 });
    expect((screen.getByRole("checkbox", { name: "Play" }) as HTMLInputElement).checked).toBe(true);
  });
  it("source filter offers All / Fresh / Stale", async () => {
    await seeded();
    for (const n of ["All", "Fresh", "Stale"]) expect(screen.getByRole("radio", { name: n })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /live|cached/i })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Stale" }));
    await waitFor(() => expect(screen.queryAllByTestId("boxscore-row")).toHaveLength(0));
  });
  it("shows an honest empty state with Reset when every market is filtered out", async () => {
    await seeded();
    fireEvent.click(screen.getByRole("radio", { name: "Stale" }));
    await waitFor(() => expect(screen.queryAllByTestId("matrix-point")).toHaveLength(0));
    expect(screen.getAllByText("No markets match the filters").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Fan heat →")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Reset filters" })[0]!);
    await waitFor(() => expect(screen.getAllByTestId("boxscore-row")).toHaveLength(10));
  });
  it("matrix is a labelled group (no focusable content inside role=img) with keyboard-selectable points and a table toggle", async () => {
    await seeded();
    expect(screen.getByRole("group", { name: /9 markets plotted/ })).toBeTruthy();
    expect(screen.queryByRole("img", { name: /9 markets plotted/ })).toBeNull();
    const point = screen.getAllByRole("button", { name: /Guadalajara/ }).find((b) => b.getAttribute("data-testid") === "matrix-point")!;
    fireEvent.keyDown(point, { key: "Enter" });
    expect(point.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.queryAllByTestId("matrix-point")).toHaveLength(0);
    expect(within(screen.getByTestId("matrix-table")).getAllByRole("row")).toHaveLength(11);
  });
  it("matrix toggle is at least 44px and clicks resolve to the nearest point", async () => {
    await seeded();
    expect(screen.getByRole("button", { name: "Table" }).className).toMatch(/\bh-11\b/);
    const overlay = screen.getByTestId("matrix-overlay");
    const svg = overlay.closest("svg")!;
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 480, height: 320, right: 480, bottom: 320, x: 0, y: 0, toJSON() {} });
    const rio = matrixPoints(SAMPLE_CITIES, { w: 480, h: 320, pad: 36 }).find((p) => p.name === "Rio de Janeiro")!;
    fireEvent.click(overlay, { clientX: rio.x, clientY: rio.y });
    const sel = screen.getAllByTestId("matrix-point").find((g) => g.getAttribute("aria-pressed") === "true")!;
    expect(sel.getAttribute("data-city-id")).toBe(rio.id);
    expect(sel.getAttribute("aria-label")).toMatch(/Rio de Janeiro/);
  });
  it("mobile shows a Filters (n) button opening a sheet", async () => {
    desktop = false;
    await seeded();
    fireEvent.click(screen.getByRole("button", { name: "Filters (0)" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Play" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Filters (1)" })).toBeTruthy());
  });
  it("Export CSV downloads a UTF-8 BOM Blob named after the artist", async () => {
    await seeded();
    const blobs: Blob[] = [];
    const revoke = vi.fn();
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = (b: Blob) => { blobs.push(b); return "blob:x"; };
      static revokeObjectURL = revoke;
    });
    let name = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { name = this.download; });
    fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));
    expect(blobs).toHaveLength(1);
    expect(name).toBe("taste-insights-lumen-vale.csv");
    expect(revoke).toHaveBeenCalled();
    const buf = await new Promise<ArrayBuffer>((res) => { const r = new FileReader(); r.onload = () => res(r.result as ArrayBuffer); r.readAsArrayBuffer(blobs[0]!); });
    const bytes = new Uint8Array(buf);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    expect(text).toContain("Guadalajara,MX,0.84,0.79,0.81,0.86,82,Hidden goldmine");
  });
  const pick = (name: RegExp) => fireEvent.click(screen.getAllByRole("button", { name }).find((b) => b.getAttribute("data-testid") === "matrix-point")!);
  it("cross-domain taste renders the selected city's sample playbook in sample mode", async () => {
    await seeded();
    pick(/Guadalajara/);
    expect(await screen.findByText("Bruma Nocturna")).toBeTruthy();
    expect(screen.queryByText("Live taste lookups need a live run")).toBeNull();
  });
  it("cross-domain taste explains which cities have sample playbooks", async () => {
    await seeded();
    pick(/Chicago/);
    expect(await screen.findByText("Sample playbooks cover Mexico City, São Paulo, Guadalajara and Curitiba")).toBeTruthy();
  });
  it("labels affinity numbers as fit", async () => {
    await seeded();
    expect((await screen.findAllByText(/0\.94 fit/)).length).toBeGreaterThan(0);
  });
  it("reuses a loaded playbook instead of streaming again", async () => {
    await loadPlaybook({ artist: "Lumen Vale", artistEntityId: "sample-lumen-vale", city: { id: "4005539", name: "Guadalajara", country: "MX" }, sample: true, delayMs: 0 });
    const spy = vi.spyOn(client, "streamCityPlaybook");
    await seeded();
    pick(/Guadalajara/);
    expect(await screen.findByText("Bruma Nocturna")).toBeTruthy();
    // The default focus city may stream its own sample playbook; Guadalajara's was already loaded.
    expect(spy.mock.calls.filter((c) => c[0].city === "Guadalajara")).toHaveLength(0);
  });
});
