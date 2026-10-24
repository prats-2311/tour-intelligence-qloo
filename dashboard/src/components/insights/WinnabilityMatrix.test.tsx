// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { markerElement } from "@/components/qloo/mapMarker";
import { SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { DEFAULT_SCORING_DISPLAY, VERDICT_SHAPE } from "@/lib/qloo/labels";
import type { ScoredCity, Verdict } from "@/lib/qloo/types";
import { WinnabilityMatrix } from "./WinnabilityMatrix";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const VERDICTS: Verdict[] = ["play", "hidden_goldmine", "de_risk", "consider", "skip", "insufficient_data"];
const base = SAMPLE_CITIES[0]!;
// One plottable city per verdict (insufficient_data gets values so it can be plotted for the shape check).
const cities: ScoredCity[] = VERDICTS.map((v, i) => ({ ...base, id: `c${i}`, name: `City ${i}`, verdict: v, fanHeat: { value: 10 + i * 12, refs: [] }, activation: { value: 20 + i * 10, refs: [], components: {} } }));
const mapShape = (v: Verdict) => markerElement({ verdict: v, city: "X", label: null, selected: false, onSelect: () => {} }).querySelector("[data-shape]")!.getAttribute("data-shape");

describe("WinnabilityMatrix verdict shapes", () => {
  it("matrix marks use the same shape map as the map markers", () => {
    render(<WinnabilityMatrix cities={cities} selectedId={null} onSelect={() => {}} calls={0} onReset={() => {}} />);
    const pts = screen.getAllByTestId("matrix-point");
    expect(pts).toHaveLength(6);
    for (const p of pts) {
      const v = cities.find((c) => c.id === p.getAttribute("data-city-id"))!.verdict;
      const shape = p.querySelector("[data-shape]")!.getAttribute("data-shape");
      expect(shape).toBe(VERDICT_SHAPE[v]);
      expect(shape).toBe(mapShape(v));
    }
  });
  it("legend lists every verdict, including Skip and Not enough data, with its shape", () => {
    render(<WinnabilityMatrix cities={cities} selectedId={null} onSelect={() => {}} calls={0} onReset={() => {}} />);
    const legend = screen.getByRole("list", { name: "Legend" });
    for (const [v, label] of [["skip", "Skip"], ["insufficient_data", "Not enough data"], ["play", "Play"]] as const) {
      const item = within(legend).getByText(label).closest("li")!;
      expect(item.querySelector("[data-shape]")!.getAttribute("data-shape")).toBe(VERDICT_SHAPE[v]);
    }
  });
});

describe("WinnabilityMatrix regions", () => {
  const thresholds = { playFan: 70, playAct: 28, goldmineFanMin: 45, goldmineFanMax: 70, goldmineAct: 38, deRiskFan: 70, deRiskAct: 13, considerWin: 36 };
  const mk = (id: string, name: string, verdict: Verdict, fan: number, act: number): ScoredCity => ({ ...base, id, name, verdict, fanHeat: { value: fan, refs: [] }, activation: { value: act, refs: [], components: {} } });
  const rect = (testId: string) => { const r = screen.getByTestId(testId); return { x: +r.getAttribute("x")!, y: +r.getAttribute("y")!, w: +r.getAttribute("width")!, h: +r.getAttribute("height")! }; };
  const at = (id: string) => { const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(screen.getAllByTestId("matrix-point").find((p) => p.getAttribute("data-city-id") === id)!.getAttribute("transform")!)!; return { x: +m[1]!, y: +m[2]! }; };
  const inside = (p: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  it("plots a play city (activation 37) inside the Play region drawn from the run's thresholds, and de-risk inside De-risk", () => {
    const cs = [mk("p", "Portland", "play", 100, 37), mk("d", "Rio", "de_risk", 96, 12), mk("g", "Juarez", "hidden_goldmine", 62, 45)];
    render(<WinnabilityMatrix cities={cs} thresholds={thresholds} selectedId={null} onSelect={() => {}} calls={0} onReset={() => {}} />);
    expect(inside(at("p"), rect("region-play"))).toBe(true);
    expect(inside(at("d"), rect("region-de_risk"))).toBe(true);
    expect(inside(at("g"), rect("region-hidden_goldmine"))).toBe(true);
    expect(inside(at("p"), rect("region-de_risk"))).toBe(false);
  });
  it("falls back to the default thresholds and draws Play where activation >= playAct", () => {
    render(<WinnabilityMatrix cities={[mk("p", "Portland", "play", 100, 65)]} selectedId={null} onSelect={() => {}} calls={0} onReset={() => {}} />);
    const r = rect("region-play");
    expect(r.h).toBeGreaterThan(0);
    expect(DEFAULT_SCORING_DISPLAY.thresholds.playAct).toBe(60);
  });
});
