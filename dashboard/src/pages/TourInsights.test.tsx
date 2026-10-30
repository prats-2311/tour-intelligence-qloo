// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceContext, OFF } from "@/lib/collab/workspaceContext";
import { resetPlaybooks } from "@/lib/qloo/playbookStore";
import { resetSegments } from "@/lib/qloo/segmentStore";
import { PLACEHOLDER_SHOWCASE } from "@/lib/qloo/placeholderShowcase";
import { parseShowcase, setShowcase } from "@/lib/qloo/showcase";
import { TourBoardProvider } from "@/lib/qloo/TourBoardProvider";
import syntheticShowcase from "@/test/fixtures/showcase.synthetic.json";
import TourInsights from "./TourInsights";

const mapProps = vi.hoisted(() => ({ last: null as null | { cities: Array<{ id: string }>; statusOf?: (id: string) => string | null } }));
vi.mock("@/components/qloo/TourMap", () => ({ default: (p: { cities: Array<{ id: string }>; statusOf?: (id: string) => string | null }) => { mapProps.last = p; return <div data-testid="map" data-count={p.cities.length} />; } }));

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
/** The synthetic recording with sponsor ranks, the do-not-book act and a non-sponsor organisation planted in every sponsors card. */
function planted() {
  const raw = JSON.parse(JSON.stringify(syntheticShowcase));
  for (const events of Object.values(raw.playbooks) as Array<Array<{ type: string; playbook?: { cards: Array<{ kind: string; items: Array<Record<string, unknown>> }> } }>>) {
    for (const e of events) if (e.type === "playbook") for (const c of e.playbook!.cards) if (c.kind === "sponsors") {
      c.items = [{ name: "Ariel Pink", artistRank: 1, cityRank: null }, { name: "Planned Parenthood", artistRank: 2, cityRank: null }, ...c.items.map((it, i) => ({ ...it, artistRank: i + 3, cityRank: i % 2 ? null : i + 10 }))];
    }
  }
  return raw;
}
const SCORED = (syntheticShowcase.boardEvents as Array<{ type: string }>).filter((e) => e.type === "city_scored").length;

const Where = () => <span data-testid="search">{useLocation().search}</span>;
const PlaybookStub = () => <p>playbook {useParams().cityId}</p>;
const workspace = (snapshot: unknown) => ({ ...OFF, enabled: true, ws: "w", snapshot } as never);
const renderAt = (url: string, ws: unknown = OFF) => render(
  <QueryClientProvider client={new QueryClient()}>
    <TourBoardProvider>
      <WorkspaceContext.Provider value={ws as never}>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tours/insights" element={<><TourInsights /><Where /></>} />
            <Route path="/tours/playbook/:cityId" element={<PlaybookStub />} />
          </Routes>
        </MemoryRouter>
      </WorkspaceContext.Provider>
    </TourBoardProvider>
  </QueryClientProvider>,
);
const search = () => screen.getByTestId("search").textContent ?? "";

