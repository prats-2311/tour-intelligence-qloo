import { describe, expect, it } from "vitest";
import { OVERRIDE_LINK } from "./Overrides";

describe("override Edit / Revert buttons", () => {
  it("start-align the text inside the 44px hit area so it lines up with the tile text", () => {
    expect(OVERRIDE_LINK).toMatch(/\bjustify-start\b/);
    expect(OVERRIDE_LINK).not.toMatch(/\bjustify-center\b/);
    expect(OVERRIDE_LINK).toMatch(/\bmin-h-11\b/);
    expect(OVERRIDE_LINK).toMatch(/\bmin-w-11\b/);
  });
});
