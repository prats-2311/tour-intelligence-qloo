// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AdvanceRisks } from "@/lib/qloo/types";
import { AdvanceBody, ADVANCE_FOOTER, NATIONALITY_CAVEAT } from "./Advance";

afterEach(cleanup);

const ok: AdvanceRisks = {
  weather: { status: "ok", source: "Open-Meteo historical archive", sourceUrl: "https://open-meteo.com/en/docs/historical-weather-api", years: [2023, 2024, 2025], days: 12, tempMaxC: { mean: 24.5, min: 20, max: 30 }, tempMinC: { mean: 12 }, rainDaysShare: 0.25, note: "Typical weather, same dates in 2023–2025 (Open-Meteo history). Not a forecast." },
  holidays: { status: "ok", source: "Nager.Date", sourceUrl: "https://date.nager.at/", items: [{ date: "2027-03-21", name: "Benito Juarez", localName: "Natalicio", near: false }, { date: "2027-03-24", name: "Holy Thursday", localName: "Jueves Santo", near: true }] },
  visa: { status: "ok", summary: "A permit is needed.", leadTime: "30 days", items: [{ text: "Foreign performers need a permit", sourceUrl: "https://a.example/visa" }], sources: [{ title: "Visa page", url: "https://a.example/visa" }], cached: false },
  equipment: { status: "ok", summary: "A carnet helps.", items: [{ text: "A carnet covers instruments", sourceUrl: "https://b.example/ata" }], sources: [{ title: "ATA page", url: "https://b.example/ata" }], cached: false },
  generatedAt: "t",
};

