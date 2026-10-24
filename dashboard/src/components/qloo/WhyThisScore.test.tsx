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

describe("WhyThisScore capped seed", () => {
  const capped = { ...city, verdict: "consider" as const, candidateSource: "major_market" as const, fanHeatFloor: true, closeCall: true };
  it("says the market is capped instead of citing Play / Hidden goldmine boundaries", () => {
    render(<WhyThisScore city={capped} />);
    expect(screen.getByText(/can't become Play or Hidden goldmine/i)).toBeTruthy();
    expect(screen.queryByText("Within 2 points of a verdict line — treat as borderline.")).toBeNull();
    const rules = screen.getByRole("list", { name: "Verdict rules" });
    expect(rules.textContent).not.toMatch(/45≤fan<70/);
    expect(rules.textContent).not.toMatch(/fan ≥70 & activation ≥60/);
    const capLi = [...rules.querySelectorAll("li")].find((li) => li.textContent!.startsWith("Play, Hidden goldmine, De-risk"))!;
    expect([...capLi.querySelectorAll("span")].map((x) => x.textContent)).toEqual(["Play, Hidden goldmine, De-risk:", "not available (capped at Consider, no Qloo fan-heat evidence)"]);
    expect(rules.textContent).not.toMatch(/::|: not available:/);
    expect(rules.querySelectorAll("li")).toHaveLength(4);
  });
  it("shows the capped line only when the verdict is consider", () => {
    const { unmount } = render(<WhyThisScore city={capped} />);
    expect(screen.getByText(/Capped at Consider: no Qloo fan-heat evidence/)).toBeTruthy();
    unmount();
    render(<WhyThisScore city={{ ...capped, verdict: "skip" }} />);
    expect(screen.queryByText(/Capped at Consider: no Qloo fan-heat evidence/)).toBeNull();
  });
});

describe("CityRow secondary line", () => {
  const major = { ...city, verdict: "consider" as const, candidateSource: "major_market" as const, fanHeatFloor: true, closeCall: true };
  it("puts chips and the capped line in their own block, apart from the name", () => {
    render(<ul><CityRow city={major} onOpen={() => {}} /></ul>);
    const name = screen.getByText(major.name);
    const chips = screen.getByTestId("row-notes");
    expect(chips.contains(name)).toBe(false);
    expect(chips.textContent).toMatch(/Major market/);
    expect(chips.textContent).toMatch(/Close call/);
    expect(chips.textContent).toMatch(/Capped at Consider/);
  });
  it("hides the capped line unless the verdict is consider", () => {
    render(<ul><CityRow city={{ ...major, verdict: "skip" }} onOpen={() => {}} /></ul>);
    expect(screen.queryByText(/Capped at Consider/)).toBeNull();
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


describe("major market", () => {
  const seed = { ...city, candidateSource: "major_market" as const, fanHeatFloor: true };
  it("the row carries a Major market tag with its explainer, never the word found", () => {
    render(<ul><CityRow city={{ ...seed, country: "MX" }} onOpen={() => {}} /></ul>);
    expect(screen.getByText("Major market")).toBeTruthy();
    expect(screen.getByRole("button", { name: /major market/i })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\bfound\b/i);
  });
  it("the score sheet explains it in full", () => {
    render(<WhyThisScore city={{ ...seed, country: "MX" }} />);
    expect(screen.getByText("Largest market in Mexico. We always check it; it isn't in Qloo's top fan hotspots for this artist, so fan heat is shown at the board's floor.")).toBeTruthy();
  });
  it("a floored seed says it is capped at Consider, in the row and the sheet", () => {
    const LINE = "Capped at Consider: no Qloo fan-heat evidence for this market.";
    render(<ul><CityRow city={{ ...seed, verdict: "consider" }} onOpen={() => {}} /></ul>);
    expect(screen.getByText(LINE)).toBeTruthy();
    cleanup();
    render(<WhyThisScore city={{ ...seed, verdict: "consider" }} />);
    expect(screen.getByText(LINE)).toBeTruthy();
    cleanup();
    render(<WhyThisScore city={{ ...city, candidateSource: "heat" }} />);
    expect(screen.queryByText(LINE)).toBeNull();
  });
  it("a heat candidate has no tag and no note", () => {
    render(<ul><CityRow city={{ ...city, candidateSource: "heat" }} onOpen={() => {}} /></ul>);
    expect(screen.queryByText("Major market")).toBeNull();
    cleanup();
    render(<WhyThisScore city={{ ...city, candidateSource: "heat" }} />);
    expect(screen.queryByText(/Largest market in/)).toBeNull();
  });
});
