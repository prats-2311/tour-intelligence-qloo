// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, configure, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "@/lib/qloo/client";
import { buildSavedRun } from "@/lib/tours/savedRun";
import { boardReducer, initialBoard } from "@/lib/qloo/tourBoardReducer";
import { LUMEN_VALE_SAMPLE, SAMPLE_BRIEF } from "@/lib/qloo/fixtures/lumenVale";
import { countQlooCalls } from "@/lib/qloo/narrate";
import { resetPlaybooks } from "@/lib/qloo/playbookStore";
import { ToastProvider } from "@/components/ui/Toast";
import { TourBoardProvider, useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { parseShowcase, setShowcase } from "@/lib/qloo/showcase";
import { PLACEHOLDER_SHOWCASE } from "@/lib/qloo/placeholderShowcase";
import syntheticShowcase from "@/test/fixtures/showcase.synthetic.json";
import TourBook from "./TourBook";

// Four sample playbooks are prepared one after another at the page's 10 ms replay pace.
configure({ asyncUtilTimeout: 5000 });

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE));
  cleanup();
  resetPlaybooks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// jsdom's Blob has no text().
const readBlob = (b: Blob) => new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsText(b); });

function RunNoWindow() {
  const { run } = useTourBoard();
  useEffect(() => { run({ ...SAMPLE_BRIEF, dateWindow: undefined }, { sample: true }); }, [run]);
  return null;
}

function ChooseShortlist() {
  const { state, setShortlist } = useTourBoard();
  useEffect(() => { if (state.status === "done") setShortlist(["3530597"]); }, [state.status, setShortlist]);
  return null;
}

function EmptyShortlist() {
  const { state, setShortlist } = useTourBoard();
  useEffect(() => { if (state.status === "done") setShortlist([]); }, [state.status, setShortlist]);
  return null;
}

const renderAt = (url: string, extra?: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider><TourBoardProvider sampleDelayMs={0}>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tours/book" element={<TourBook />} />
            <Route path="/tours/board" element={<p>board</p>} />
          </Routes>
          {extra}
        </MemoryRouter>
      </TourBoardProvider></ToastProvider>
    </QueryClientProvider>,
  );

const BUDGET_KEY = "tiq.budget.sample|default|Lumen Vale";
describe("TourBook budget", () => {
  it("links to the Tour budget and shows no Budget section when nothing was filled in", async () => {
    localStorage.clear();
    renderAt("/tours/book?sample=1");
    await screen.findByRole("heading", { name: "Curitiba", level: 2 });
    expect(screen.getByRole("link", { name: "Tour budget" }).getAttribute("href")).toBe("/tours/budget?sample=1");
    expect(screen.queryByTestId("chapter-budget-4005539")).toBeNull();
  });
  it("shows each chapter's computed numbers from the saved budget, only those the user has filled in", async () => {
    const gdl = { artistFee: "10000", venue: "2000", production: "", crew: "", marketing: "", ticketPrice: "50", capacity: "400", sellThrough: "80", merchPerHead: "", sponsor: "", sponsorName: "" };
    localStorage.setItem(BUDGET_KEY, JSON.stringify({ currency: "MXN", cities: { "4005539": gdl }, legs: {}, perDiem: "", crewSize: "", hotel: "", rooms: "", example: false }));
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    renderAt("/tours/book?sample=1");
    await screen.findByRole("heading", { name: "Curitiba", level: 2 });
    const sec = screen.getByTestId("chapter-budget-4005539");
    expect(within(sec).getByRole("heading", { name: "Budget", level: 3 })).toBeTruthy();
    expect(sec.textContent).toContain("Cost 12,000 MXN");
    expect(sec.textContent).toContain("Income 16,000 MXN");
    expect(sec.textContent).toContain("Margin 4,000 MXN");
    expect(sec.textContent).toContain("Break-even 240 tickets");
    expect(screen.queryByTestId("chapter-budget-3530597")).toBeNull(); // Mexico City: nothing filled in
    localStorage.clear();
  });
  it("leaves out numbers it cannot work out instead of showing a dash or zero", async () => {
    localStorage.setItem(BUDGET_KEY, JSON.stringify({ currency: "USD", cities: { "4005539": { artistFee: "10000" } }, legs: {}, perDiem: "", crewSize: "", hotel: "", rooms: "", example: false }));
    renderAt("/tours/book?sample=1");
    await screen.findByRole("heading", { name: "Curitiba", level: 2 });
    const sec = screen.getByTestId("chapter-budget-4005539");
    expect(sec.textContent).toContain("Cost 10,000 USD");
    expect(sec.textContent).not.toMatch(/Income|Margin|Break-even|—|NaN/);
    localStorage.clear();
  });
});

