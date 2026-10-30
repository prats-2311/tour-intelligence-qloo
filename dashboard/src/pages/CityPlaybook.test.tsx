// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "@/lib/qloo/client";
import { SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import * as lumenPlaybooks from "@/lib/qloo/fixtures/lumenValePlaybooks";
import { samplePlaybookEvents } from "@/lib/qloo/fixtures/lumenValePlaybooks";
import { withArielPink } from "@/test/arielPink";
import { parseShowcase, setShowcase } from "@/lib/qloo/showcase";
import { PLACEHOLDER_SHOWCASE } from "@/lib/qloo/placeholderShowcase";
import syntheticShowcase from "@/test/fixtures/showcase.synthetic.json";
import { showcaseBrief } from "@/lib/qloo/showcase";
import { getPlaybook, playbookKey, resetPlaybooks } from "@/lib/qloo/playbookStore";
import { ToastProvider } from "@/components/ui/Toast";
import { TourBoardProvider, useTourBoard } from "@/lib/qloo/TourBoardProvider";
import CityPlaybook from "./CityPlaybook";

vi.mock("@/components/qloo/TourMap", () => ({ default: () => <div data-testid="map" /> }));

let desktop = false;
beforeEach(() => {
  desktop = false;
  vi.stubGlobal("matchMedia", () => ({ matches: desktop, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE));
  cleanup();
  resetPlaybooks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function FillShortlist({ except }: { except: string }) {
  const { state, setShortlist } = useTourBoard();
  useEffect(() => {
    if (state.status === "done") setShortlist(SAMPLE_CITIES.filter((c) => c.id !== except).map((c) => c.id));
  }, [state.status, except, setShortlist]);
  return null;
}

function Switch({ to }: { to: string }) {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(to)}>switch</button>;
}

const renderAt = (url: string, extra?: React.ReactNode) =>
  render(
    <ToastProvider><QueryClientProvider client={new QueryClient()}>
      <TourBoardProvider sampleDelayMs={0}>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tours/playbook/:cityId" element={<CityPlaybook />} />
            <Route path="/tours/board" element={<p>board</p>} />
          </Routes>
          {extra}
        </MemoryRouter>
      </TourBoardProvider>
    </QueryClientProvider></ToastProvider>,
  );

function Opened() {
  return <span data-testid="opened">{useTourBoard().lastOpenedId ?? ""}</span>;
}

describe("CityPlaybook", () => {
  it("the header links to the charts page, keeping the sample query", async () => {
    renderAt("/tours/playbook/4005539?sample=1");
    const link = await screen.findByRole("link", { name: "Charts" });
    expect(link.getAttribute("href")).toBe("/tours/insights?sample=1");
  });
  it("records the opened city in the run so the Playbook step returns to it", async () => {
    renderAt("/tours/playbook/4005539?sample=1", <Opened />);
    await screen.findByRole("heading", { name: "Guadalajara" });
    await waitFor(() => expect(screen.getByTestId("opened").textContent).toBe("4005539"));
  });
  it("renders the Guadalajara sample playbook standalone from ?sample=1", async () => {
    renderAt("/tours/playbook/4005539?sample=1");
    expect(await screen.findByRole("heading", { name: "Guadalajara" })).toBeTruthy();
    expect(screen.getByText("Sample data — illustrative, not Qloo output")).toBeTruthy();
    expect(await screen.findByText("Cerro Alto Mezcal is the strongest sponsor fit at 0.91.")).toBeTruthy();
    expect(screen.getByText("7 verified · 2 removed")).toBeTruthy();
    expect(screen.getByText("Colonia Americana", { selector: "dd" })).toBeTruthy();
    expect(screen.getByText("Affinity signal from aggregate taste data — not a ticket forecast or a claim about individuals.")).toBeTruthy();
  });
  it("shows no do-not-book act and counts only the claims it shows", async () => {
    const real = lumenPlaybooks.samplePlaybookEvents;
    vi.spyOn(lumenPlaybooks, "samplePlaybookEvents").mockImplementation((id, o) => { const ev = real(id, o); return ev && withArielPink(ev); });
    renderAt("/tours/playbook/4005539?sample=1");
    expect(await screen.findByText("7 verified · 2 removed")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Ariel Pink/);
  });
  it("drops an empty This week card and its slot from the counter; a non-empty week keeps it", async () => {
    const real = await vi.importActual<typeof client>("@/lib/qloo/client");
    const ok = await real.fetchThisWeek({ city: "Guadalajara", country: "MX" }, { sample: true, cityId: "4005539" });
    if (ok.status !== "ok") throw new Error("fixture week should be ok");
    const spy = vi.spyOn(client, "fetchThisWeek").mockResolvedValue({ ...ok, summarised: true, items: [], removed: [] });
    renderAt("/tours/playbook/4005539?sample=1");
    await screen.findByText("Cerro Alto Mezcal is the strongest sponsor fit at 0.91.");
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const total = async () => Number((await screen.findByText(/ · 1 of \d+$/)).textContent!.match(/of (\d+)$/)![1]);
    const without = await total();
    expect(screen.queryByRole("heading", { name: "This week" })).toBeNull();
    expect(screen.queryByText("Nothing notable found for these dates")).toBeNull();
    cleanup();
    spy.mockResolvedValue(ok);
    renderAt("/tours/playbook/4005539?sample=1");
    await screen.findByText("Cerro Alto Mezcal is the strongest sponsor fit at 0.91.");
    expect(await total()).toBe(without + 1);
    expect(screen.getByText("This week")).toBeTruthy();
  });
  it("shows the verdict clocks and the sponsor assumption line", async () => {
    renderAt("/tours/playbook/4005539?sample=1");
    await screen.findByRole("heading", { name: "Guadalajara" });
    expect(screen.getByTestId("verdict-clocks").textContent).toMatch(/^on-sale (in \d+ days|today|tomorrow|\d+ days? ago) · posters by .+ · confirm sponsor by /);
    expect(screen.getByTestId("sponsor-assumption").textContent).toBe("Assumption: a local sponsor can offset part of the guarantee. We don't estimate amounts.");
    expect(screen.getByRole("button", { name: /Playbook · \d+ Qloo calls?/ })).toBeTruthy();
  });
  it("shows the nearest other stop on the verdict when the board has other cities with coordinates", async () => {
    renderAt("/tours/playbook/4005539?sample=1");
    await screen.findByRole("heading", { name: "Guadalajara" });
    expect(screen.getByTestId("radius-note").textContent).toMatch(/^Nearest other stop: Mexico City, \d+ km — check radius clauses\.$/);
  });
  it("falls back to the nearest board city when the shortlist holds only this city", async () => {
    function Only() {
      const { state, setShortlist } = useTourBoard();
      useEffect(() => { if (state.status === "done") setShortlist(["4005539"]); }, [state.status, setShortlist]);
      return null;
    }
    renderAt("/tours/playbook/4005539?sample=1", <Only />);
    await screen.findByRole("heading", { name: "Guadalajara" });
    await screen.findByText("Cerro Alto Mezcal is the strongest sponsor fit at 0.91.");
    expect(screen.getByTestId("radius-note").textContent).toMatch(/^Nearest other stop: Mexico City, \d+ km/);
  });
  it("a bare playbook url with no run loads the example, as the stepper does", async () => {
    setShowcase(parseShowcase(syntheticShowcase));
    const id = Object.keys(parseShowcase(syntheticShowcase).playbooks)[0]!;
    const name = parseShowcase(syntheticShowcase).boardEvents.flatMap((e) => (e.type === "city_scored" ? [e.city] : [])).find((c) => c.id === id)!.name;
    renderAt(`/tours/playbook/${id}`);
    expect(await screen.findByRole("heading", { name })).toBeTruthy();
    expect(screen.queryByText("Open this city from a Tour Board")).toBeNull();
  });
  it("shows an honest state on a deep link without a run", async () => {
    renderAt("/tours/playbook/4005539");
    expect(await screen.findByText("Open this city from a Tour Board")).toBeTruthy();
    expect(screen.getByText("Playbooks are built from a scored run.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to Tour Board" }).getAttribute("href")).toBe("/tours/board");
  });
  it("says when a sample city has no sample playbook and links the ones that do", async () => {
    renderAt("/tours/playbook/4887398?sample=1");
    expect(await screen.findByText("No sample playbook for Chicago")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Guadalajara" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Chicago" })).toBeTruthy();
  });
  it("re-runs when ?sample=long is switched to ?sample=1 on the same page", async () => {
    renderAt("/tours/playbook/3464975?sample=long", <Switch to="/tours/playbook/3464975?sample=1" />);
    expect(await screen.findByRole("heading", { name: "San Juan de los Lagos" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "switch" }));
    expect(await screen.findByRole("heading", { name: "Curitiba" })).toBeTruthy();
    // the board was re-run with the default set, so the playbook itself loads
    expect(await screen.findByText("Pinhão Roasters leads sponsor fit at 0.86.")).toBeTruthy();
  });
  it("keeps the current sample set in the NO_SAMPLE links", async () => {
    renderAt("/tours/playbook/4887398?sample=long");
    const link = await screen.findByRole("link", { name: "Guadalajara" });
    expect(link.getAttribute("href")).toBe("/tours/playbook/4005539?sample=long");
  });
  it("Add to tour toggles the city in the shortlist", async () => {
    renderAt("/tours/playbook/3995465?sample=1");
    const add = await screen.findByRole("button", { name: "Add to tour" });
    fireEvent.click(add);
    expect(screen.getByRole("button", { name: "Remove from tour" })).toBeTruthy();
    expect(document.querySelector("[data-toast-viewport]")?.textContent ?? "").toMatch(/^Added .+ to the tour\.$/);
    fireEvent.click(screen.getByRole("button", { name: "Remove from tour" }));
    expect(document.querySelector("[data-toast-viewport]")?.textContent ?? "").toMatch(/Removed .+ from the tour\./);
  });
  it("at the max-stops cap Add to tour is disabled with the reason (R8)", async () => {
    renderAt("/tours/playbook/3995465?sample=1", <FillShortlist except="3995465" />);
    expect(await screen.findByText("Max stops reached — raise it in the brief")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Add to tour" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("has the three promoter tabs, How to win, Acts fans love and Advance & risks, and Acts fans love shows the talent card", async () => {
    renderAt("/tours/playbook/4005539?sample=1");
    const first = await screen.findByRole("tab", { name: "How to win" });
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["How to win", "Acts fans love", "Advance & risks"]);
    expect(screen.queryByRole("tab", { name: /Culture|Delight|Activate|Talent/ })).toBeNull();
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Acts fans love" }).getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByText(/Shared taste with Guadalajara's mainstream/, undefined, { timeout: 3000 })).toBeTruthy();
  });
  it("never mentions the campaign flow", async () => {
    renderAt("/tours/playbook/4005539?sample=1");
    await screen.findByRole("tab", { name: "How to win" });
    expect(document.body.textContent).not.toMatch(/save this tour as a campaign/i);
  });
  it("shows the city name once in the header: the poster is decorative and sits after the score block on phones", async () => {
    renderAt("/tours/playbook/4005539?sample=1");
    const h1 = await screen.findByRole("heading", { name: "Guadalajara", level: 1 });
    expect(screen.queryByRole("img", { name: /poster/ })).toBeNull();
    const header = h1.closest("header")!;
    expect([...header.querySelectorAll("svg text")].filter((t) => /Guadalajara/.test(t.textContent ?? ""))).toHaveLength(0);
    const strip = header.querySelector("[data-testid='poster-strip']")!;
    expect(strip).toBeTruthy();
    expect(!!(h1.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(strip.getAttribute("aria-hidden")).toBe("true");
  });
  it("keeps the showcase flag on the back link", async () => {
    setShowcase(parseShowcase(syntheticShowcase));
    renderAt("/tours/playbook/3520339?showcase=1");
    const back = await screen.findByRole("link", { name: "Back to Tour Board" });
    expect(back.getAttribute("href")).toBe("/tours/board?showcase=1");
  });
  it("cards scroll sideways with a visible Swipe for more hint, and the scroller is keyboard reachable", async () => {
    renderAt("/tours/playbook/4005539?sample=1");
    await screen.findByText("Cerro Alto Mezcal is the strongest sponsor fit at 0.91.");
    expect(screen.getByText("Swipe for more")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Playbook cards" }).getAttribute("tabindex")).toBe("0");
  });
  it("when held, Remove from tour is secondary and the primary action moves on to the Tour Book", async () => {
    renderAt("/tours/playbook/3995465?sample=1");
    const add = await screen.findByRole("button", { name: "Add to tour" });
    expect(add.className).toMatch(/btn-gold/);
    expect(screen.queryByRole("link", { name: /^Next:/ })).toBeNull();
    fireEvent.click(add);
    const remove = screen.getByRole("button", { name: "Remove from tour" });
    expect(remove.className).not.toMatch(/btn-gold/);
    const next = screen.getByRole("link", { name: /^Next:/ });
    expect(next.className).toMatch(/btn-gold/);
  });
});

describe("CityPlaybook in showcase mode", () => {
  const recordedIds = () => Object.keys(parseShowcase(syntheticShowcase).playbooks);
  it("a city with no recorded playbook shows the explanation and a way back, no empty tiles", async () => {
    setShowcase(parseShowcase(syntheticShowcase));
    const missing = parseShowcase(syntheticShowcase).boardEvents.flatMap((e) => (e.type === "city_scored" ? [e.city] : [])).find((c) => !recordedIds().includes(c.id))!;
    renderAt(`/tours/playbook/${missing.id}?showcase=1`);
    expect(await screen.findByText(`Playbooks are recorded for ${recordedIds().length} cities in this example. Try your own artist to open any city.`)).toBeTruthy();
    expect(screen.getByRole("heading", { name: missing.name })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to the Tour Board" }).getAttribute("href")).toBe("/tours/board?showcase=1");
    expect(screen.queryByText("—")).toBeNull();
    expect(screen.queryByText("TOP ZONE")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });
});

describe("CityPlaybook Advance & risks tab", () => {
  const risks = { weather: { status: "unavailable" as const, message: "w" }, holidays: { status: "unavailable" as const, message: "h" }, visa: { status: "capped" as const, message: "Web lookups are paused for today." }, equipment: { status: "unavailable" as const, message: "e" }, generatedAt: "t" };
  const withWindow = (window?: { start: string; end: string }) => {
    const raw = syntheticShowcase as unknown as { brief: Record<string, unknown> };
    setShowcase(parseShowcase({ ...syntheticShowcase, brief: { ...raw.brief, ...(window ? { dateWindow: window } : {}) } } as never));
  };
  const firstId = () => Object.keys(parseShowcase(syntheticShowcase).playbooks)[0]!;
  it("fetches only when the tab is opened, with the city, window and coordinates, and no artist country for the showcase", async () => {
    withWindow({ start: "2027-03-12", end: "2027-03-15" });
    const spy = vi.spyOn(client, "fetchAdvance").mockResolvedValue(risks);
    renderAt(`/tours/playbook/${firstId()}?showcase=1`);
    const tab = await screen.findByRole("tab", { name: "Advance & risks" });
    await new Promise((r) => setTimeout(r, 50));
    expect(spy).not.toHaveBeenCalled();
    fireEvent.click(tab);
    expect(await screen.findByText("Web lookups are paused for today.")).toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(1);
    const q = spy.mock.calls[0]![0];
    expect(q).toMatchObject({ window: { start: "2027-03-12", end: "2027-03-15" }, lat: expect.any(Number), lon: expect.any(Number) });
    expect(q.artistCountry).toBeUndefined();
  });
  it("tells the reader when the lookups finish after they moved to another tab, and stays quiet when they are watching", async () => {
    withWindow({ start: "2027-03-12", end: "2027-03-15" });
    let done!: (v: typeof risks) => void;
    vi.spyOn(client, "fetchAdvance").mockImplementation(() => new Promise((r) => { done = r as typeof done; }));
    renderAt(`/tours/playbook/${firstId()}?showcase=1`);
    fireEvent.click(await screen.findByRole("tab", { name: "Advance & risks" }));
    fireEvent.click(screen.getByRole("tab", { name: "How to win" }));
    await act(async () => { done(risks); });
    await waitFor(() => expect(document.querySelector("[data-toast-viewport]")?.textContent).toMatch(/Advance & risks are ready for .+\./));
  });
  it("no toast when the Advance tab is open as the lookups finish", async () => {
    withWindow({ start: "2027-03-12", end: "2027-03-15" });
    vi.spyOn(client, "fetchAdvance").mockResolvedValue(risks);
    renderAt(`/tours/playbook/${firstId()}?showcase=1`);
    fireEvent.click(await screen.findByRole("tab", { name: "Advance & risks" }));
    expect(await screen.findByText("Web lookups are paused for today.")).toBeTruthy();
    expect(document.querySelector("[data-toast-viewport]")?.textContent).toBe("");
  });
  it("without a date window it explains and does not fetch", async () => {
    withWindow();
    const spy = vi.spyOn(client, "fetchAdvance").mockResolvedValue(risks);
    renderAt(`/tours/playbook/${firstId()}?showcase=1`);
    fireEvent.click(await screen.findByRole("tab", { name: "Advance & risks" }));
    expect(await screen.findByText("This example has no date window, so there are no dates to check.")).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });
  it("never fetches advance details on page load, on any tab", async () => {
    withWindow({ start: "2027-03-12", end: "2027-03-15" });
    const spy = vi.spyOn(client, "fetchAdvance").mockResolvedValue(risks);
    renderAt(`/tours/playbook/${firstId()}?showcase=1`);
    fireEvent.click(await screen.findByRole("tab", { name: "Acts fans love" }));
    await new Promise((r) => setTimeout(r, 50));
    expect(spy).not.toHaveBeenCalled();
  });
});

function RunShowcase() {
  const { run } = useTourBoard();
  useEffect(() => { run(showcaseBrief(), { sample: true, sampleSet: "showcase" }); }, [run]);
  return null;
}

describe("CityPlaybook reached without the showcase flag in the URL", () => {
  const cities = () => parseShowcase(syntheticShowcase).boardEvents.flatMap((e) => (e.type === "city_scored" ? [e.city] : []));
  const recorded = () => Object.keys(parseShowcase(syntheticShowcase).playbooks);
  it("keeps the showcase on the back link (falls back to the board run)", async () => {
    setShowcase(parseShowcase(syntheticShowcase));
    renderAt(`/tours/playbook/${recorded()[0]}`, <RunShowcase />);
    const back = await screen.findByRole("link", { name: "Back to Tour Board" });
    expect(back.getAttribute("href")).toBe("/tours/board?showcase=1");
  });
  it("shows the explanation, not empty tiles, for an unrecorded city (WebMCP open_city, in-app links)", async () => {
    setShowcase(parseShowcase(syntheticShowcase));
    const missing = cities().find((c) => !recorded().includes(c.id))!;
    renderAt(`/tours/playbook/${missing.id}`, <RunShowcase />);
    expect(await screen.findByText(/Playbooks are recorded for \d+ cities in this example\./)).toBeTruthy();
    expect(screen.queryByText("—")).toBeNull();
    expect(screen.queryByText("TOP ZONE")).toBeNull();
  });
});

describe("CityPlaybook naming and SUPPORT rule", () => {
  it("the Acts fans love tab card, fallback and chapter use the acts title, never Talent", async () => {
    renderAt("/tours/playbook/4005539?sample=1");
    fireEvent.click(await screen.findByRole("tab", { name: "Acts fans love" }));
    expect(await screen.findByRole("heading", { name: "Acts these fans love here" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Talent/);
  });
  it("hero tiles carry a why line from the loaded cards, linking to the card, even from another tab", async () => {
    renderAt("/tours/playbook/4005539?sample=1");
    await screen.findByText("SUPPORT");
    const zone = await screen.findByRole("link", { name: /of in-city fan heat \(#1 of \d+ zones\)/ });
    expect(zone.getAttribute("href")).toBe("#card-promo_zones");
    expect(screen.getByRole("link", { name: /^venue fit \d\.\d\d, #\d+ of \d+ rooms$/ }).getAttribute("href")).toBe("#card-venue_fit");
    expect(screen.getByRole("link", { name: /^shared taste 0\.\d\d · the city likes them 0\.\d\d$/ }).getAttribute("href")).toBe("#card-co_billing");
    expect(document.getElementById("card-promo_zones")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Acts fans love" }));
    fireEvent.click(zone);
    await waitFor(() => expect(screen.getByRole("tab", { name: "How to win" }).getAttribute("aria-selected")).toBe("true"));
  });
  it("SUPPORT shows a dash for a co-billing card that is not ok, even if it carries items (same rule as the landing)", async () => {
    vi.spyOn(client, "streamCityPlaybook").mockImplementation(async function* () {
      for (const e of samplePlaybookEvents("4005539")!) {
        if (e.type === "playbook") yield { ...e, playbook: { ...e.playbook, cards: e.playbook.cards.map((c) => (c.kind === "co_billing" ? { ...c, status: "empty" as const } : c)) } };
        else yield e;
      }
    });
    renderAt("/tours/playbook/4005539?sample=1");
    await screen.findByText("SUPPORT");
    const tile = (label: string) => screen.getByText(label).closest("div")!.querySelector("dd")!.textContent;
    await waitFor(() => expect(tile("BEST ROOM")).not.toBe("—")); // the cards did load
    expect(tile("SUPPORT")).toBe("—");
  });
});

describe("CityPlaybook (shared)", () => {
  it("shows a page-level notice and evidence-only cards when the narrative is unavailable", async () => {
    vi.spyOn(client, "streamCityPlaybook").mockImplementation(async function* () {
      for (const e of samplePlaybookEvents("4005539")!) {
        yield e.type === "narrative" ? { type: "narrative", narrative: { status: "unavailable", reason: "error", message: "Narrative unavailable — showing Qloo evidence only" } } : e;
      }
    });
    renderAt("/tours/playbook/4005539?sample=1");
    expect(await screen.findByText("Narrative unavailable — showing Qloo evidence only")).toBeTruthy();
    expect(screen.queryByText("Cerro Alto Mezcal is the strongest sponsor fit at 0.91.")).toBeNull();
    expect(screen.getAllByText("Cerro Alto Mezcal").length).toBeGreaterThan(0);
  });
  it("budget error keeps the cards that arrived and says so", async () => {
    vi.spyOn(client, "streamCityPlaybook").mockImplementation(async function* () {
      yield samplePlaybookEvents("4005539")!.find((e) => e.type === "playbook")!;
      yield { type: "error", code: "BUDGET", message: "Session limit reached" };
    });
    renderAt("/tours/playbook/4005539?sample=1");
    expect(await screen.findByText("Session limit reached — try the example tour")).toBeTruthy();
    expect(screen.getAllByText("Cerro Alto Mezcal").length).toBeGreaterThan(0);
  });
  it("an unplaced city shows the plain explanation, no retry, and links back to the board", async () => {
    vi.spyOn(client, "streamCityPlaybook").mockImplementation(async function* () {
      yield { type: "error", code: "LOCATION_UNRESOLVED", message: "Qloo couldn't place Guadalajara precisely (2 lookups), so no playbook was built from its data." };
    });
    renderAt("/tours/playbook/4005539?sample=1");
    expect(await screen.findByText("Qloo couldn't place this city precisely, so we didn't score it.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByText("This playbook could not be built.")).toBeNull();
  });
  it("other errors show one sentence and Try again reloads the playbook", async () => {
    const spy = vi.spyOn(client, "streamCityPlaybook").mockImplementation(async function* () {
      yield { type: "error", code: "UPSTREAM", message: "boom" };
    });
    renderAt("/tours/playbook/4005539?sample=1");
    const retry = await screen.findByRole("button", { name: "Try again" });
    const calls = spy.mock.calls.length;
    fireEvent.click(retry);
    await waitFor(() => expect(spy.mock.calls.length).toBe(calls + 1));
  });
  it.each(["BUDGET", "HTTP_502"])("error %s links to the example tour", async (code) => {
    vi.spyOn(client, "streamCityPlaybook").mockImplementation(async function* () {
      yield { type: "error", code, message: "boom" };
    });
    renderAt("/tours/playbook/4005539?sample=1");
    const link = await screen.findByRole("link", { name: "See the example tour" });
    expect(link.getAttribute("href")).toBe("/tours/board?showcase=1");
    expect(!!screen.queryByRole("button", { name: "Try again" })).toBe(code !== "BUDGET");
  });
  it("lays out the desktop grid with one Add to tour in the identity block", async () => {
    desktop = true;
    renderAt("/tours/playbook/4005539?sample=1");
    expect(await screen.findByRole("heading", { name: "Guadalajara" })).toBeTruthy();
    expect(await screen.findByText("Cerro Alto Mezcal is the strongest sponsor fit at 0.91.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Add to tour|Remove from tour/ })).toHaveLength(1);
  });
});

describe("CityPlaybook proof entry point", () => {
  it("links to the proof page with the explanatory line", async () => {
    renderAt("/tours/playbook/4005539?sample=1");
    const link = await screen.findByRole("link", { name: /How we tested it/ });
    expect(link.getAttribute("href")).toBe("/proof");
    expect(screen.getByText("How often this playbook surfaced the sponsor, merch partner or local act real tours used.")).toBeTruthy();
  });
});

describe("CityPlaybook: main and routing examples stay separate", () => {
  it("opening the same city in the main example and then the routing example loads each recording's own playbook", async () => {
    const base = parseShowcase(syntheticShowcase);
    const id = Object.keys(base.routing!.playbooks).find((c) => base.playbooks[c])!;
    const mark = (m: string) => [{ type: "error" as const, code: "MARK", message: m }];
    setShowcase(parseShowcase({ ...(syntheticShowcase as object), playbooks: { ...base.playbooks, [id]: mark("main") }, routing: { ...base.routing!, playbooks: { ...base.routing!.playbooks, [id]: mark("routing") } } }));
    const spy = vi.spyOn(client, "streamCityPlaybook");
    renderAt(`/tours/playbook/${id}?showcase=1`, <Switch to={`/tours/playbook/${id}?showcase=routing`} />);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "switch" }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy.mock.calls[0]![1]).toMatchObject({ sampleSet: "showcase" });
    expect(spy.mock.calls[0]![1]!.variant).toBeUndefined();
    expect(spy.mock.calls[1]![1]).toMatchObject({ variant: "routing" });
    const entity = (base.boardEvents.find((e) => e.type === "resolve") as { entity: { entityId: string } }).entity.entityId;
    await waitFor(() => expect(getPlaybook(playbookKey(entity, id, "showcase", "routing"))?.error?.message).toBe("routing"));
    expect(getPlaybook(playbookKey(entity, id, "showcase"))?.error?.message).toBe("main");
  });
});

describe("live-run loading line", () => {
  function StartLive() {
    const { run } = useTourBoard();
    useEffect(() => { run({ artist: "Ada", regions: ["US"], maxStops: 8 }); }, [run]);
    return null;
  }
  it("shows on a live playbook while it builds, not on the recorded example", async () => {
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () { yield { type: "city_scored", city: SAMPLE_CITIES[0]! }; yield { type: "done", summary: {} }; });
    vi.spyOn(client, "streamCityPlaybook").mockImplementation(async function* () { await new Promise(() => {}); });
    renderAt(`/tours/playbook/${SAMPLE_CITIES[0]!.id}`, <StartLive />);
    expect((await screen.findByTestId("live-run-line")).textContent).toBe("Live Qloo run: about a minute for 3 cities.");
    cleanup();
    renderAt(`/tours/playbook/${SAMPLE_CITIES[0]!.id}?sample=1`);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByTestId("live-run-line")).toBeNull();
  });
});

describe("CityPlaybook age groups", () => {
  it("the invented sample playbook has no age control and fetches nothing", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    renderAt("/tours/playbook/4005539?sample=1");
    await screen.findByText("Cerro Alto Mezcal is the strongest sponsor fit at 0.91.");
    expect(screen.queryByTestId("segment-control")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it("the recorded example shows the control, fetches only on click, with the entity id read from the run", async () => {
    setShowcase(parseShowcase(syntheticShowcase));
    const base = parseShowcase(syntheticShowcase);
    const entity = (base.boardEvents.find((e) => e.type === "resolve") as { entity: { entityId: string } }).entity.entityId;
    const id = Object.keys(base.playbooks)[0]!;
    const f = vi.fn(async (u: string | URL | Request) => String(u).includes("sponsor-segments")
      ? new Response(JSON.stringify({ status: "no_skew", indexes: {}, bands: [] }), { status: 200 })
      : new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", f);
    renderAt(`/tours/playbook/${id}?showcase=1`);
    const btn = await screen.findByRole("button", { name: "By age group" });
    expect(f.mock.calls.filter((c) => String(c[0]).includes("sponsor-segments"))).toHaveLength(0);
    fireEvent.click(btn);
    await screen.findByTestId("segment-no-skew");
    const calls = f.mock.calls.filter((c) => String(c[0]).includes("sponsor-segments"));
    expect(calls).toHaveLength(1);
    expect(String(calls[0]![0])).toContain(`artistId=${entity}`);
  });
});
