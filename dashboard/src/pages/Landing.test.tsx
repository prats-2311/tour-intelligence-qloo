// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Landing from "./Landing";

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
    expect(screen.getByRole("link", { name: "Try the showcase tour" }).getAttribute("href")).toBe("/tours/board?sample=1");
    expect(screen.getByRole("link", { name: "Plan your own" }).getAttribute("href")).toBe("/tours/board");
  });
  it("labels the proof card as sample data and shows no LIVE badge", () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.getByText("Sample")).toBeTruthy();
    expect(screen.queryByText(/live/i)).toBeNull();
  });
  it("shows the Guadalajara fragment from the sample fixture and omits the backtest link", () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.getByText("Guadalajara")).toBeTruthy();
    expect(screen.getByText("Ranked 6th on fan density alone. 3rd on winnability.")).toBeTruthy();
    expect(screen.getByText("Hidden goldmine")).toBeTruthy();
    expect(screen.queryByText(/backtest/i)).toBeNull();
  });
});
