import AxeBuilder from "@axe-core/playwright";
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
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("What we tested, and what held up");
    await expect(page.getByRole("heading", { name: "Earlier runs" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What this shows" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const boxes = await page.locator('a[href^="http"]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, h: r.height }; }));
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) { expect(b.l).toBeGreaterThanOrEqual(0); expect(b.r).toBeLessThanOrEqual(width); expect(b.h).toBeGreaterThanOrEqual(43.5); }
    expect(api).toEqual([]);
  });
}

for (const width of [375, 1280]) {
  test(`proof v3 sections render in order at ${width}px: tables scroll inside themselves, axe clean, zero Qloo calls`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const qloo: string[] = [];
    page.on("request", (r) => { const path = new URL(r.url()).pathname; if (path.startsWith("/api/qloo")) qloo.push(path); });
    await page.goto("/proof");
    await expect(page.getByText("We pre-registered every test before running it and publish all of it, including where Qloo-backed ranking lost.")).toBeVisible();
    const titles = await page.locator('[data-testid="proof-v3-test"] > h2').allTextContents();
    expect(titles.map((t) => t.split(":")[0])).toEqual(["Claim checker", "Test B", "Test C", "Test A"]);
    await expect(page.getByRole("link", { name: /protocol and its amendments/ })).toHaveAttribute("href", /github\.com\/prats-2311\/tour-intelligence-qloo\/blob\/master\/docs\/qloo\/proof-v3-protocol\.md$/);
    await page.locator("details > summary").first().click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const bad = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations;
    expect(bad.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    expect(qloo).toEqual([]);
    if (process.env.PROOF_SHOTS) await page.screenshot({ path: `${process.env.PROOF_SHOTS}/proof-${width}.png`, fullPage: true, clip: { x: 0, y: 0, width, height: 2600 } });
  });
}

test("board header links to proof", async ({ page }) => {
  await page.goto("/tours/board?showcase=1");
  await page.getByRole("link", { name: /How we tested it/ }).first().click();
  await expect(page).toHaveURL(/\/proof$/);
});
