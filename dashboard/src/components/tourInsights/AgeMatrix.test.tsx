// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSegments, resetSegments } from "@/lib/qloo/segmentStore";
import type { ScoredCity } from "@/lib/qloo/types";
import { SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { AgeMatrix } from "./AgeMatrix";

afterEach(() => { cleanup(); resetSegments(); vi.unstubAllGlobals(); });

const COST = "Runs live Qloo lookups, about 5 per city the first time; cached after.";
const base = SAMPLE_CITIES.filter((c) => c.verdict !== "insufficient_data");
const mk = (n: number): ScoredCity[] => Array.from({ length: n }, (_, i) => ({ ...base[i % base.length]!, id: `id${i}`, name: `Town ${i}` }));
const artist = { entityId: "ART", name: "Mac DeMarco" };
const bandBody = (b: string, index: number, names: string[], lifted = false) => ({ band: b, phrase: "", index, status: "ok", hiddenCount: 0, newInTop5: 1, lifted, items: names.map((name, i) => ({ name, entityId: `${b}${i}`, artistRank: i + 1, cityRank: lifted && i === 0 ? null : i + 3 })) });
const okBody = (...bands: ReturnType<typeof bandBody>[]) => ({ status: "ok", indexes: {}, bands });
const res = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const stub = (answer: (url: string) => Response | Promise<Response>) => {
  let active = 0, peak = 0;
  const f = vi.fn(async (u: unknown) => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 3)); try { return await answer(String(u)); } finally { active--; } });
  vi.stubGlobal("fetch", f);
  return { f, peak: () => peak };
};
const fans = (_c: ScoredCity) => [{ name: "Stüssy", fanRank: 1, cityRank: 2 }, { name: "HUF", fanRank: 2, cityRank: 4 }];
const hrefFor = (id: string, band?: string) => `/tours/playbook/${id}?showcase=1${band ? `&band=${band}` : ""}`;
const view = (cities: ScoredCity[], over: Partial<React.ComponentProps<typeof AgeMatrix>> = {}) => render(<MemoryRouter><AgeMatrix cities={cities} artist={artist} allFansOf={fans} hrefFor={hrefFor} {...over} /></MemoryRouter>);
const load = (n: number) => fireEvent.click(screen.getByRole("button", { name: `Load age groups for all ${n} ${n === 1 ? "city" : "cities"}` }));

