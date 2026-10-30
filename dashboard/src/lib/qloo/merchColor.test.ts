import { describe, expect, it } from "vitest";
import { swatchFor } from "./merchColor";

describe("swatchFor", () => {
  it("reads a hex value in the name", () => {
    expect(swatchFor("Sun #FFAA00")).toBe("#ffaa00");
    expect(swatchFor("#abc")).toBe("#aabbcc");
  });
  it("knows the original palette names", () => {
    expect(swatchFor("Lilac")).toBe("#b9a3d9");
    expect(swatchFor("pitch green")).toBe("#009e5c");
  });
  it("finds a colour word inside a descriptive name", () => {
    expect(swatchFor("Washed Indigo")).toMatch(/^#[0-9a-f]{6}$/);
    expect(swatchFor("Faded Sand")).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("returns null when no colour can be read, so the UI shows plain text", () => {
    expect(swatchFor("Sun-bleached nostalgia")).toBeNull();
    expect(swatchFor("")).toBeNull();
  });
});
