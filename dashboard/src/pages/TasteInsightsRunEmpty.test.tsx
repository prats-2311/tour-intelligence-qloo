// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialBoard } from "@/lib/qloo/tourBoardReducer";
import TasteInsights from "./TasteInsights";

vi.mock("@/components/qloo/TourMap", () => ({ default: () => <div /> }));
vi.mock("@/lib/qloo/TourBoardProvider", () => ({
  useTourBoard: () => ({
    state: {
      ...initialBoard, status: "done", brief: { artist: "Lumen Vale", regions: ["Peru"], maxStops: 4 },
      regionsEmpty: ["Peru"], regionsUnavailable: [{ region: "Chile", code: "X", message: "Qloo down" }],
      error: { code: "E", message: "Budget reached" },
    },
  }),
}));
beforeEach(() => vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} })));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("TasteInsights after a zero-city run", () => {
  it("explains what happened instead of 'run a Tour Board'", () => {
    render(<MemoryRouter><TasteInsights /></MemoryRouter>);
    expect(screen.queryByText("Run a Tour Board to see insights")).toBeNull();
    expect(screen.getByText("No markets were scored")).toBeTruthy();
    expect(screen.getByText("No Qloo signal in Peru")).toBeTruthy();
    expect(screen.getByText("Chile unavailable: Qloo down")).toBeTruthy();
    expect(screen.getByText("Budget reached")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to the Tour Board" }).getAttribute("href")).toBe("/tours/board");
  });
});
