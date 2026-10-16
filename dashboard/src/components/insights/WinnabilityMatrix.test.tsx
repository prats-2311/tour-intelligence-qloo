// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { markerElement } from "@/components/qloo/mapMarker";
import { SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { VERDICT_SHAPE } from "@/lib/qloo/labels";
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
