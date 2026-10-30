// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { MARKER_SCALE, markerElement, markerSignature, markerSize, setMarkerSelected } from "./mapMarker";
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
  it("sets no inline position (MapLibre's .maplibregl-marker owns it)", () => {
    const el = markerElement({ verdict: "play", city: "X", label: "X", selected: false, onSelect: () => {} });
    expect(el.style.position).toBe("");
  });
  it("setMarkerSelected updates state in place without replacing nodes", () => {
    const el = markerElement({ verdict: "play", city: "X", label: null, selected: false, onSelect: () => {} });
    const inner = el.querySelector("[data-inner]")!;
    setMarkerSelected(el, true);
    expect(el.querySelector("[data-inner]")).toBe(inner);
    expect(el.getAttribute("aria-pressed")).toBe("true");
    expect((inner as HTMLElement).style.transform).toBe("scale(1.25)");
    expect(el.style.zIndex).toBe("2");
    expect(el.querySelectorAll("[data-halo]").length).toBe(1);
    setMarkerSelected(el, true);
    expect(el.querySelectorAll("[data-halo]").length).toBe(1);
    setMarkerSelected(el, false);
    expect(el.getAttribute("aria-pressed")).toBe("false");
    expect((inner as HTMLElement).style.transform).toBe("none");
    expect(el.style.zIndex).toBe("1");
    expect(el.querySelectorAll("[data-halo]").length).toBe(0);
  });
  it("disables the transition under reduced motion", () => {
    const on = markerElement({ verdict: "play", city: "X", label: null, selected: false, onSelect: () => {}, reduce: true });
    const off = markerElement({ verdict: "play", city: "X", label: null, selected: false, onSelect: () => {} });
    expect((on.querySelector("[data-inner]") as HTMLElement).style.transition).toBe("none");
    expect((off.querySelector("[data-inner]") as HTMLElement).style.transition).toContain("transform");
  });
  it("markerSignature changes with verdict, name or label and is stable otherwise", () => {
    const base = { id: "1", name: "Lima", verdict: "play" as Verdict, label: "Lima" };
    expect(markerSignature(base)).toBe(markerSignature({ ...base }));
    expect(markerSignature({ ...base, verdict: "skip", label: null })).not.toBe(markerSignature(base));
    expect(markerSignature({ ...base, name: "Cusco" })).not.toBe(markerSignature(base));
    expect(markerSignature({ ...base, label: null })).not.toBe(markerSignature(base));
    expect(markerSignature({ ...base, id: "2" })).not.toBe(markerSignature(base));
  });
});

describe("markerSize (size = fan heat, bounded)", () => {
  it("grows monotonically with fan heat for one verdict", () => {
    const sizes = [0, 25, 50, 75, 100].map((f) => markerSize("play", f));
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(new Set(sizes).size).toBeGreaterThan(3);
  });
  it("is bounded: fan heat outside 0-100 clamps, and no marker exceeds the documented min/max", () => {
    expect(markerSize("play", -50)).toBe(markerSize("play", 0));
    expect(markerSize("play", 500)).toBe(markerSize("play", 100));
    for (const v of VERDICTS) for (const f of [0, 50, 100, null]) {
      const s = markerSize(v, f);
      expect(s).toBeGreaterThanOrEqual(MARKER_SCALE.minSize);
      expect(s).toBeLessThanOrEqual(MARKER_SCALE.maxSize);
    }
  });
  it("falls back to the verdict's base size when fan heat is missing or not finite", () => {
    expect(markerSize("play", null)).toBe(10);
    expect(markerSize("hidden_goldmine", Number.NaN)).toBe(12);
  });
  it("the drawn glyph uses the scaled size while the hit area stays 44px", () => {
    const small = markerElement({ verdict: "play", city: "A", label: null, selected: false, onSelect: () => {}, details: { fanHeat: 0, activation: 50, winnability: 40 } });
    const big = markerElement({ verdict: "play", city: "A", label: null, selected: false, onSelect: () => {}, details: { fanHeat: 100, activation: 50, winnability: 40 } });
    const w = (el: HTMLElement) => Number(el.querySelector("svg")!.getAttribute("width"));
    expect(w(big)).toBeGreaterThan(w(small));
    expect(big.style.width).toBe("44px");
    expect(big.dataset.size).toBe(String(markerSize("play", 100)));
  });
});

describe("marker tooltip", () => {
  const details = { fanHeat: 72.4, activation: 65, winnability: null, status: "Confirmed" };
  const make = () => markerElement({ verdict: "play", city: "Lima", label: null, selected: false, onSelect: () => {}, details });
  it("holds city, verdict, fan heat, activation, winnability and the team status chip", () => {
    const el = make();
    const tip = el.querySelector<HTMLElement>('[role="tooltip"]')!;
    expect(tip.textContent).toContain("Lima");
    expect(tip.textContent).toContain("Play");
    expect(tip.textContent).toContain("Fan heat 72");
    expect(tip.textContent).toContain("Activation 65");
    expect(tip.textContent).toContain("Winnability not enough data");
    expect(tip.querySelector("[data-status-chip]")!.textContent).toBe("Confirmed");
    expect(el.getAttribute("aria-describedby")).toBe(tip.id);
  });
  it("is hidden until hover or keyboard focus, and Escape closes it", () => {
    const el = make();
    const tip = el.querySelector<HTMLElement>('[role="tooltip"]')!;
    expect(tip.hidden).toBe(true);
    el.dispatchEvent(new Event("focus"));
    expect(tip.hidden).toBe(false);
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(tip.hidden).toBe(true);
    el.dispatchEvent(new Event("mouseenter"));
    expect(tip.hidden).toBe(false);
    el.dispatchEvent(new Event("mouseleave"));
    expect(tip.hidden).toBe(true);
  });
  it("has no status chip without a status and no tooltip without details", () => {
    const el = markerElement({ verdict: "play", city: "Lima", label: null, selected: false, onSelect: () => {}, details: { fanHeat: 1, activation: 2, winnability: 3 } });
    expect(el.querySelector("[data-status-chip]")).toBeNull();
    const bare = markerElement({ verdict: "play", city: "Lima", label: null, selected: false, onSelect: () => {} });
    expect(bare.querySelector('[role="tooltip"]')).toBeNull();
  });
  it("shows no indexes as percentages", () => {
    expect(make().textContent).not.toMatch(/%/);
  });
  it("markerSignature changes with fan heat, scores or status", () => {
    const base = { id: "1", name: "Lima", verdict: "play" as Verdict, label: null, details };
    expect(markerSignature({ ...base, details: { ...details, fanHeat: 10 } })).not.toBe(markerSignature(base));
    expect(markerSignature({ ...base, details: { ...details, status: "On hold" } })).not.toBe(markerSignature(base));
  });
});
