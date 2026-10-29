import { describe, expect, it } from "vitest";
import tourBookSrc from "../../pages/TourBook.tsx?raw";

describe("Tour Book", () => {
  it("has no Save as campaign control", () => {
    expect(tourBookSrc).not.toMatch(/Save as campaign/i);
    expect(tourBookSrc).not.toMatch(/SaveAsCampaign/);
  });
});
