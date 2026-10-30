import { describe, expect, it } from "vitest";
import { clampRing, scrollDelta, sheetTopOf } from "./placement";

const view = { topLimit: 72, bottomLimit: 553 }; // phone: header band above, sheet top at 565 minus a 12 px gap

describe("scrollDelta", () => {
  it("keeps the page title and the target together when both fit above the sheet", () => {
    // title at 120, target 400..520 (bottom 520 <= 553): title already inside; no scroll beyond aligning the title under the header
    const d = scrollDelta({ ...view, target: { top: 400, height: 120 }, title: { top: 120 } });
    expect(d).toBe(120 - (72 + 8));
  });
  it("centres a small target in the free band when there is no title or the title does not fit", () => {
    const d = scrollDelta({ ...view, target: { top: 700, height: 100 }, title: null });
    expect(700 - d).toBe(72 + (481 - 100) / 2);
    const far = scrollDelta({ ...view, target: { top: 2000, height: 100 }, title: { top: 100 } });
    expect(2000 - far).toBe(72 + (481 - 100) / 2);
  });
  it("a target under the sheet is scrolled up so its bottom clears the sheet", () => {
    // audit: the FAB at y 718..778 sat under a sheet starting at 565
    const d = scrollDelta({ ...view, target: { top: 718, height: 60 }, title: null });
    expect(718 + 60 - d).toBeLessThanOrEqual(553);
    expect(718 - d).toBeGreaterThanOrEqual(72);
  });
  it("a target taller than the free band shows its start just under the header", () => {
    const d = scrollDelta({ ...view, target: { top: 900, height: 1183 }, title: { top: 50 } });
    expect(900 - d).toBe(72 + 8);
  });
  it("returns 0 when already well placed (no jitter)", () => {
    expect(scrollDelta({ ...view, target: { top: 72 + (481 - 100) / 2 + 2, height: 100 }, title: null })).toBe(0);
  });
  it("ignores a title that sits below the target", () => {
    const d = scrollDelta({ ...view, target: { top: 300, height: 100 }, title: { top: 900 } });
    expect(300 - d).toBe(72 + (481 - 100) / 2);
  });
});

describe("clampRing", () => {
  it("keeps the ring inside the viewport and the free band", () => {
    const r = clampRing({ top: -51, left: -6, width: 402, height: 80 }, { vw: 390, topLimit: 8, bottomLimit: 553 });
    expect(r.left).toBeGreaterThanOrEqual(2);
    expect(r.left + r.width).toBeLessThanOrEqual(388);
    expect(r.top).toBeGreaterThanOrEqual(8);
  });
  it("cuts the ring of a very tall target at the free band", () => {
    const r = clampRing({ top: 80, left: 20, width: 300, height: 1183 }, { vw: 390, topLimit: 8, bottomLimit: 553 });
    expect(r.top + r.height).toBeLessThanOrEqual(553);
  });
  it("leaves a ring that already fits alone", () => {
    const b = { top: 100, left: 30, width: 200, height: 100 };
    expect(clampRing(b, { vw: 390, topLimit: 8, bottomLimit: 553 })).toEqual(b);
  });
});

describe("sheetTopOf", () => {
  it("uses the sheet's own top on phones and the viewport bottom otherwise", () => {
    expect(sheetTopOf(565, 844)).toBe(565);
    expect(sheetTopOf(null, 900)).toBe(900);
  });
});
