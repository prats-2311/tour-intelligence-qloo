import { describe, expect, it } from "vitest";
import html from "../../index.html?raw";

describe("favicon cache-bust", () => {
  it("links a versioned icon so browsers that cached the old Vite bolt fetch the new mark", () => {
    expect(html).toMatch(/rel="icon"[^>]*href="\/favicon\.svg\?v=2"/);
    expect(html).toMatch(/rel="apple-touch-icon" href="\/apple-touch-icon\.png\?v=2"/);
  });
});
