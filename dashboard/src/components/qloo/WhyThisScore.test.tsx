// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { DEFAULT_SCORING_DISPLAY } from "@/lib/qloo/labels";
import { WhyThisScore } from "./WhyThisScore";
import { DualBars } from "./DualBars";
import { CityRow } from "./CityRow";

const city = SAMPLE_CITIES[2]!;

beforeEach(() => { vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} })); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("WhyThisScore scoring display", () => {
  it("shows the applied thresholds, a dropped component and the floor note", () => {
    const scoring = {
      ...DEFAULT_SCORING_DISPLAY, version: "calibrated-x",
      affinityFloors: { sponsor_fit: 0.9, local_hooks: 0.92, venue_fit: 0.88 },
      weights: { ...DEFAULT_SCORING_DISPLAY.weights, fan_concentration: 0 },
      thresholds: { ...DEFAULT_SCORING_DISPLAY.thresholds, goldmineAct: 41 },
    };
    render(<WhyThisScore city={city} scoring={scoring} />);
    expect(screen.getByText("45≤fan<70 & activation ≥41")).toBeTruthy();
    expect(screen.getByText(/dropped — no spread in calibration/i)).toBeTruthy();
    expect(screen.getByText(/rescaled from a calibrated floor/i)).toBeTruthy();
  });
  it("names the actual floors from the config in the floored paragraph", () => {
    const scoring = { ...DEFAULT_SCORING_DISPLAY, affinityFloors: { sponsor_fit: 0.92, local_hooks: 0.95, venue_fit: 0.88 } };
    render(<WhyThisScore city={city} scoring={scoring} />);
    expect(screen.getByText(/sponsor 0\.92 · hooks 0\.95 · venue 0\.88/)).toBeTruthy();
  });
  it("falls back to the default rules without a scoring config (sample, old recordings)", () => {
    render(<WhyThisScore city={city} />);
    expect(screen.getByText("45≤fan<70 & activation ≥75")).toBeTruthy();
    expect(screen.queryByText(/rescaled from a calibrated floor/i)).toBeNull();
  });
  it("close call: chip with text plus the borderline line; absent otherwise", () => {
    const { unmount } = render(<WhyThisScore city={{ ...city, closeCall: true }} />);
    expect(screen.getByText("Close call")).toBeTruthy();
    expect(screen.getByText("Within 2 points of a verdict line — treat as borderline.")).toBeTruthy();
    unmount();
    render(<WhyThisScore city={{ ...city, closeCall: true }} scoring={{ ...DEFAULT_SCORING_DISPLAY, closeCallBand: 3 }} />);
    expect(screen.getByText("Within 3 points of a verdict line — treat as borderline.")).toBeTruthy();
    cleanup();
    render(<WhyThisScore city={{ ...city, closeCall: false }} />);
    expect(screen.queryByText("Close call")).toBeNull();
    expect(screen.queryByText(/treat as borderline/)).toBeNull();
  });
});

describe("DualBars thresholds", () => {
  it("places ticks from injected thresholds", () => {
    const t = { ...DEFAULT_SCORING_DISPLAY.thresholds, deRiskAct: 13, playAct: 28, goldmineAct: 38, goldmineFanMin: 40, playFan: 65 };
    const { container } = render(<DualBars fanHeat={city.fanHeat} activation={city.activation} thresholds={t} />);
    const lefts = [...container.querySelectorAll<HTMLElement>("span[aria-hidden][style*='left']")].map((e) => e.style.left);
    expect(lefts).toEqual(["40%", "65%", "13%", "28%", "38%"]);
  });
});

describe("CityRow close call", () => {
  it("shows a Close call chip and mentions it in the accessible name", () => {
    render(<ul><CityRow city={{ ...city, closeCall: true }} onOpen={() => {}} /></ul>);
    expect(screen.getByText("Close call")).toBeTruthy();
    expect(screen.getByRole("button", { name: /close call/i })).toBeTruthy(); // name comes from the visible chip text
  });
  it("no chip without the flag", () => {
    render(<ul><CityRow city={city} onOpen={() => {}} /></ul>);
    expect(screen.queryByText("Close call")).toBeNull();
  });
});

describe("location_unresolved", () => {
  const unplaced = {
    ...city, verdict: "insufficient_data" as const, insufficientReason: "location_unresolved" as const, locationAttempts: 2, zones: [], closeCall: false,
    winnability: { value: null, reason: "insufficient_data" as const, refs: [] },
    activation: { value: null, reason: "insufficient_data" as const, refs: [], components: {} },
  };
  it("explains in plain words why the city was not scored", () => {
    render(<WhyThisScore city={unplaced} />);
    expect(screen.getByText("Qloo couldn't place this city precisely, so we didn't score it.")).toBeTruthy();
    expect(screen.queryByText("Not enough data to score")).toBeNull();
  });
  it("keeps the ordinary thin-data wording for other insufficient cities", () => {
    render(<WhyThisScore city={{ ...unplaced, insufficientReason: undefined }} />);
    expect(screen.getByText("Not enough data to score")).toBeTruthy();
    expect(screen.queryByText(/couldn't place this city/)).toBeNull();
  });
  it("the board row says so too", () => {
    render(<ul><CityRow city={unplaced} onOpen={() => {}} /></ul>);
    expect(screen.getByText("Couldn't place this city")).toBeTruthy();
    expect(screen.getByRole("button").getAttribute("aria-describedby")).toBeTruthy();
    expect(document.body.textContent).toContain("Qloo couldn't place this city precisely, so we didn't score it.");
  });
});

