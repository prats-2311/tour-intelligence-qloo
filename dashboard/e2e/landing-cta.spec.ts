import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { blockMapTiles } from "./live";

// The two landing CTAs must look like a pair: same height, same top, one-line labels, nothing overflowing on a phone.
const SIZES = [
  { name: "1440", width: 1440, height: 900, desktop: true },
  { name: "2000", width: 2000, height: 1100, desktop: true },
  { name: "390", width: 390, height: 844, desktop: false },
];

for (const s of SIZES) {
  test(`landing CTAs are a matched pair at ${s.name}`, async ({ page }) => {
    await blockMapTiles(page);
    await page.setViewportSize({ width: s.width, height: s.height });
    await page.goto("/");
    const a = page.getByRole("link", { name: "See the example tour" });
    const b = page.getByRole("link", { name: "Try your own artist" });
    await expect(a).toBeVisible();
    await expect(b).toBeVisible();
    const ba = (await a.boundingBox())!;
    const bb = (await b.boundingBox())!;
    expect(Math.abs(ba.height - bb.height)).toBeLessThanOrEqual(1);
    for (const l of [a, b]) {
      const oneLine = await l.evaluate((el) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        return new Set(Array.from(r.getClientRects()).map((q) => Math.round(q.top))).size === 1;
      });
      expect(oneLine).toBe(true);
    }
    if (s.desktop) expect(Math.abs(ba.y - bb.y)).toBeLessThanOrEqual(1);
    else {
      expect(ba.width).toBeGreaterThan(s.width - 80);
      expect(bb.width).toBeGreaterThan(s.width - 80);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });
}
