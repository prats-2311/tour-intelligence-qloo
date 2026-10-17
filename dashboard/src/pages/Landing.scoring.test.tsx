// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SCORING_DISPLAY } from "@/lib/qloo/labels";
import { PLACEHOLDER_SHOWCASE } from "@/lib/qloo/placeholderShowcase";
import { parseShowcase, setShowcase } from "@/lib/qloo/showcase";
import Landing from "./Landing";

const THRESHOLDS = { ...DEFAULT_SCORING_DISPLAY.thresholds, deRiskAct: 13, playAct: 28, goldmineAct: 38, goldmineFanMin: 41, playFan: 66 };

vi.mock("@/components/qloo/TourMap", () => ({ default: () => <div data-testid="map" /> }));

// The recording is a live binding set at boot: pin it to the placeholder plus a scoring event with recorded thresholds.
const withScoring = () => parseShowcase({ ...PLACEHOLDER_SHOWCASE, boardEvents: [{ type: "scoring", scoring: { ...DEFAULT_SCORING_DISPLAY, version: "calibrated-x", thresholds: THRESHOLDS } }, ...PLACEHOLDER_SHOWCASE.boardEvents] });
beforeEach(() => { setShowcase(withScoring()); vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} })); });
afterEach(() => { setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE)); cleanup(); vi.unstubAllGlobals(); });

const tickLefts = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>("span[aria-hidden].absolute")].map((s) => s.style.left);

describe("Landing hero bars use the recording's scoring thresholds", () => {
  it("draws ticks at the recorded thresholds, not the defaults", () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    const card = screen.getByRole("region", { name: /routing row/ });
    const lefts = tickLefts(within(card).getByTestId("bar-activation").closest("div")!.parentElement!);
    expect(lefts).toEqual([`${THRESHOLDS.goldmineFanMin}%`, `${THRESHOLDS.playFan}%`, `${THRESHOLDS.deRiskAct}%`, `${THRESHOLDS.playAct}%`, `${THRESHOLDS.goldmineAct}%`]);
    expect(lefts).not.toContain(`${DEFAULT_SCORING_DISPLAY.thresholds.deRiskAct}%`);
  });
});