beforeEach(() => {
  setShowcase(parseShowcase(planted()));
  mapProps.last = null;
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => { cleanup(); resetPlaybooks(); resetSegments(); setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE)); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Insights page", () => {
  it("opens the recorded example with the map, the filters and every chart", async () => {
    renderAt("/tours/insights?showcase=1");
    await flush();
    expect(screen.getByRole("heading", { level: 1, name: "City charts" })).toBeTruthy();
    expect(screen.getByTestId("map").getAttribute("data-count")).toBe(String(SCORED));
    for (const h of ["City scores", "Fan heat vs activation", "Verdict mix"]) expect(screen.getByRole("heading", { name: h })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /^Sponsor lift · / })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /^Promo zone share · / })).toBeTruthy();
    expect(screen.getAllByTestId("city-score-row")).toHaveLength(SCORED);
    expect(screen.queryByRole("heading", { name: "Team status" })).toBeNull();
  });
  it("draws the guide lines from the run's own verdict thresholds (the recording's, not constants)", async () => {
    renderAt("/tours/insights?showcase=1");
    await flush();
    expect(screen.getAllByTestId("guide-v").map((g) => g.getAttribute("data-at")).sort()).toEqual(["45", "70"]);
    expect(screen.getAllByTestId("guide-h").map((g) => g.getAttribute("data-at")).sort()).toEqual(["13", "28", "38"]);
  });
  it("sponsor lift defaults to the top city, shows fan rank and city rank, and hides the do-not-book act and non-sponsors everywhere", async () => {
    renderAt("/tours/insights?showcase=1");
    await flush();
    const picker = screen.getByRole("combobox", { name: "City for sponsor lift and promo zones" }) as HTMLSelectElement;
    expect(picker.selectedOptions[0]!.textContent).toBe("El Paso");
    expect(screen.getAllByTestId("lift-row").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("lift-city-marker").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/Ariel Pink|Planned Parenthood/);
    fireEvent.change(picker, { target: { value: "4013708" } });
    expect(screen.getByRole("heading", { name: "Sponsor lift · Ciudad Juarez" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Ariel Pink|Planned Parenthood/);
  });
  it("a city with no recorded playbook says so on the sponsor chart", async () => {
    renderAt("/tours/insights?showcase=1&city=3451190");
    await flush();
    expect(screen.getByText(/No recorded playbook for Rio de Janeiro/)).toBeTruthy();
  });
  it("shows no demographic index as a percentage (the only % on the page are promo zone shares)", async () => {
    renderAt("/tours/insights?showcase=1");
    await flush();
    const zones = screen.getByRole("heading", { name: /^Promo zone share/ }).closest("section")!;
    const rest = (document.body.textContent ?? "").replace(zones.textContent ?? "", "");
    expect(rest).not.toMatch(/%/);
    expect(document.body.textContent).not.toMatch(/index.{0,12}\d+\s*%/i);
  });
  it("a city row opens that city's playbook, keeping the showcase query", async () => {
    renderAt("/tours/insights?showcase=1");
    await flush();
    fireEvent.click(within(screen.getAllByTestId("city-score-row")[0]!).getByRole("link"));
    expect(screen.getByText("playbook 5520993")).toBeTruthy();
  });
});

describe("Insights filters in the URL", () => {
  it("start from the query: country, verdict and slider narrow every chart and the map", async () => {
    renderAt("/tours/insights?showcase=1&country=US&verdict=play");
    await flush();
    expect(screen.getAllByTestId("city-score-row")).toHaveLength(2);
    expect(screen.getAllByTestId("quad-point")).toHaveLength(2);
    expect(screen.getByTestId("map").getAttribute("data-count")).toBe("2");
    expect(screen.getByRole("button", { name: "Play" }).getAttribute("aria-pressed")).toBe("true");
  });
  it("changing a filter rewrites the query and keeps showcase and ws", async () => {
    renderAt("/tours/insights?showcase=1&ws=abc");
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Mexico" }));
    expect(search()).toContain("country=MX");
    expect(search()).toContain("showcase=1");
    expect(search()).toContain("ws=abc");
    fireEvent.change(screen.getByRole("slider", { name: /Minimum winnability/ }), { target: { value: "60" } });
    expect(search()).toContain("minWin=60");
    fireEvent.change(screen.getByRole("combobox", { name: "Sort by" }), { target: { value: "name" } });
    expect(search()).toContain("sort=name");
    const names = screen.getAllByTestId("city-score-row").map((r) => r.textContent ?? "");
    expect(names.length).toBeGreaterThan(0);
  });
  it("Reset filters clears the filter params and restores every city", async () => {
    renderAt("/tours/insights?showcase=1&country=MX&minWin=50");
    await flush();
    expect(screen.getAllByTestId("city-score-row").length).toBeLessThan(SCORED);
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(search()).toBe("?showcase=1");
    expect(screen.getAllByTestId("city-score-row")).toHaveLength(SCORED);
  });
  it("filters that exclude everything show 'No cities match these filters.' with a Reset", async () => {
    renderAt("/tours/insights?showcase=1&country=MX&verdict=skip");
    await flush();
    expect(screen.getByText("No cities match these filters.")).toBeTruthy();
    expect(screen.queryByTestId("city-score-row")).toBeNull();
    expect(screen.queryByTestId("map")).toBeNull();
    const reset = screen.getAllByRole("button", { name: "Reset filters" });
    fireEvent.click(reset[reset.length - 1]!);
    expect(screen.getAllByTestId("city-score-row")).toHaveLength(SCORED);
    expect(search()).toBe("?showcase=1");
  });
});