describe("AdvanceBody", () => {
  it("lays the lookups out in two columns from 1024px (Weather + Holidays | Visas + Equipment), one column below", () => {
    render(<AdvanceBody data={ok} loading={false} />);
    const grid = screen.getByTestId("advance-columns");
    expect(grid.className).toMatch(/\bgrid-cols-1\b/);
    expect(grid.className).toMatch(/\blg:grid-cols-2\b/);
    const cols = Array.from(grid.children);
    expect(cols).toHaveLength(2);
    expect(within(cols[0] as HTMLElement).getByRole("region", { name: "Weather" })).toBeTruthy();
    expect(within(cols[0] as HTMLElement).getByRole("region", { name: "Holidays" })).toBeTruthy();
    expect(within(cols[1] as HTMLElement).getByRole("region", { name: "Visas and work permits" })).toBeTruthy();
    expect(within(cols[1] as HTMLElement).getByRole("region", { name: "Equipment and customs" })).toBeTruthy();
  });
  it("shows a skeleton per section while loading", () => {
    render(<AdvanceBody data={undefined} loading />);
    expect(screen.getAllByTestId("advance-skeleton")).toHaveLength(4);
    expect(screen.getByText(ADVANCE_FOOTER)).toBeTruthy();
  });
  it("shows weather and holidays while only the web part is still loading", () => {
    render(<AdvanceBody data={{ weather: ok.weather, holidays: ok.holidays, generatedAt: "t" }} loading={false} loadingWeb />);
    expect(within(screen.getByRole("region", { name: "Weather" })).getByText(/average 24\.5°C/)).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Holidays" })).getByText("Benito Juarez")).toBeTruthy();
    expect(screen.getAllByTestId("advance-skeleton")).toHaveLength(2);
    expect(within(screen.getByRole("region", { name: "Visas and work permits" })).getByTestId("advance-skeleton")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Weather" })).queryByTestId("advance-skeleton")).toBeNull();
  });
  it("shows the web sections while the fast part is still loading", () => {
    render(<AdvanceBody data={{ visa: ok.visa, equipment: ok.equipment, generatedAt: "t" }} loading={false} loadingFast />);
    expect(screen.getAllByTestId("advance-skeleton")).toHaveLength(2);
    expect(screen.getByText("A permit is needed.")).toBeTruthy();
  });
  it("renders weather with the not-a-forecast label and source link", () => {
    render(<AdvanceBody data={ok} loading={false} />);
    const w = within(screen.getByRole("region", { name: "Weather" }));
    expect(w.getByText(/Not a forecast\./)).toBeTruthy();
    expect(w.getByText(/average 24\.5°C/)).toBeTruthy();
    expect(w.getByRole("link", { name: "Open-Meteo historical archive" }).getAttribute("href")).toBe("https://open-meteo.com/en/docs/historical-weather-api");
  });
  it("lists holidays, marking near ones, and says so when there are none", () => {
    const { rerender } = render(<AdvanceBody data={ok} loading={false} />);
    const h = within(screen.getByRole("region", { name: "Holidays" }));
    expect(h.getByText("Benito Juarez")).toBeTruthy();
    expect(h.getByText("Just outside the window")).toBeTruthy();
    expect(h.getByRole("link", { name: "Nager.Date" })).toBeTruthy();
    rerender(<AdvanceBody data={{ ...ok, holidays: { ...ok.holidays, items: [] } as AdvanceRisks["holidays"] }} loading={false} />);
    expect(screen.getByText("No public holidays in the show window")).toBeTruthy();
  });
  it("shows visa items with source links, lead time and the nationality caveat; equipment items with links", () => {
    render(<AdvanceBody data={ok} loading={false} />);
    const v = within(screen.getByRole("region", { name: "Visas and work permits" }));
    expect(v.getByText("30 days")).toBeTruthy();
    expect(v.getByText(NATIONALITY_CAVEAT)).toBeTruthy();
    expect(v.getAllByRole("link").some((a) => a.getAttribute("href") === "https://a.example/visa")).toBe(true);
    const e = within(screen.getByRole("region", { name: "Equipment and customs" }));
    expect(e.getByText("A carnet covers instruments")).toBeTruthy();
    expect(e.getAllByRole("link").some((a) => a.getAttribute("href") === "https://b.example/ata")).toBe(true);
  });
  it("drops the nationality caveat and names the country when one was given", () => {
    render(<AdvanceBody data={{ ...ok, visa: { ...ok.visa, artistCountry: "United Kingdom" } as AdvanceRisks["visa"] }} loading={false} />);
    expect(screen.queryByText(NATIONALITY_CAVEAT)).toBeNull();
    expect(screen.getByText("For an artist from United Kingdom.")).toBeTruthy();
  });
  it("explains unavailable and capped sections in plain words, still showing sources", () => {
    const data: AdvanceRisks = { ...ok, weather: { status: "unavailable", message: "Weather history is unavailable right now." }, holidays: { status: "unavailable", message: "Public holidays are unavailable for this country." },
      visa: { status: "capped", message: "Web lookups are paused for today." }, equipment: { status: "unavailable", message: "Summary unavailable; sources below.", sources: [{ title: "ATA page", url: "https://b.example/ata" }] } };
    render(<AdvanceBody data={data} loading={false} />);
    expect(screen.getByText("Weather history is unavailable right now.")).toBeTruthy();
    expect(screen.getByText("Public holidays are unavailable for this country.")).toBeTruthy();
    expect(screen.getByText("Web lookups are paused for today.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "ATA page" }).getAttribute("href")).toBe("https://b.example/ata");
  });
  it("shows only the message when there is nothing to look up", () => {
    render(<AdvanceBody data={undefined} loading={false} message="Add a date window to the brief." />);
    expect(screen.getByText("Add a date window to the brief.")).toBeTruthy();
    expect(screen.queryByTestId("advance-skeleton")).toBeNull();
  });
  it("renders holiday date and name as separate elements with a separator, once per date+name", () => {
    const dup = { date: "2027-03-26", name: "Good Friday", localName: "Good Friday", near: false };
    render(<AdvanceBody data={{ ...ok, holidays: { ...ok.holidays, items: [dup, dup] } as AdvanceRisks["holidays"] }} loading={false} />);
    const h = within(screen.getByRole("region", { name: "Holidays" }));
    expect(h.getAllByText("Good Friday")).toHaveLength(1);
    const li = h.getByText("Good Friday").closest("li")!;
    expect(li.textContent).toContain("26 Mar \u00b7 Good Friday");
    expect(h.getByText("26 Mar")).not.toBe(h.getByText("Good Friday"));
  });
});
