import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("favicon cache-bust", () => {
  it("links a versioned icon so browsers that cached the old Vite bolt fetch the new mark", () => {
    const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
    expect(html).toMatch(/rel="icon"[^>]*href="\/favicon\.svg\?v=2"/);
    expect(html).toMatch(/rel="apple-touch-icon" href="\/apple-touch-icon\.png\?v=2"/);
  });
});