function LoadSaved() {
  const { loadSaved } = useTourBoard();
  useEffect(() => {
    let st = boardReducer(initialBoard, { type: "start", brief: SAMPLE_BRIEF, source: "live" });
    for (const event of LUMEN_VALE_SAMPLE) st = boardReducer(st, { type: "event", event });
    loadSaved(buildSavedRun(st, {}), "t-1");
  }, [loadSaved]);
  return null;
}

describe("TourBook which-tour header", () => {
  it("an example run says which tour it is, tags it Example and links to Switch tour", async () => {
    renderAt("/tours/book?sample=1");
    await screen.findByRole("heading", { name: "Market selection" });
    const line = screen.getByTestId("book-which-tour");
    expect(line.textContent).toContain("Tour Book for Lumen Vale tour");
    expect(within(line).getByText("Example")).toBeTruthy();
    expect(line.hasAttribute("data-noprint")).toBe(true);
    expect(screen.getByRole("link", { name: "Switch tour →" }).getAttribute("href")).toBe("/tours/mine");
  });
  it("a saved tour is tagged Saved", async () => {
    renderAt("/tours/book?saved=t-1", <LoadSaved />);
    await screen.findByRole("heading", { name: "Market selection" });
    const line = screen.getByTestId("book-which-tour");
    expect(within(line).getByText(/^Saved/)).toBeTruthy();
    expect(within(line).queryByText("Example")).toBeNull();
  });
});

