// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, configure, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OFF, WorkspaceContext } from "@/lib/collab/workspaceContext";
import { loadPlaybook, resetPlaybooks } from "@/lib/qloo/playbookStore";
import { ToastProvider } from "@/components/ui/Toast";
import { TourBoardProvider } from "@/lib/qloo/TourBoardProvider";
import { parseShowcase, setShowcase } from "@/lib/qloo/showcase";
import { PLACEHOLDER_SHOWCASE } from "@/lib/qloo/placeholderShowcase";
import { EXAMPLE_BANNER } from "@/lib/budget/example";
import type { AdvanceRisks } from "@/lib/qloo/types";
import TourBudget from "./TourBudget";

configure({ asyncUtilTimeout: 5000 });
const GDL = "4005539";

beforeEach(() => { vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} })); localStorage.clear(); });
afterEach(() => { setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE)); cleanup(); resetPlaybooks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname + l.search}</p>; }
const renderAt = (url: string, opts: { qc?: QueryClient; ws?: boolean } = {}) => {
  const page = (
    <QueryClientProvider client={opts.qc ?? new QueryClient()}>
      <TourBoardProvider sampleDelayMs={0}>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tours/budget" element={<TourBudget />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </TourBoardProvider>
    </QueryClientProvider>
  );
  return render(<ToastProvider>{opts.ws ? <WorkspaceContext.Provider value={{ ...OFF, enabled: true, ws: "abc12345" }}>{page}</WorkspaceContext.Provider> : page}</ToastProvider>);
};
const ready = async () => { await screen.findByRole("heading", { name: "Tour budget", level: 1 }); await screen.findByLabelText("Artist fee, Guadalajara"); };
const type = async (label: string, v: string) => { const el = screen.getByLabelText(label); await userEvent.clear(el); await userEvent.type(el, v); };
const result = (id: string, k: string) => screen.getByTestId(`result-${id}-${k}`).textContent;

