import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => { await page.route(/tiles\.openfreemap\.org/, (route) => route.abort()); });

for (const width of [360, 1280]) {
  test(`proof page has no horizontal scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/proof");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Would it have found what the real tour used?");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("board header links to proof", async ({ page }) => {
  await page.goto("/tours/board?showcase=1");
  await page.getByRole("link", { name: /Checked against real tours/ }).first().click();
  await expect(page).toHaveURL(/\/proof$/);
});
