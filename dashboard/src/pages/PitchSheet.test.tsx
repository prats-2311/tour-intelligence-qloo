// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import indexCss from "@/index.css?raw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptySnapshot } from "@/lib/collab/types";
import { OFF, WorkspaceContext } from "@/lib/collab/workspaceContext";
import { PLACEHOLDER_SHOWCASE } from "@/lib/qloo/placeholderShowcase";
import { resetPlaybooks } from "@/lib/qloo/playbookStore";
import { loadSegments, resetSegments } from "@/lib/qloo/segmentStore";
import type { SponsorSegments } from "@/lib/qloo/segments";
import { parseShowcase, setShowcase, showcasePlaybookCities, showcasePlaybookEvents } from "@/lib/qloo/showcase";
import { ToastProvider } from "@/components/ui/Toast";
import { TourBoardProvider } from "@/lib/qloo/TourBoardProvider";
import type { GatewayEvent } from "@/lib/qloo/types";
import syntheticShowcase from "@/test/fixtures/showcase.synthetic.json";
import PitchSheet from "./PitchSheet";

const GDL = "/tours/pitch/4005539/Cerro%20Alto%20Mezcal";
beforeEach(() => { vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} })); });
afterEach(() => { setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE)); cleanup(); resetPlaybooks(); resetSegments(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const renderAt = (url: string, ws?: Parameters<typeof WorkspaceContext.Provider>[0]["value"]) =>
  render(
    <ToastProvider><QueryClientProvider client={new QueryClient()}>
      <WorkspaceContext.Provider value={ws ?? OFF}>
        <TourBoardProvider sampleDelayMs={0}>
          <MemoryRouter initialEntries={[url]}>
            <Routes>
              <Route path="/tours/pitch/:cityId/:brand" element={<PitchSheet />} />
              <Route path="/tours/playbook/:cityId" element={<p>playbook</p>} />
            </Routes>
          </MemoryRouter>
        </TourBoardProvider>
      </WorkspaceContext.Provider>
    </QueryClientProvider></ToastProvider>,
  );
const stubFetch = (body: unknown = {}) => { const f = vi.fn(async () => new Response(JSON.stringify(body))); vi.stubGlobal("fetch", f); return f; };

describe("pitch sheet page", () => {
  it("renders every section from the sample playbook, with the draft footer", async () => {
    renderAt(`${GDL}?sample=1`);
    expect(await screen.findByRole("heading", { level: 1, name: "Cerro Alto Mezcal × Lumen Vale — Guadalajara" })).toBeTruthy();
    expect(screen.getByText("Prepared with Tour Intelligence × Qloo", { exact: false })).toBeTruthy();
    for (const h of ["Why this brand", "Who loves it most", "Where the fans are", "The night", "This week in the city", "Evidence and trust"]) expect(screen.getByRole("heading", { name: h })).toBeTruthy();
    expect(screen.getByText("Lumen Vale's fans rank Cerro Alto Mezcal #1 in Guadalajara.")).toBeTruthy();
    expect(screen.getByText("Colonia Americana")).toBeTruthy();
    expect(screen.getByText("38%")).toBeTruthy();
    expect(screen.getByText(/Best room: C3 Stage/)).toBeTruthy();
    expect(screen.getByText(/Suggested opening act: Bruma Nocturna/)).toBeTruthy();
    expect(screen.getByText("Suggestion")).toBeTruthy();
    expect(screen.getByText("Cerro Alto Mezcal presale and co-branded night at C3 Stage, with a pop-up in Colonia Americana.")).toBeTruthy();
    expect(screen.getByText(/Sponsors card claims: \d+ verified · \d+ removed/)).toBeTruthy();
    expect(screen.getByText("Draft for discussion — not an offer or agreement.")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /^\[\d\]/ })[0]!.getAttribute("href")).toMatch(/^https:/);
  });
  it("shows age bands only when the session store already has them, and never fetches", async () => {
    const f = stubFetch();
    renderAt(`${GDL}?sample=1`);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByText("Open 'By age group' on the playbook to add the age breakdown.")).toBeTruthy();
    expect(f).not.toHaveBeenCalled();
    cleanup();
    const answer: SponsorSegments = { status: "ok", indexes: {}, bands: [{ band: "25_to_29", phrase: "25-29", index: 0.91, status: "ok", hiddenCount: 0, newInTop5: 1, lifted: true, items: [{ name: "Cerro Alto Mezcal", entityId: "e", artistRank: 2, cityRank: null }] }] };
    stubFetch(answer);
    await loadSegments({ artistId: "sample-lumen-vale", city: { id: "4005539", name: "Guadalajara", country: "MX" } });
    const g = stubFetch();
    renderAt(`${GDL}?sample=1`);
    expect(await screen.findByText("Aged 25–29: #2 in this band, index +0.91 vs the average audience, not a share.")).toBeTruthy();
    expect(screen.queryByText(/Open 'By age group'/)).toBeNull();
    expect(g).not.toHaveBeenCalled();
  });
  it("refuses a do-not-book act or a non-sponsor organisation and never prints the name", async () => {
    for (const brand of ["Ariel%20Pink", "Planned%20Parenthood"]) {
      renderAt(`/tours/pitch/4005539/${brand}?sample=1`);
      expect(await screen.findByText("This name isn't available for a pitch sheet.")).toBeTruthy();
      expect(document.body.textContent).not.toMatch(/Ariel Pink|Planned Parenthood/);
      expect(screen.getByRole("link", { name: "Back to playbook" })).toBeTruthy();
      cleanup();
    }
  });
  it("keeps showcase, sample and ws on the Back link and drops everything else", async () => {
    renderAt(`${GDL}?sample=1&ws=abcdefghij12&junk=1`);
    const back = await screen.findByRole("link", { name: "Back to playbook" });
    expect(back.getAttribute("href")).toBe("/tours/playbook/4005539?sample=1&ws=abcdefghij12");
  });
  it("opens the recorded example from ?showcase=1 and dates the evidence by the recording", async () => {
    setShowcase(parseShowcase(syntheticShowcase));
    const city = showcasePlaybookCities()[0]!;
    const pb = showcasePlaybookEvents(city.id)!.find((e): e is Extract<GatewayEvent, { type: "playbook" }> => e.type === "playbook")!;
    const brand = String(pb.playbook.cards.find((c) => c.kind === "sponsors" && c.status === "ok")!.items[0]!.name);
    renderAt(`/tours/pitch/${city.id}/${encodeURIComponent(brand)}?showcase=1`);
    expect(await screen.findByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.getByText(/Qloo results recorded on \d+ \w+ \d{4} \(recorded example\)/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to playbook" }).getAttribute("href")).toBe(`/tours/playbook/${city.id}?showcase=1`);
  });
  it("shows the team's latest line when the workspace names the brand", async () => {
    const snap = { ...emptySnapshot("ws-1234567890"), leads: { "4005539": [{ id: "l", text: "Cerro Alto Mezcal: ask Ana", name: "Ana", role: "Manager" as const, at: 5 }] } };
    renderAt(`${GDL}?sample=1`, { ...OFF, enabled: true, snapshot: snap });
    expect(await screen.findByText('Sponsor lead: "Cerro Alto Mezcal: ask Ana" — Ana (Manager)')).toBeTruthy();
  });
  it("prints through window.print and hides the app chrome and actions in print CSS", async () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);
    const { container } = renderAt(`${GDL}?sample=1`);
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Print / Save as PDF" }));
    expect(print).toHaveBeenCalledOnce();
    expect(container.querySelector(".pitch-sheet")).toBeTruthy();
    expect(container.querySelector("[data-pitch-actions]")?.hasAttribute("data-noprint")).toBe(true);
    const css = indexCss;
    const printCss = css.slice(css.lastIndexOf("@media print"));
    expect(printCss).toMatch(/body:has\(\.pitch-sheet\) \[data-app-shell\]/);
    for (const chrome of ["[data-breadcrumbs]", "[data-mobile-bar]", '[data-tour="ask"]']) expect(printCss).toContain(`body:has(.pitch-sheet) ${chrome}`);
    expect(printCss).toMatch(/body:has\(\.pitch-sheet\) \[data-app-shell\][^{]*\{[^}]*display: none/);
    expect(printCss).toMatch(/\.pitch-sheet \[data-noprint\]/);
    expect(css).toMatch(/@page\s*\{[^}]*margin/);
  });
  it("copies the sheet as plain text", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderAt(`${GDL}?sample=1`);
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Copy as text" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const text = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(text).toContain("Cerro Alto Mezcal × Lumen Vale — Guadalajara");
    expect(text).toContain("Draft for discussion — not an offer or agreement.");
    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain("Pitch sheet copied as text.");
    expect(screen.queryByRole("button", { name: "Copied" })).toBeNull(); // the button label never changes width
    expect(screen.getByRole("button", { name: "Copy as text" })).toBeTruthy();
    expect(within(document.body).queryByText(/Ariel Pink/)).toBeNull();
  });
});

