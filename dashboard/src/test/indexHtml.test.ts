import { describe, expect, it } from "vitest";
import html from "../../index.html?raw";

describe("index.html", () => {
  it("has the product title", () => {
    expect(html).toMatch(/<title>Win their city · Tour Intelligence × Qloo<\/title>/);
  });
  it("has no legacy name and no committed origin-trial meta", () => {
    expect(html).not.toContain("Nova Horizon");
    expect(html).not.toMatch(/<meta[^>]*http-equiv="origin-trial"/);
  });
});