describe("AgeMatrix", () => {
  it("titles the section without the word insights, shows the button and the honest cost note, and fetches nothing until the click", () => {
    const { f } = stub(() => res(okBody()));
    view(mk(3));
    expect(screen.getByRole("heading", { name: "Which brands each age group loves, city by city" })).toBeTruthy();
    expect(screen.getByText(COST)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Load age groups for all 3 cities" })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it("counts at most 10 cities in the button", () => {
    stub(() => res(okBody()));
    view(mk(12));
    expect(screen.getByRole("button", { name: "Load age groups for all 10 cities" })).toBeTruthy();
  });
  it("loads two at a time, shows progress, then a table with scoped headers and the column union", async () => {
    const t = stub((u) => res(u.includes("Town+0") ? okBody(bandBody("25_to_29", 0.9, ["Off-white"], true), bandBody("55_and_older", 0.78, ["Stüssy"])) : okBody(bandBody("25_to_29", 0.8, ["Cerro"]))));
    view(mk(5));
    load(5);
    expect((await screen.findByRole("status")).textContent).toMatch(/of 5 cities/);
    const table = await screen.findByRole("table");
    await waitFor(() => expect(t.f).toHaveBeenCalledTimes(5));
    expect(t.peak()).toBe(2);
    const heads = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    expect(heads[0]).toMatch(/City/);
    expect(heads.some((h) => h!.startsWith("All fans"))).toBe(true);
    expect(heads.some((h) => h!.startsWith("25–29") && h!.includes("(+0.80 to +0.90 vs average audience)"))).toBe(true);
    expect(heads.some((h) => h!.startsWith("55+"))).toBe(true);
    expect(heads.some((h) => /35–44|45–54|30–34|18–24/.test(h!))).toBe(false);
    expect(table.querySelectorAll('th[scope="col"]').length).toBeGreaterThan(2);
    expect(table.querySelectorAll('tbody th[scope="row"]')).toHaveLength(5);
    expect(table.textContent).not.toContain("%");
  });
  it("cell: top brand, fans rank it, not-in-city-top-20 marker when lifted, unique badge only when outside the all-fans top 5", async () => {
    stub(() => res(okBody(bandBody("25_to_29", 0.9, ["Off-white"], true), bandBody("55_and_older", 0.7, ["Stüssy"]))));
    view(mk(1));
    load(1);
    await screen.findByRole("button", { name: /Off-white/ });
    const row = screen.getAllByTestId("matrix-row")[0]!;
    const young = within(row).getByRole("button", { name: /Off-white/ });
    expect(young.textContent).toContain("Fans rank it #1");
    expect(young.textContent).toContain("not in city top 20");
    expect(young.textContent).toContain("unique");
    const old = within(row).getByRole("button", { name: /Stüssy/ });
    expect(old.textContent).not.toContain("unique");
    expect(old.textContent).not.toContain("not in city top 20");
  });
  it("omits the unique badge when the all-fans list is not available", async () => {
    stub(() => res(okBody(bandBody("25_to_29", 0.9, ["Off-white"]))));
    view(mk(1), { allFansOf: () => null });
    load(1);
    const b = await screen.findByRole("button", { name: /Off-white/ });
    expect(b.textContent).not.toContain("unique");
  });
  it("cities already in the session store render at once, without the button or any fetch", async () => {
    const s = stub(() => res(okBody(bandBody("25_to_29", 0.9, ["Off-white"]))));
    const cs = mk(2);
    for (const c of cs) await loadSegments({ artistId: "ART", artist: "Mac DeMarco", city: { id: c.id, name: c.name, country: c.country, lat: c.lat, lon: c.lon } });
    s.f.mockClear();
    view(cs);
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Load age groups for all/ })).toBeNull();
    expect(s.f).not.toHaveBeenCalled();
  });
  it("a failing city shows Couldn't load with Retry and does not block the others; Retry fetches only that city", async () => {
    let fail = true;
    const s = stub((u) => (u.includes("Town+1") && fail ? res({}, 502) : res(okBody(bandBody("25_to_29", 0.9, ["Off-white"])))));
    view(mk(3));
    load(3);
    const retry = await screen.findByRole("button", { name: "Retry Town 1" });
    expect(screen.getAllByTestId("matrix-row")).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /Off-white/ })).toHaveLength(2);
    expect(screen.getByText(/Couldn.t load/)).toBeTruthy();
    fail = false; s.f.mockClear();
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Off-white/ })).toHaveLength(3));
    expect(s.f).toHaveBeenCalledTimes(1);
  });
  it("when every city fails (no live service) it shows one banner with one Retry, keeps focus, and no per-row errors or table (audit A3)", async () => {
    const s = stub(() => res({}, 503));
    view(mk(4));
    load(4);
    const banner = await screen.findByText(/Age groups need the live service/);
    expect(banner).toBeTruthy();
    const retries = screen.getAllByRole("button", { name: /^Retry/ });
    expect(retries).toHaveLength(1);
    expect(screen.queryByText(/Couldn.t load/)).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Not in memory")).toBeNull();
    expect(document.activeElement).toBe(retries[0]);
    s.f.mockClear();
    fireEvent.click(retries[0]!);
    await waitFor(() => expect(s.f).toHaveBeenCalledTimes(4));
  });
  it("no_skew city reads No age group stands out", async () => {
    stub(() => res({ status: "no_skew", indexes: {}, bands: [] }));
    view(mk(1));
    load(1);
    expect(await screen.findByText("No age group stands out")).toBeTruthy();
  });
  it("rows follow the cities given (filters and sort happen upstream)", async () => {
    stub(() => res(okBody(bandBody("25_to_29", 0.9, ["Off-white"]))));
    const cs = mk(3);
    const { rerender } = view([cs[2]!, cs[0]!]);
    load(2);
    await screen.findByRole("table");
    expect(screen.getAllByTestId("matrix-row").map((r) => within(r).getByRole("rowheader").textContent)).toEqual(["Town 2", "Town 0"]);
    rerender(<MemoryRouter><AgeMatrix cities={[cs[0]!]} artist={artist} allFansOf={fans} hrefFor={hrefFor} /></MemoryRouter>);
    expect(screen.getAllByTestId("matrix-row")).toHaveLength(1);
  });
  it("planted Ariel Pink and non-sponsor organisations never appear", async () => {
    stub(() => res(okBody(bandBody("25_to_29", 0.9, ["Ariel Pink", "Red Cross", "Real Brand"]))));
    const { container } = view(mk(1), { allFansOf: () => [{ name: "Ariel Pink", fanRank: 1, cityRank: null }, { name: "Stüssy", fanRank: 2, cityRank: null }] });
    load(1);
    fireEvent.click(await screen.findByRole("button", { name: /Real Brand/ }));
    expect(container.textContent).not.toContain("Ariel Pink");
    expect(container.textContent).not.toContain("Red Cross");
  });
  it("a cell opens a popover with the band's top 5 and a link to the city playbook with the band preselected; Escape closes it", async () => {
    stub(() => res(okBody(bandBody("25_to_29", 0.9, ["A1", "A2", "A3", "A4", "A5", "A6"]))));
    view(mk(1));
    load(1);
    const cell = await screen.findByRole("button", { name: /A1/ });
    expect(cell.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(cell);
    const pop = screen.getByRole("dialog", { name: /Town 0.*25–29/ });
    expect(within(pop).getAllByRole("listitem")).toHaveLength(5);
    expect(within(pop).queryByText("A6")).toBeNull();
    expect(within(pop).getByRole("link", { name: /Open the Town 0 playbook/ }).getAttribute("href")).toBe("/tours/playbook/id0?showcase=1&band=25_to_29");
    fireEvent.keyDown(pop, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("shows the computed summary line above the table", async () => {
    stub(() => res(okBody(bandBody("25_to_29", 0.9, ["Off-white"]))));
    view(mk(2));
    load(2);
    expect((await screen.findByTestId("matrix-summary")).textContent).toBe("In 2 of 2 cities, the over-indexed group's top brand differs from all fans'.");
  });
  it("scrolls horizontally inside its own container with a sticky first column", async () => {
    stub(() => res(okBody(bandBody("25_to_29", 0.9, ["Off-white"]))));
    view(mk(1));
    load(1);
    const table = await screen.findByRole("table");
    expect(table.parentElement!.className).toContain("overflow-x-auto");
    expect(table.querySelector('tbody th[scope="row"]')!.className).toContain("sticky");
  });
});
