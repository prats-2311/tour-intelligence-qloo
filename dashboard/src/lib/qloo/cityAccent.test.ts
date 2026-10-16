import { describe, expect, it } from "vitest";
import { accentFor, NEUTRAL_ACCENT, SAMPLE_ACCENT_ORDER } from "./cityAccent";

describe("accentFor", () => {
  it("matches DESIGN §2.6 showcase assignments", () => {
    expect(accentFor("3530597", SAMPLE_ACCENT_ORDER)).toBe("#ff3d00");
    expect(accentFor("4005539", SAMPLE_ACCENT_ORDER)).toBe("#ff00aa");
    expect(accentFor("3464975", SAMPLE_ACCENT_ORDER)).toBe("#00a0b0");
  });
  it("folds a 9th city and unknown ids to neutral", () => {
    expect(accentFor("x9", [...SAMPLE_ACCENT_ORDER, "x9"])).toBe(NEUTRAL_ACCENT);
    expect(accentFor("missing", SAMPLE_ACCENT_ORDER)).toBe(NEUTRAL_ACCENT);
  });
});