import { MemoryRouter as MR } from "react-router-dom";
import { CardBody } from "@/components/playbook/cardBody";
import type { PlaybookCard } from "@/lib/qloo/types";

describe("Pitch sheet action on the Sponsors card", () => {
  const sponsors = { kind: "sponsors", status: "ok", refs: [], warnings: [], items: [{ name: "Stüssy", artistRank: 1, cityRank: null }, { name: "HUF", artistRank: 2, cityRank: 4 }, { name: "Greenpeace", artistRank: 3, cityRank: 5 }] } as PlaybookCard;
  const body = (props: { pitchCityId?: string }, at = "/tours/playbook/9?showcase=1&ws=abcdefghij12&x=1") => render(<MR initialEntries={[at]}><CardBody card={sponsors} city="Los Angeles" {...props} /></MR>);
  it("gives each shown sponsor row a Pitch sheet link that keeps showcase and ws", () => {
    body({ pitchCityId: "9" });
    const links = screen.getAllByRole("link", { name: /^Pitch sheet/ });
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/tours/pitch/9/St%C3%BCssy?showcase=1&ws=abcdefghij12", "/tours/pitch/9/HUF?showcase=1&ws=abcdefghij12"]);
    expect(links[0]!.getAttribute("aria-label")).toBe("Pitch sheet for Stüssy");
    expect(links[0]!.textContent).toMatch(/^Pitch sheet/);
  });
  it("shows no action where the card has no pitch target (the Tour Book list)", () => {
    body({});
    expect(screen.queryByRole("link", { name: /Pitch sheet/ })).toBeNull();
  });
});