describe("Tour budget page", () => {
  it("blank state: every input is empty and no result is a number", async () => {
    renderAt("/tours/budget?sample=1");
    await ready();
    for (const el of document.querySelectorAll<HTMLInputElement>("input[type=text], input[inputmode]")) expect(el.value).toBe("");
    expect(result(GDL, "cost")).toBe("—");
    expect(result(GDL, "income")).toBe("—");
    expect(result(GDL, "margin")).toBe("—");
    expect(result(GDL, "breakEven")).toBe("—");
    expect(screen.getByTestId("total-margin").textContent).toBe("—");
    expect(screen.getByTestId("hint-margin-" + GDL).textContent).toBe("Fill in at least one cost to see margin");
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  });
  it("shows the routing legs with derived km, mode, travel days and totals", async () => {
    renderAt("/tours/budget?sample=1");
    await ready();
    const table = screen.getByRole("table", { name: "Routing legs" });
    expect(within(table).getAllByRole("row")).toHaveLength(1 + 3);
    expect(screen.getByTestId("leg-totals").textContent).toMatch(/^3 legs · [\d,]+ km · \d+ travel days$/);
    expect(screen.getByText(/app assumption/i)).toBeTruthy();
  });
  it("states one currency per budget with no conversion, and offers USD, MXN, BRL", async () => {
    renderAt("/tours/budget?sample=1");
    await ready();
    const sel = screen.getByLabelText("Currency") as HTMLSelectElement;
    expect([...sel.options].map((o) => o.value)).toEqual(["USD", "MXN", "BRL"]);
    expect(screen.getByText(/One currency per budget\. No conversion/)).toBeTruthy();
  });
  it("works out a city from typed numbers", async () => {
    renderAt("/tours/budget?sample=1");
    await ready();
    await type("Artist fee, Guadalajara", "10000");
    await type("Venue costs, Guadalajara", "2000");
    await type("Ticket price, Guadalajara", "50");
    await type("Capacity, Guadalajara", "400");
    await type("Sell-through %, Guadalajara", "80");
    expect(result(GDL, "cost")).toBe("12,000");
    expect(result(GDL, "income")).toBe("16,000");
    expect(result(GDL, "margin")).toBe("4,000");
    expect(result(GDL, "breakEven")).toBe("240");
    expect(screen.getByTestId(`sens-${GDL}-60`).textContent).toBe("0"); // 240 x 50 - 12,000
  });
  it("numeric inputs use a numeric keyboard and every input has a label", async () => {
    renderAt("/tours/budget?sample=1");
    await ready();
    expect(screen.getByLabelText("Artist fee, Guadalajara").getAttribute("inputmode")).toBe("decimal");
    expect(screen.getByLabelText("Capacity, Guadalajara").getAttribute("inputmode")).toBe("numeric");
    for (const el of document.querySelectorAll("input, select")) expect(el.getAttribute("aria-label") || el.id && document.querySelector(`label[for="${el.id}"]`)).toBeTruthy();
  });
  it("copy this city's values to all cities", async () => {
    renderAt("/tours/budget?sample=1");
    await ready();
    await type("Artist fee, Guadalajara", "7000");
    await userEvent.click(screen.getByRole("button", { name: "Copy this city's values to all cities (Guadalajara)" }));
    expect((screen.getByLabelText("Artist fee, Curitiba") as HTMLInputElement).value).toBe("7000");
  });
  it("saves per tour in localStorage and Clear budget empties it", async () => {
    const first = renderAt("/tours/budget?sample=1");
    await ready();
    await type("Artist fee, Guadalajara", "7000");
    const keys = Object.keys(localStorage).filter((k) => k.startsWith("tiq.budget."));
    expect(keys).toHaveLength(1);
    first.unmount();
    renderAt("/tours/budget?sample=1");
    await ready();
    expect((screen.getByLabelText("Artist fee, Guadalajara") as HTMLInputElement).value).toBe("7000");
    await userEvent.click(screen.getByRole("button", { name: "Clear budget" }));
    expect((screen.getByLabelText("Artist fee, Guadalajara") as HTMLInputElement).value).toBe("");
    expect(localStorage.getItem(keys[0]!)).toBeNull();
    expect(document.querySelector("[data-toast-viewport]")?.textContent ?? "").toContain("Budget cleared.");
  });
  it("Load example fills fictional figures and keeps a persistent banner, even after edits", async () => {
    renderAt("/tours/budget?sample=1");
    await ready();
    expect(screen.queryByText(EXAMPLE_BANNER)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Load example (fictional figures)" }));
    expect(screen.getByText(EXAMPLE_BANNER)).toBeTruthy();
    expect((screen.getByLabelText("Artist fee, Guadalajara") as HTMLInputElement).value).toBe("10000");
    expect(document.querySelector("[data-toast-viewport]")?.textContent ?? "").toContain("Example budget loaded. The figures are fictional.");
    await type("Artist fee, Guadalajara", "9000");
    expect(screen.getByText(EXAMPLE_BANNER)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Clear budget" }));
    expect(screen.queryByText(EXAMPLE_BANNER)).toBeNull();
  });
  it("shows an Advance risk note only when that city's Advance data is already loaded", async () => {
    const qc = new QueryClient();
    renderAt("/tours/budget?sample=1", { qc });
    await ready();
    expect(screen.queryByText(/Visa lead time/)).toBeNull();
    const risks: AdvanceRisks = { weather: { status: "unavailable", message: "x" }, equipment: { status: "unavailable", message: "x" }, holidays: { status: "ok", source: "s", sourceUrl: "u", items: [{ date: "2027-03-20", name: "Holy Week", localName: "x", near: true }] }, visa: { status: "ok", summary: "s", leadTime: "6-8 weeks", items: [], sources: [], cached: false }, generatedAt: "t" };
    act(() => { qc.setQueryData(["advance", true, "default", GDL, "a", "b", ""], risks); });
    const note = await screen.findByTestId(`advance-note-${GDL}`);
    expect(note.textContent).toContain("Visa lead time: 6-8 weeks");
    expect(note.textContent).toContain("Holy Week");
    expect(screen.queryByTestId("advance-note-3464975")).toBeNull();
  });
  it("offers Discuss (the city's notes thread) only with a workspace", async () => {
    renderAt("/tours/budget?sample=1");
    await ready();
    expect(screen.queryByRole("button", { name: /Discuss for Guadalajara/ })).toBeNull();
    cleanup();
    renderAt("/tours/budget?sample=1", { ws: true });
    await ready();
    expect(screen.getByRole("button", { name: /Discuss for Guadalajara/ })).toBeTruthy();
  });
  it("links a sponsor by name from the city's loaded playbook, and offers none otherwise", async () => {
    renderAt("/tours/budget?sample=1");
    await ready();
    expect([...(screen.getByLabelText("Sponsor name, Guadalajara") as HTMLSelectElement).options].map((o) => o.text)).toEqual(["No sponsor linked"]);
    await act(async () => { await loadPlaybook({ artist: "Lumen Vale", artistEntityId: "sample-lumen-vale", city: { id: GDL, name: "Guadalajara", country: "MX" }, sample: true, sampleSet: "default", delayMs: 0 }); });
    const sel = await screen.findByLabelText("Sponsor name, Guadalajara") as HTMLSelectElement;
    expect([...sel.options].map((o) => o.text)).toEqual(["No sponsor linked", "Cerro Alto Mezcal", "Brisa Vinyl Bar", "Ola Norte Surf Supply"]);
    await userEvent.selectOptions(sel, "Brisa Vinyl Bar");
    expect(sel.value).toBe("Brisa Vinyl Bar");
  });
  it("Copy as CSV puts the table on the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    renderAt("/tours/budget?sample=1");
    await ready();
    await type("Artist fee, Guadalajara", "5000");
    await userEvent.click(screen.getByRole("button", { name: "Copy as CSV" }));
    expect(writeText).toHaveBeenCalledTimes(1);
    const csv = writeText.mock.calls[0]![0] as string;
    expect(csv.startsWith("City,Currency,Artist fee")).toBe(true);
    expect(csv).toContain("Guadalajara,USD,5000");
    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain("CSV copied.");
    expect(toast.closest("[data-toast-viewport]")).not.toBeNull();
    expect(document.querySelectorAll("[role=status]")).toHaveLength(1);
  });
  it("a blocked clipboard is an error toast", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error("no")) } });
    renderAt("/tours/budget?sample=1");
    await ready();
    await userEvent.click(screen.getByRole("button", { name: "Copy as CSV" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't copy");
  });
  it("makes no network call", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    renderAt("/tours/budget?sample=1");
    await ready();
    await userEvent.click(screen.getByRole("button", { name: "Load example (fictional figures)" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear budget" }));
    expect(f).not.toHaveBeenCalled();
  });
  it("keeps ?sample and ws on its links back to the board and the book", async () => {
    renderAt("/tours/budget?sample=1&ws=abc12345", { ws: true });
    await ready();
    expect(screen.getByRole("link", { name: "Tour Board" }).getAttribute("href")).toBe("/tours/board?sample=1&ws=abc12345");
    expect(screen.getByRole("link", { name: "Tour Book" }).getAttribute("href")).toBe("/tours/book?sample=1&ws=abc12345");
  });
  it("without any run or showcase it points back to the board", async () => {
    renderAt("/tours/budget");
    expect(await screen.findByText(/Build a tour from a Tour Board first|Waiting for the board/)).toBeTruthy();
    void fireEvent;
  });
});