describe("TourBook", () => {
  it("hides Save as campaign in sample mode", async () => {
    renderAt("/tours/book?sample=1");
    await screen.findByRole("heading", { name: "Market selection" });
    expect(screen.queryByRole("button", { name: "Save as campaign" })).toBeNull();
  });
  it("prepares the sample shortlist and renders cover, market chapter and four city chapters", async () => {
    renderAt("/tours/book?sample=1");
    expect(await screen.findByRole("heading", { name: "Market selection" })).toBeTruthy();
    for (const name of ["Mexico City", "São Paulo", "Guadalajara", "Curitiba"]) expect(await screen.findByRole("heading", { name, level: 2 })).toBeTruthy();
    // cover + four chapters + provenance appendix + the print-only running footer
    expect(screen.getAllByText("Sample data — illustrative, not Qloo output")).toHaveLength(7);
    expect(document.querySelectorAll(".tour-book [data-print-footer]")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Lumen Vale", level: 1 })).toBeTruthy();
    expect(screen.getByText("Don't just find your fans. Win their city.")).toBeTruthy();
  });
  it("shows verdict clocks on every chapter, states the 6-week rule once, and appends the Qloo calls", async () => {
    renderAt("/tours/book?sample=1");
    await screen.findByRole("heading", { name: "Market selection" });
    await screen.findByRole("heading", { name: "Curitiba", level: 2 });
    expect(screen.getAllByTestId("verdict-clocks")).toHaveLength(4);
    expect(screen.getAllByTestId("verdict-clocks")[0]!.textContent).toMatch(/^on-sale (in \d+ days|today|tomorrow|\d+ days? ago) · posters by .+ · confirm sponsor by /);
    expect(screen.getAllByText("Dates assume a 6-week on-sale lead before the first show; change the window in the brief.")).toHaveLength(1);
    const appendix = screen.getByRole("heading", { name: "Qloo calls behind this book", level: 2 });
    const provenance = screen.getByRole("heading", { name: "Provenance", level: 2 });
    expect(provenance.compareDocumentPosition(appendix) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByTestId("calls-city")).toHaveLength(4);
  });
  it("the board chip, the provenance line and the appendix total reconcile", async () => {
    renderAt("/tours/book?sample=1");
    await screen.findByRole("heading", { name: "Curitiba", level: 2 });
    // The board chip renders countQlooCalls(board log); the book reads the same log.
    const board = countQlooCalls(LUMEN_VALE_SAMPLE).total;
    const line = /^This book: (\d+) Qloo requests \(board (\d+) \+ (\d+) playbooks (\d+)\)$/.exec(screen.getByTestId("provenance-calls").textContent!)!;
    expect(Number(line[2])).toBe(board);
    expect(Number(line[3])).toBe(4);
    expect(Number(line[1])).toBe(Number(line[2]) + Number(line[4]));
    expect(screen.getByTestId("calls-total").textContent).toBe(`This book used ${line[1]} Qloo requests (board ${line[2]} + playbooks ${line[4]}).`);
  });
  it("shows the clocks on a showcase run when its brief carries a window", async () => {
    const show = parseShowcase(JSON.parse(JSON.stringify(syntheticShowcase)));
    show.brief = { ...show.brief, dateWindow: { start: "2027-03-12", end: "2027-04-18" } };
    setShowcase(show);
    renderAt("/tours/book?showcase=1");
    await screen.findByRole("heading", { name: "Market selection" });
    expect((await screen.findAllByTestId("verdict-clocks")).length).toBeGreaterThan(0);
    expect(screen.getByTestId("clock-rule")).toBeTruthy();
  });
  it("hides the clocks and the rule without a date window", async () => {
    renderAt("/tours/book", <RunNoWindow />);
    await screen.findByRole("button", { name: "Calendar" });
    await screen.findByRole("heading", { name: "Qloo calls behind this book", level: 2 }).catch(() => null);
    expect(screen.queryByTestId("verdict-clocks")).toBeNull();
    expect(screen.queryByTestId("clock-rule")).toBeNull();
  });
  it("Download PDF prints and Calendar downloads an .ics named after the artist", async () => {
    const print = vi.fn(); vi.stubGlobal("print", print);
    const created: Blob[] = [];
    vi.stubGlobal("URL", { ...URL, createObjectURL: (b: Blob) => { created.push(b); return "blob:x"; }, revokeObjectURL: () => {} });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toBe("lumen-vale-holds.ics"); });
    renderAt("/tours/book?sample=1");
    fireEvent.click(await screen.findByRole("button", { name: "Download PDF" }));
    expect(print).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    expect(click).toHaveBeenCalled();
    expect(await readBlob(created[0]!)).toContain("SUMMARY:Hold — Guadalajara\\, MX");
    const toast = await screen.findByText("Calendar file downloaded.");
    expect(toast.closest("[data-toast-viewport]")).not.toBeNull();
    expect(toast.closest("[aria-live]")?.getAttribute("aria-live")).toBe("polite");
  });
  it("Share uses the Web Share API when available, else copies the link", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, share });
    renderAt("/tours/book?sample=1");
    fireEvent.click(await screen.findByRole("button", { name: "Share" }));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining("Lumen Vale"), url: location.href }));
    cleanup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, share: undefined, clipboard: { writeText } });
    renderAt("/tours/book?sample=1");
    fireEvent.click(await screen.findByRole("button", { name: "Share" }));
    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain("Link copied");
    expect(toast.closest("[data-toast-viewport]")).not.toBeNull();
    expect(document.querySelectorAll("[role=status]")).toHaveLength(1); // nothing inline beside the toast
    expect(writeText).toHaveBeenCalled();
    cleanup();
    vi.stubGlobal("navigator", { ...navigator, share: undefined, clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    renderAt("/tours/book?sample=1");
    fireEvent.click(await screen.findByRole("button", { name: "Share" }));
    const alert = await screen.findByRole("alert");
    expect((within(alert).getByLabelText("Text to copy") as HTMLInputElement).value).toBe(location.href);
  });
  it("loads playbooks one at a time", async () => {
    let active = 0, maxActive = 0;
    const real = client.streamCityPlaybook;
    vi.spyOn(client, "streamCityPlaybook").mockImplementation((q, o) => (async function* () {
      active += 1; maxActive = Math.max(maxActive, active);
      try { yield* real(q, o); } finally { active -= 1; }
    })());
    renderAt("/tours/book?sample=1");
    await screen.findByRole("heading", { name: "Curitiba", level: 2 });
    expect(maxActive).toBe(1);
  });
  it("shows an honest state on a deep link without a board", async () => {
    renderAt("/tours/book");
    expect(await screen.findByText("Build a tour from a Tour Board first")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to Tour Board" }).getAttribute("href")).toBe("/tours/board");
  });
  it("disables Calendar without a date window", async () => {
    renderAt("/tours/book", <RunNoWindow />);
    expect(await screen.findByRole("button", { name: "Calendar" })).toHaveProperty("disabled", true);
    expect(screen.getByText("Add a date window to export holds")).toBeTruthy();
  });
  it("one failed playbook becomes an incomplete chapter and the book still opens", async () => {
    const real = client.streamCityPlaybook;
    vi.spyOn(client, "streamCityPlaybook").mockImplementation((q, o) =>
      o?.cityId === "4005539" ? (async function* () { yield { type: "error" as const, code: "BUDGET", message: "x" }; })() : real(q, o));
    renderAt("/tours/book?sample=1");
    expect(await screen.findByText("Playbook incomplete — Session limit reached")).toBeTruthy();
    for (const name of ["Mexico City", "São Paulo", "Guadalajara", "Curitiba"]) expect(await screen.findByRole("heading", { name, level: 2 })).toBeTruthy();
    expect(screen.getAllByText(/\d+ verified · \d+ removed/).length).toBeGreaterThan(0);
  });
  it("waits while the board is streaming", async () => {
    vi.spyOn(client, "streamTourBoard").mockImplementation(() => (async function* () { await new Promise(() => {}); })());
    renderAt("/tours/book?sample=1");
    expect(await screen.findByText("Waiting for the board to finish…")).toBeTruthy();
  });
  it("with nothing held the book covers the default shortlist and says so in one line", async () => {
    renderAt("/tours/book", <><RunNoWindow /><EmptyShortlist /></>);
    expect(await screen.findByRole("heading", { name: "Market selection" })).toBeTruthy();
    expect(screen.getByTestId("default-shortlist-note").textContent).toMatch(/^Showing the \d+ markets we'd hold by default/);
    expect(screen.queryByText("No markets shortlisted — hold dates for cities on the Tour Board")).toBeNull();
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThan(2);
  });
  it("once the user has chosen a shortlist there is no default note", async () => {
    renderAt("/tours/book?sample=1", <ChooseShortlist />);
    await screen.findByRole("heading", { name: "Market selection" });
    expect(screen.queryByTestId("default-shortlist-note")).toBeNull();
  });
  it("a bare /tours/book with no run loads the example", async () => {
    setShowcase(parseShowcase(syntheticShowcase));
    renderAt("/tours/book");
    expect(await screen.findByRole("heading", { name: "Market selection" }, { timeout: 4000 })).toBeTruthy();
    expect(screen.queryByText("Build a tour from a Tour Board first")).toBeNull();
  });
  it("a run whose shortlist was never chosen names the default picks and how many", async () => {
    renderAt("/tours/book?sample=1");
    await screen.findByRole("heading", { name: "Market selection" });
    expect(screen.getByTestId("default-shortlist-note").textContent).toMatch(/^Showing the \d+ markets we'd hold by default: you haven't picked any yet\.$/);
  });
  it("desktop grid tracks never hard-code a sum wider than the lg content width", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    const { container } = renderAt("/tours/book?sample=1");
    await screen.findByRole("heading", { name: "Market selection" });
    const grid = container.querySelector(".book-page")!.parentElement!;
    expect(grid.className).toContain("lg:grid-cols-[minmax(180px,240px)_minmax(0,1fr)]");
    expect(grid.className).not.toContain("720px");
    expect(grid.className).not.toMatch(/grid-cols-\[240px_720px/);
  });
  it("Chapters opens the index sheet and lists every chapter with its verdict", async () => {
    renderAt("/tours/book?sample=1");
    fireEvent.click(await screen.findByRole("button", { name: "Chapters" }));
    const dialog = await screen.findByRole("dialog", { name: "Chapters" });
    expect(dialog.textContent).toContain("Market selection");
    expect(dialog.textContent).toContain("Guadalajara");
    expect(dialog.textContent).toContain("Hidden goldmine");
    expect(dialog.textContent).toContain("Provenance");
  });
});
