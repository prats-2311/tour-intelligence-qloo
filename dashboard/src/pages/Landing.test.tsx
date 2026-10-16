// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sortCities } from "@/lib/qloo/ranking";
import { SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import Landing from "./Landing";

vi.mock("@/lib/qloo/fixtures/showcase.json", async () => ({ default: (await import("@/test/placeholderShowcase")).PLACEHOLDER_SHOWCASE }));
vi.mock("@/components/qloo/TourMap", () => ({ default: () => <div data-testid="map" /> }));

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Landing", () => {
  it("has the headline and both entry points", () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1, name: "Win their city." })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Try the showcase tour" }).getAttribute("href")).toBe("/tours/board?showcase=1");
    expect(screen.getByRole("link", { name: "Plan your own" }).getAttribute("href")).toBe("/tours/board");
  });
  it("labels the proof card with the verbatim sample banner and integrity line, and shows no LIVE badge", () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    const card = screen.getByRole("region", { name: "Guadalajara sample routing row" });
    expect(within(card).getByText("Sample data — illustrative, not Qloo output")).toBeTruthy();
    expect(within(card).getByText("Affinity signal from aggregate taste data — not a ticket forecast or a claim about individuals.")).toBeTruthy();
    expect(screen.queryByText("Affinity signal from aggregate taste data — not a ticket forecast.")).toBeNull();
    expect(screen.queryByText(/\blive\b/i)).toBeNull();
  });
  it("the Guadalajara proof card links to its sample playbook", () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /Guadalajara/ }).getAttribute("href")).toBe("/tours/playbook/4005539?sample=1");
  });
  it("shows the fixture's winnability, never a filler", () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    const card = screen.getByRole("region", { name: "Guadalajara sample routing row" });
    expect(within(card).getByTestId("proof-winnability").textContent).toBe(String(Math.round(SAMPLE_CITIES[2]!.winnability.value!)));
  });
  it("shows the Guadalajara fragment from the sample fixture and omits the backtest link", () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.getByText("Guadalajara")).toBeTruthy();
    expect(screen.getByText("Ranked 6th on fan density alone. 3rd on winnability.")).toBeTruthy();
    expect(screen.getByText("Hidden goldmine")).toBeTruthy();
    expect(screen.queryByText(/backtest/i)).toBeNull();
  });
  it("derives the rank line from the fixture", () => {
    const id = SAMPLE_CITIES[2]!.id;
    const rank = (m: "density" | "winnability") => sortCities(SAMPLE_CITIES, m).findIndex((c) => c.id === id) + 1;
    expect([rank("density"), rank("winnability")]).toEqual([6, 3]);
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.getByText("Ranked 6th on fan density alone. 3rd on winnability.")).toBeTruthy();
  });
  it("desktop branch: map region is aria-hidden and no LIVE text", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    const { container } = render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(container.querySelector('[aria-hidden="true"][inert]')).toBeTruthy();
    expect(screen.queryByText(/\blive\b/i)).toBeNull();
  });
});
