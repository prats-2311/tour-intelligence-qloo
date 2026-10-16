import { describe, expect, it } from "vitest";
import css from "../index.css?raw";

describe("design tokens (DESIGN.md)", () => {
  it.each([
    ["--color-bone", "#e9e4d6"], ["--color-verdict-play", "#0f9d8a"], ["--color-verdict-play-text", "#5fd3be"],
    ["--color-verdict-goldmine", "#ffcc00"], ["--color-verdict-goldmine-mark", "#b88a00"],
    ["--color-verdict-derisk", "#e8606f"], ["--color-verdict-derisk-text", "#ff9aa4"],
    ["--color-verdict-consider", "#5a86e8"], ["--color-verdict-consider-text", "#a8c0f4"],
    ["--color-verdict-skip", "#8b877c"], ["--color-verdict-skip-text", "#bdb8ab"],
    ["--color-heat-1", "#3a382f"], ["--color-heat-6", "#e9e4d6"],
    ["--color-state-error", "#fca5a5"], ["--color-state-error-bg", "#2a1615"], ["--color-state-stale", "#d9b45a"],
    ["--color-city-1", "#ff3d00"], ["--color-city-8", "#a39200"],
  ])("defines %s = %s", (token, hex) => {
    expect(css).toMatch(new RegExp(`${token}:\\s*${hex}`, "i"));
  });

  it("has no gradient-filled text (banned)", () => {
    expect(css).not.toMatch(/background-clip:\s*text/);
  });
  it("gold button is flat (no gradient, no glow)", () => {
    const btn = css.slice(css.indexOf(".btn-gold"), css.indexOf("}", css.indexOf(".btn-gold")));
    expect(btn).not.toMatch(/gradient/);
    expect(btn).not.toMatch(/box-shadow:[^;]*0 0 \d+px/);
  });
  it("no violet/indigo background wash on body", () => {
    expect(css).not.toMatch(/#7c4dff[^;]*radial-gradient|radial-gradient[^;]*#7c4dff/i);
  });
});
