import { expect, test } from "@playwright/test";
import { useSyntheticRecordings } from "./fixtures";

// Runs against the synthetic backtest, served at /api/recordings/backtest exactly as the real one is (complete state).
test.beforeEach(async ({ page }) => { await page.route(/tiles\.openfreemap\.org/, (route) => route.abort()); await useSyntheticRecordings(page); });

for (const width of [360, 1280]) {
  test(`proof page has no horizontal scroll and every source link fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const api: string[] = [];
    page.on("request", (r) => { const path = new URL(r.url()).pathname;
      // /api/campaigns is fetched by the app shell's CampaignProvider on every route; the page itself must call nothing else.
      if (path.startsWith("/api/") && path !== "/api/campaigns" && !path.startsWith("/api/recordings/")) api.push(path); });
    await page.goto("/proof");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Would it have found what the real tour used?");
    await expect(page.getByRole("heading", { name: "What this shows" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const boxes = await page.locator('a[href^="http"]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, h: r.height }; }));
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) { expect(b.l).toBeGreaterThanOrEqual(0); expect(b.r).toBeLessThanOrEqual(width); expect(b.h).toBeGreaterThanOrEqual(43.5); }
    expect(api).toEqual([]);
  });
}

test("board header links to proof", async ({ page }) => {
  await page.goto("/tours/board?showcase=1");
  await page.getByRole("link", { name: /How we tested it/ }).first().click();
  await expect(page).toHaveURL(/\/proof$/);
});
