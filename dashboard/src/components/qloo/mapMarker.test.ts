// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { markerElement } from "./mapMarker";
import type { Verdict } from "@/lib/qloo/types";

const VERDICTS: Verdict[] = ["play", "hidden_goldmine", "de_risk", "consider", "skip", "insufficient_data"];
const LABELS: Record<Verdict, string> = {
  play: "Play", hidden_goldmine: "Hidden goldmine", de_risk: "De-risk",
  consider: "Consider", skip: "Skip", insufficient_data: "Not enough data",
};
const shapeOf = (el: HTMLElement) => el.querySelector("[data-shape]")!.getAttribute("data-shape");

describe("markerElement", () => {
  it("gives each verdict a distinct shape", () => {
    const shapes = VERDICTS.map((v) => shapeOf(markerElement({ verdict: v, city: "X", label: null, selected: false, onSelect: () => {} })));
    expect(new Set(shapes).size).toBe(6);
  });
  it("is a focusable button labelled '<city>, <verdict label>'", () => {
    for (const v of VERDICTS) {
      const el = markerElement({ verdict: v, city: "Lima", label: null, selected: false, onSelect: () => {} });
      expect(el.tagName).toBe("BUTTON");
      expect(el.getAttribute("type")).toBe("button");
      expect(el.getAttribute("aria-label")).toBe(`Lima, ${LABELS[v]}`);
      expect(el.tabIndex).toBe(0);
    }
  });
  it("has a >=44px hit area even for the smallest marker", () => {
    const el = markerElement({ verdict: "skip", city: "X", label: null, selected: false, onSelect: () => {} });
    expect(el.style.width).toBe("44px");
    expect(el.style.height).toBe("44px");
  });
  it("selects on click, Enter and Space", () => {
    const onSelect = vi.fn();
    const el = markerElement({ verdict: "play", city: "X", label: null, selected: false, onSelect });
    el.click();
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(onSelect).toHaveBeenCalledTimes(3);
  });
  it("renders the label only when given and flags selection", () => {
    const a = markerElement({ verdict: "play", city: "Lima", label: "Lima", selected: true, onSelect: () => {} });
    expect(a.textContent).toContain("Lima");
    expect(a.getAttribute("aria-pressed")).toBe("true");
    const b = markerElement({ verdict: "skip", city: "Lima", label: null, selected: false, onSelect: () => {} });
    expect(b.textContent).toBe("");
    expect(b.getAttribute("aria-pressed")).toBe("false");
  });
});
