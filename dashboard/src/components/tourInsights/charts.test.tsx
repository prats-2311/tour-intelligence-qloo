// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { DEFAULT_SCORING_DISPLAY, VERDICT_SHAPE } from "@/lib/qloo/labels";
import { defaultTourFilters } from "@/lib/qloo/tourInsights";
import type { PlaybookCard } from "@/lib/qloo/types";
import { CityScoresChart } from "./CityScoresChart";
import { FiltersBar } from "./FiltersBar";
import { QuadrantChart } from "./QuadrantChart";
import { SponsorLiftChart } from "./SponsorLiftChart";
import { TeamOverview } from "./TeamOverview";
import { VerdictMix } from "./VerdictMix";
import { ZoneShareChart } from "./ZoneShareChart";

beforeEach(() => { vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const href = (id: string) => `/tours/playbook/${id}?showcase=1`;
const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);
const cities = SAMPLE_CITIES.filter((c) => c.verdict !== "insufficient_data");

describe("CityScoresChart", () => {
  it("has a title, an axis label and one row per city with fan heat, activation and winnability bars", () => {
    wrap(<CityScoresChart cities={cities} hrefFor={href} />);
    expect(screen.getByRole("heading", { name: "City scores" })).toBeTruthy();
    expect(screen.getByText(/Score, 0 to 100/)).toBeTruthy();
    const rows = screen.getAllByTestId("city-score-row");
    expect(rows).toHaveLength(cities.length);
    const first = within(rows[0]!);
    expect(first.getByRole("img", { name: "Mexico City: fan heat 91, activation 77, winnability 84" })).toBeTruthy();
    expect(first.getAllByTestId(/^bar-/)).toHaveLength(3);
    expect(first.getByTestId("bar-fan")).toHaveProperty("style.width", "91%");
    expect(first.getByTestId("bar-act")).toHaveProperty("style.width", "77%");
    expect(first.getByTestId("bar-win")).toHaveProperty("style.width", "84%");
  });
  it("shows the verdict glyph beside each name, with the shape from VERDICT_SHAPE", () => {
    wrap(<CityScoresChart cities={cities} hrefFor={href} />);
    const rows = screen.getAllByTestId("city-score-row");
    cities.forEach((c, i) => expect(rows[i]!.querySelector("[data-shape]")!.getAttribute("data-shape")).toBe(VERDICT_SHAPE[c.verdict]));
  });
  it("a row links to that city's playbook; a city with no playbook is a plain row", () => {
    wrap(<CityScoresChart cities={cities} hrefFor={(id) => (id === "3530597" ? href(id) : null)} />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/tours/playbook/3530597?showcase=1");
  });
  it("a missing score reads 'not enough data' in the label and draws no bar", () => {
    const c = { ...cities[0]!, fanHeat: { value: null, reason: "insufficient_data" as const, refs: [] } };
    wrap(<CityScoresChart cities={[c]} hrefFor={href} />);
    expect(screen.getByRole("img", { name: /fan heat not enough data/ })).toBeTruthy();
    expect(screen.queryByTestId("bar-fan")).toBeNull();
  });
  it("offers the data as a table, with no percentages", async () => {
    wrap(<CityScoresChart cities={cities} hrefFor={href} />);
    const table = screen.getByRole("table", { hidden: true });
    expect(within(table).getAllByRole("row", { hidden: true })).toHaveLength(cities.length + 1);
    await userEvent.click(screen.getByRole("button", { name: "Show as table" }));
    expect(screen.getByRole("button", { name: "Show as chart" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryAllByTestId("city-score-row")).toHaveLength(0);
    expect(screen.getByRole("table").textContent).not.toMatch(/%/);
  });
});

describe("QuadrantChart", () => {
  const t = DEFAULT_SCORING_DISPLAY.thresholds;
  it("plots a point per city at fan heat (x) and activation (y), with axis labels and a summary", () => {
    wrap(<QuadrantChart cities={cities} thresholds={t} hrefFor={href} />);
    expect(screen.getByRole("heading", { name: "Fan heat vs activation" })).toBeTruthy();
    expect(screen.getByText("Fan heat (0 to 100)")).toBeTruthy();
    expect(screen.getByText("Activation (0 to 100)")).toBeTruthy();
    const img = screen.getByRole("img", { name: new RegExp(`${cities.length} cities`) });
    expect(img).toBeTruthy();
    const pts = screen.getAllByTestId("quad-point");
    expect(pts).toHaveLength(cities.length);
    const mx = pts.find((p) => p.getAttribute("data-city") === "Mexico City")!;
    expect(mx.getAttribute("data-x")).toBe("91");
    expect(mx.getAttribute("data-y")).toBe("77");
    expect(mx.getAttribute("data-shape")).toBe("circle");
  });
  it("draws guide lines at the verdict thresholds it is given, not constants", () => {
    wrap(<QuadrantChart cities={cities} thresholds={{ ...t, playFan: 66, playAct: 58, deRiskAct: 33, goldmineFanMin: 41, goldmineAct: 79 }} hrefFor={href} />);
    const vs = screen.getAllByTestId("guide-v").map((g) => g.getAttribute("data-at")).sort();
    const hs = screen.getAllByTestId("guide-h").map((g) => g.getAttribute("data-at")).sort();
    expect(vs).toEqual(["41", "66"]);
    expect(hs).toEqual(["33", "58", "79"]);
  });
  it("the default guides are the app's verdict thresholds (45/70 fan, 45/60/75 activation)", () => {
    wrap(<QuadrantChart cities={cities} thresholds={t} hrefFor={href} />);
    expect(screen.getAllByTestId("guide-v").map((g) => g.getAttribute("data-at")).sort()).toEqual(["45", "70"]);
    expect(screen.getAllByTestId("guide-h").map((g) => g.getAttribute("data-at")).sort()).toEqual(["45", "60", "75"]);
  });
  it("labels the top cities only and shows a tooltip on hover and keyboard focus", async () => {
    wrap(<QuadrantChart cities={cities} thresholds={t} hrefFor={href} />);
    expect(screen.getAllByTestId("quad-label").length).toBeLessThanOrEqual(5);
    expect(screen.getAllByTestId("quad-label")[0]!.textContent).toBe("Mexico City");
    const btn = screen.getByRole("link", { name: /^Guadalajara, Under the radar/ });
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(btn);
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain("Guadalajara");
    expect(tip.textContent).toContain("Fan heat 62");
    expect(tip.textContent).toContain("Activation 82");
    fireEvent.blur(btn);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.mouseEnter(btn);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.keyDown(btn, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("a city without both scores is left off the chart and counted", () => {
    const c = { ...cities[0]!, id: "n", name: "Nullville", activation: { value: null, reason: "insufficient_data" as const, refs: [] } };
    wrap(<QuadrantChart cities={[...cities, c]} thresholds={t} hrefFor={href} />);
    expect(screen.getAllByTestId("quad-point")).toHaveLength(cities.length);
    expect(screen.getByText("1 city not plotted (a score is missing).")).toBeTruthy();
  });
});

const sponsorCard = (items: Array<Record<string, unknown>>): PlaybookCard => ({ kind: "sponsors", status: "ok", items, refs: [], warnings: [] });

describe("SponsorLiftChart", () => {
  const city = cities[2]!;
  const items = [
    { name: "Cerro Alto Mezcal", artistRank: 1, cityRank: 9 },
    { name: "Brisa Vinyl Bar", artistRank: 2, cityRank: null },
    { name: "Ariel Pink", artistRank: 3, cityRank: null },
    { name: "Planned Parenthood", artistRank: 4, cityRank: null },
  ];
  it("shows a bar per sponsor with fan rank, and a city-rank marker or 'not in the city's top 20'", () => {
    wrap(<SponsorLiftChart city={city} card={sponsorCard(items)} status="ready" />);
    expect(screen.getByRole("heading", { name: `Sponsor lift · ${city.name}` })).toBeTruthy();
    const rows = screen.getAllByTestId("lift-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Fans #1")).toBeTruthy();
    expect(within(rows[0]!).getByTestId("lift-city-marker").getAttribute("data-rank")).toBe("9");
    expect(within(rows[1]!).getByText("Not in the city's top 20")).toBeTruthy();
    expect(within(rows[1]!).queryByTestId("lift-city-marker")).toBeNull();
    expect(screen.getByText(/Lift is rank-based/)).toBeTruthy();
    expect(screen.getByRole("img", { name: /Sponsors fans rank highest/ })).toBeTruthy();
  });
  it("never shows the do-not-book act or a non-sponsor organisation", () => {
    wrap(<SponsorLiftChart city={city} card={sponsorCard(items)} status="ready" />);
    expect(document.body.textContent).not.toMatch(/Ariel Pink|Planned Parenthood/);
  });
  it("is honest when there is no playbook for the city, or it is still loading, or it has no ranks", () => {
    const { rerender } = wrap(<SponsorLiftChart city={city} card={null} status="none" />);
    expect(screen.getByText(/No recorded playbook for/)).toBeTruthy();
    rerender(<MemoryRouter><SponsorLiftChart city={city} card={null} status="loading" /></MemoryRouter>);
    expect(screen.getByRole("status").textContent).toMatch(/Loading/);
    rerender(<MemoryRouter><SponsorLiftChart city={city} card={sponsorCard([{ name: "X", affinity: 0.4 }])} status="ready" /></MemoryRouter>);
    expect(screen.getByText(/No sponsor ranks/)).toBeTruthy();
  });
});

describe("SponsorLiftChart live runs", () => {
  it("never starts a lookup: an unloaded live playbook asks the user to open it first", () => {
    wrap(<SponsorLiftChart city={cities[0]!} card={null} status="unloaded" />);
    expect(screen.getByText(/Open the Mexico City playbook first/)).toBeTruthy();
  });
});

describe("ZoneShareChart", () => {
  it("draws a bar per zone labelled 'share of in-city fan heat', as a share of the whole, never a demographic percentage", () => {
    wrap(<ZoneShareChart city={cities[0]!} />);
    expect(screen.getByRole("heading", { name: "Promo zone share · Mexico City" })).toBeTruthy();
    expect(screen.getByText(/share of in-city fan heat/)).toBeTruthy();
    const rows = screen.getAllByTestId("zone-share-row");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByTestId("zone-share-bar").style.width).toBe("38%");
    expect(screen.getByRole("img", { name: /Mexico City centre 38/ })).toBeTruthy();
  });
  it("says so when the city has no zones", () => {
    wrap(<ZoneShareChart city={{ ...cities[0]!, zones: [] }} />);
    expect(screen.getByText(/no promo zones/i)).toBeTruthy();
  });
});

describe("VerdictMix", () => {
  it("stacks counts by verdict and by country, each segment labelled with its count and verdict", () => {
    wrap(<VerdictMix cities={SAMPLE_CITIES} />);
    expect(screen.getByRole("heading", { name: "Verdict mix" })).toBeTruthy();
    const overall = screen.getByRole("img", { name: /Play 2, Under the radar 2/ });
    expect(overall).toBeTruthy();
    const segs = within(screen.getByTestId("mix-all")).getAllByTestId("mix-seg");
    expect(segs.map((s) => s.getAttribute("data-verdict"))).toEqual(["play", "hidden_goldmine", "de_risk", "consider", "skip", "insufficient_data"].filter((v) => SAMPLE_CITIES.some((c) => c.verdict === v)));
    expect(segs.reduce((n, s) => n + Number(s.getAttribute("data-count")), 0)).toBe(SAMPLE_CITIES.length);
    expect(screen.getAllByTestId("mix-country")).toHaveLength(new Set(SAMPLE_CITIES.map((c) => c.country)).size);
  });
});

describe("TeamOverview", () => {
  const snap = {
    ws: "w", rev: 1, createdAt: 0, overrides: {}, leads: {}, activity: [],
    statuses: { "3530597": { status: "confirmed", name: "A", role: "Manager", at: 1 } },
    threads: { "city:3530597": { resolved: false, messages: [{ id: "1", text: "t", name: "A", role: "Manager", at: 1 }] } },
  } as never;
  it("counts cities by status and lists open threads per city as links", () => {
    wrap(<TeamOverview cities={cities} snapshot={snap} hrefFor={href} />);
    expect(screen.getByRole("heading", { name: "Team status" })).toBeTruthy();
    expect(screen.getByTestId("status-count-confirmed").textContent).toBe("1");
    expect(screen.getByTestId("status-count-considering").textContent).toBe(String(cities.length - 1));
    const link = screen.getByRole("link", { name: /Mexico City/ });
    expect(link.getAttribute("href")).toBe("/tours/playbook/3530597?showcase=1");
    expect(link.textContent).toMatch(/1 open thread/);
  });
  it("says there are no open threads when there are none", () => {
    wrap(<TeamOverview cities={cities} snapshot={{ ...(snap as object), threads: {} } as never} hrefFor={href} />);
    expect(screen.getByText("No open threads.")).toBeTruthy();
  });
});

describe("FiltersBar", () => {
  const base = { filters: defaultTourFilters(), onChange: vi.fn(), cities: SAMPLE_CITIES, showStatus: false, shown: 5 };
  it("country chips are a multi-select; toggling reports the new filters", async () => {
    const onChange = vi.fn();
    render(<FiltersBar {...base} onChange={onChange} />);
    const mx = screen.getByRole("button", { name: /Mexico/ });
    expect(mx.getAttribute("aria-pressed")).toBe("false");
    await userEvent.click(mx);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ countries: ["MX"] }));
  });
  it("verdict chips use the Insights wording (Under the radar) and report toggles", async () => {
    const onChange = vi.fn();
    render(<FiltersBar {...base} onChange={onChange} />);
    for (const n of ["Play", "Under the radar", "De-risk", "Consider", "Skip"]) expect(screen.getByRole("button", { name: n })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Under the radar" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ verdicts: ["hidden_goldmine"] }));
  });
  it("team status chips appear only with a workspace", () => {
    const { rerender } = render(<FiltersBar {...base} />);
    expect(screen.queryByRole("button", { name: "Confirmed" })).toBeNull();
    rerender(<FiltersBar {...base} showStatus />);
    for (const n of ["Considering", "Confirmed", "On hold", "Dropped"]) expect(screen.getByRole("button", { name: n })).toBeTruthy();
  });
  it("has a min winnability slider, a sort select and Reset filters", () => {
    const onChange = vi.fn();
    render(<FiltersBar {...base} onChange={onChange} filters={{ ...defaultTourFilters(), minWinnability: 40 }} />);
    const slider = screen.getByRole("slider", { name: /Minimum winnability/ });
    fireEvent.change(slider, { target: { value: "65" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ minWinnability: 65 }));
    fireEvent.change(screen.getByRole("combobox", { name: "Sort by" }), { target: { value: "name" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ sort: "name" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(onChange).toHaveBeenLastCalledWith(defaultTourFilters());
  });
});
