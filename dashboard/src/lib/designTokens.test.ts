import { describe, expect, it } from "vitest";
import css from "../index.css?raw";

// Body block as it was before Task 2 (violet stage wash + two gradients).
const PRE_TASK_BODY = `body {
  background:
    radial-gradient(1100px 520px at 82% -12%, rgba(255, 204, 0, 0.07), transparent 60%),
    radial-gradient(950px 540px at -8% 108%, rgba(124, 77, 255, 0.06), transparent 55%),
    var(--color-canvas);
}`;

function rules(src: string): { selector: string; body: string }[] {
  return [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
}

function btnGoldViolations(src: string): string[] {
  return rules(src)
    .filter((r) => r.selector.includes(".btn-gold"))
    .flatMap((r) => [
      ...(/gradient/.test(r.body) ? [`${r.selector}: gradient`] : []),
      ...(/box-shadow:[^;]*0 0 \d+px/.test(r.body) ? [`${r.selector}: glow`] : []),
    ]);
}

function bodyWashViolations(src: string): string[] {
  const body = rules(src).find((r) => r.selector === "body")?.body ?? "";
  const out: string[] = [];
  if (/124,\s*77,\s*255|#7c4dff|indigo|violet/i.test(body)) out.push("violet/indigo in body");
  const n = (body.match(/radial-gradient/g) ?? []).length;
  if (n !== 1) out.push(`expected 1 radial-gradient, got ${n}`);
  return out;
}

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
  it("gold button is flat in every .btn-gold rule", () => {
    expect(btnGoldViolations(css)).toEqual([]);
  });
  it("body has only the gold house-light wash (no violet/indigo)", () => {
    expect(bodyWashViolations(css)).toEqual([]);
  });
  it("guards fail on bad CSS", () => {
    expect(bodyWashViolations(PRE_TASK_BODY).length).toBeGreaterThan(0);
    expect(btnGoldViolations(".btn-gold:hover:not(:disabled) { box-shadow: 0 2px 10px rgba(255,204,0,.3), 0 0 12px gold; }").length).toBeGreaterThan(0);
    expect(btnGoldViolations(".btn-gold { } .btn-gold:active { background-image: linear-gradient(red, blue); }").length).toBeGreaterThan(0);
  });
});
