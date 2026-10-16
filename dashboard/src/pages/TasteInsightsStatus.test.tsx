// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_BRIEF, SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { initialBoard, type BoardState } from "@/lib/qloo/tourBoardReducer";
import TasteInsights from "./TasteInsights";

let board: BoardState = initialBoard;
vi.mock("@/components/qloo/TourMap", () => ({ default: () => <div /> }));
vi.mock("@/lib/qloo/TourBoardProvider", () => ({ useTourBoard: () => ({ state: board }) }));
beforeEach(() => vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} })));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); board = initialBoard; });

const live = (s: Partial<BoardState>): BoardState => ({ ...initialBoard, source: "live", brief: SAMPLE_BRIEF, artist: { entityId: "A", name: "Lumen Vale" }, ...s });
const page = () => render(<MemoryRouter><TasteInsights /></MemoryRouter>);
const twoCities = SAMPLE_CITIES.slice(0, 2);

describe("TasteInsights labels partial and failed runs", () => {
  it("connection loss with results says so in the header", () => {
    board = live({ status: "interrupted", interruptReason: "connection", cities: twoCities });
    page();
    expect(screen.getByText("Connection lost — results so far shown")).toBeTruthy();
  });
  it("a user stop with results says so in the header", () => {
    board = live({ status: "interrupted", interruptReason: "user", cities: twoCities });
    page();
    expect(screen.getByText("Stopped — results so far shown")).toBeTruthy();
    expect(screen.queryByText("Connection lost — results so far shown")).toBeNull();
  });
  it("an error after some results shows the error message (budget copy)", () => {
    board = live({ status: "error", error: { code: "BUDGET", message: "Session limit reached — try the showcase tour." }, cities: twoCities });
    page();
    expect(screen.getByText("Session limit reached — try the showcase tour.")).toBeTruthy();
  });
  it("region empty and unavailable notices show alongside scored cities", () => {
    board = live({ status: "done", cities: twoCities, regionsEmpty: ["Atlantis"], regionsUnavailable: [{ region: "Brazil", code: "QLOO_AUTH", message: "no access" }] });
    page();
    expect(screen.getByText(/No Qloo signal in Atlantis/)).toBeTruthy();
    expect(screen.getByText(/Brazil unavailable/)).toBeTruthy();
  });
  it("a complete run shows no partial notice", () => {
    board = live({ status: "done", cities: twoCities });
    page();
    expect(screen.queryByText(/results so far shown/)).toBeNull();
  });
});

describe("TasteInsights zero-city view branches on status", () => {
  it("needs_input sends the user to choose the artist on the Tour Board", () => {
    board = live({ status: "needs_input", needsInput: { type: "needs_input", field: "entity", summary: "Choose", candidates: [{ id: "P1", name: "Pedro" }] } });
    page();
    expect(screen.getByText("Choose the artist on the Tour Board")).toBeTruthy();
    expect(screen.queryByText("No markets were scored")).toBeNull();
    expect(screen.getByRole("link", { name: "Back to the Tour Board" }).getAttribute("href")).toBe("/tours/board");
  });
  it("interrupted before any city says the connection was lost", () => {
    board = live({ status: "interrupted", interruptReason: "connection" });
    page();
    expect(screen.getByText("Connection lost before any market was scored")).toBeTruthy();
    expect(screen.queryByText("No markets were scored")).toBeNull();
    expect(screen.queryByText("Qloo returned no markets for this brief.")).toBeNull();
    expect(screen.getByRole("link", { name: "Back to the Tour Board" }).getAttribute("href")).toBe("/tours/board");
  });
  it("done with no cities keeps the regions listing", () => {
    board = live({ status: "done", regionsEmpty: ["Peru"] });
    page();
    expect(screen.getByText("No markets were scored")).toBeTruthy();
    expect(screen.getByText("No Qloo signal in Peru")).toBeTruthy();
  });
});