describe("Insights with a team workspace", () => {
  const snapshot = {
    ws: "w", rev: 1, createdAt: 0, overrides: {}, leads: {}, activity: [],
    statuses: { "5520993": { status: "confirmed", name: "A", role: "Manager", at: 1 }, "5391811": { status: "on_hold", name: "A", role: "Manager", at: 1 } },
    threads: { "city:5520993": { resolved: false, messages: [{ id: "1", text: "t", name: "A", role: "Manager", at: 1 }] } },
  };
  it("adds the status filter, the team overview and the status on the map markers", async () => {
    renderAt("/tours/insights?showcase=1", workspace(snapshot));
    await flush();
    expect(screen.getByRole("heading", { name: "Team status" })).toBeTruthy();
    expect(screen.getByTestId("status-count-confirmed").textContent).toBe("1");
    expect(within(screen.getByRole("heading", { name: "Team status" }).closest("section")!).getByRole("link", { name: /El Paso/ })).toBeTruthy();
    expect(mapProps.last!.statusOf!("5520993")).toBe("Confirmed");
    expect(mapProps.last!.statusOf!("3451190")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "On hold" }));
    expect(search()).toContain("team=on_hold");
    expect(screen.getAllByTestId("city-score-row")).toHaveLength(1);
  });
});

describe("accessibility", () => {
  it("every chart has a text title and a labelled image or table, and the page has one h1", async () => {
    renderAt("/tours/insights?showcase=1");
    await flush();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    for (const sec of document.querySelectorAll("section[aria-labelledby]:not([data-testid=age-matrix])")) {
      expect(sec.querySelector("h2")!.textContent).toBeTruthy();
      expect(sec.querySelector("table")).toBeTruthy();
    }
    for (const img of screen.getAllByRole("img")) expect((img.getAttribute("aria-label") ?? "").length).toBeGreaterThan(5);
  });
});

const segBody = (names: string[]) => ({ status: "ok", indexes: {}, bands: [{ band: "25_to_29", phrase: "", index: 0.9, status: "ok", hiddenCount: 0, newInTop5: 1, lifted: false, items: names.map((name, i) => ({ name, entityId: `e${i}`, artistRank: i + 1, cityRank: null })) }] });

describe("Age matrix on the Charts page", () => {
  const stubSegments = (names: string[]) => { const f = vi.fn(async (_u: unknown) => new Response(JSON.stringify(segBody(names)), { status: 200, headers: { "content-type": "application/json" } })); vi.stubGlobal("fetch", f); return f; };
  it("is the first section, with its title, and fetches nothing until the button is pressed", async () => {
    const f = stubSegments(["Brand A"]);
    renderAt("/tours/insights?showcase=1");
    await flush();
    const sections = [...document.querySelectorAll("section[aria-labelledby]")];
    expect(sections[0]!.getAttribute("data-testid")).toBe("age-matrix");
    expect(screen.getByRole("heading", { name: "Which brands each age group loves, city by city" })).toBeTruthy();
    expect(screen.getByRole("button", { name: `Load age groups for all ${Math.min(10, SCORED)} cities` })).toBeTruthy();
    expect(f.mock.calls.filter((c) => String(c[0]).includes("sponsor-segments"))).toHaveLength(0);
  });
  it("counts only the cities the filters leave", async () => {
    renderAt("/tours/insights?showcase=1&country=US");
    await flush();
    expect(screen.getByRole("button", { name: "Load age groups for all 2 cities" })).toBeTruthy();
  });
  it("after the click: unique badge from the city's own all-fans list, playbook link with the band, planted names never shown", async () => {
    const f = stubSegments(["Ariel Pink", "Planned Parenthood", "Zzz Unlisted Brand"]);
    renderAt("/tours/insights?showcase=1&country=US");
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Load age groups for all 2 cities" }));
    const cell = (await screen.findAllByRole("button", { name: /Zzz Unlisted Brand/ }))[0]!;
    expect(f.mock.calls.filter((c) => String(c[0]).includes("sponsor-segments"))).toHaveLength(2);
    expect(cell.textContent).toContain("unique");
    fireEvent.click(cell);
    const link = within(screen.getByRole("dialog")).getByRole("link", { name: /playbook/ });
    expect(link.getAttribute("href")).toMatch(/^\/tours\/playbook\/\d+\?.*showcase=1.*band=25_to_29/);
    expect(screen.getByTestId("age-matrix").textContent).not.toMatch(/Ariel Pink|Planned Parenthood/);
  });
});
