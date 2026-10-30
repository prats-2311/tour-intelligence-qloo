import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { test, dismissTourPrompt } from "./fixtures";
import { blockMapTiles } from "./live";

// Audit C: sidebar reach on short desktops, mobile shell, /proof headline and tables, /v2 controls. Recording-backed: run against a built dashboard
// (see dashboard/CLAUDE.md); the recording is whatever the server serves.
test.beforeEach(async ({ page }) => { await blockMapTiles(page); await dismissTourPrompt(page); });

const BOARD = "/tours/board?showcase=1";

for (const vp of [{ w: 1280, h: 800 }, { w: 1440, h: 900 }]) {
  test(`sidebar at ${vp.w}x${vp.h}: the toggle is pinned at the top and every nav item is reachable by scrolling the rail`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto(BOARD);
    const rail = page.locator("aside[aria-label='Site sections']");
    await expect(rail).toBeVisible({ timeout: 20_000 });
    const toggle = rail.getByRole("button", { name: /(Collapse|Expand) sidebar/ });
    for (const collapsed of [false, true]) {
      if (collapsed) await toggle.click();
      expect(await rail.evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
      // The toggle is visible before any scrolling, and stays visible after scrolling the rail to its end.
      await expect(toggle).toBeInViewport();
      await rail.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await expect(toggle).toBeInViewport();
      const items = rail.locator("nav[aria-label='Sections'] a[href], nav[aria-label='Sections'] button");
      const n = await items.count();
      expect(n).toBeGreaterThan(8);
      for (let i = 0; i < n; i += 1) {
        const item = items.nth(i);
        await item.scrollIntoViewIfNeeded();
        await expect(item, `item ${i} reachable (collapsed=${collapsed})`).toBeInViewport();
        const covered = await item.evaluate((el) => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !(hit && (el === hit || el.contains(hit))); });
        expect(covered, `item ${i} not covered by the toggle row`).toBe(false);
      }
      await rail.evaluate((el) => { el.scrollTop = 0; });
    }
  });
}

test("collapsed rail items show an accessible tooltip on hover and on keyboard focus", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BOARD);
  const rail = page.locator("aside[aria-label='Site sections']");
  await expect(rail).toBeVisible({ timeout: 20_000 });
  if ((await rail.getAttribute("data-collapsed")) !== "true") await rail.getByRole("button", { name: /Collapse sidebar/ }).click();
  const link = rail.getByRole("link", { name: "Tour Book" });
  await link.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Tour Book");
  const box = await page.getByRole("tooltip").boundingBox();
  const lb = (await link.boundingBox())!;
  expect(box!.x).toBeGreaterThanOrEqual(lb.x + lb.width); // beside the rail, not clipped inside it
  await page.mouse.move(700, 400);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await link.focus();
  await expect(page.getByRole("tooltip")).toHaveText("Tour Book");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("390px: the landing page has the hamburger, and the drawer's last row is reachable with a scroll hint", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const burger = page.getByRole("button", { name: "Open navigation" });
  await expect(burger).toBeVisible({ timeout: 20_000 });
  await burger.click();
  const dlg = page.getByRole("dialog", { name: "Site navigation" });
  await expect(dlg.getByRole("button", { name: /^The essentials/ })).toBeVisible();
  const scrollable = await dlg.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
  if (scrollable) await expect(page.getByTestId("drawer-scroll-hint")).toBeVisible();
  const last = dlg.locator("nav[aria-label='Sections'] a, nav[aria-label='Sections'] button").last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  await expect(page.getByTestId("drawer-scroll-hint")).toHaveCount(0);
});

test("breadcrumb lines up with the content column at 2000px", async ({ page }) => {
  await page.setViewportSize({ width: 2000, height: 1100 });
  await page.goto("/proof");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
  const crumb = (await page.locator("nav[aria-label='Breadcrumb'] ol").boundingBox())!;
  const h1 = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
  expect(Math.abs(crumb.x - h1.x)).toBeLessThanOrEqual(2);
});

test("/proof opens with the At a glance scoreboard computed from the data, tests in scoreboard, checkers, tests order", async ({ page }) => {
  await page.goto("/proof");
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toBeVisible({ timeout: 20_000 });
  const board = page.getByRole("region", { name: "At a glance" });
  await expect(board).toBeVisible();
  await expect(board.getByRole("heading", { name: "Where Qloo wins" })).toBeVisible();
  await expect(board.getByRole("heading", { name: "Where a plain LLM wins" })).toBeVisible();
  await expect(board).toContainText("Qloo adds taste data an LLM can't produce or verify");
  // Every scoreboard link lands on a section that exists.
  const hrefs = await board.locator("a[href^='#']").evaluateAll((els) => els.map((e) => e.getAttribute("href")!));
  expect(hrefs.length).toBeGreaterThanOrEqual(2);
  for (const h of hrefs) await expect(page.locator(h)).toHaveCount(1);
  const y = async (loc: ReturnType<typeof page.locator>) => (await loc.first().boundingBox())!.y;
  const h1y = await y(h1), boardY = await y(board);
  expect(boardY).toBeGreaterThan(h1y);
  expect(boardY - h1y).toBeLessThan(400); // directly under the title
  const tests = await page.locator('[data-testid="proof-v3-test"] > h2').allTextContents();
  expect(tests[0]).toMatch(/^Claim checker/);
  // Collapsed by default: per-case lists live behind disclosures.
  await expect(page.getByText("How to read this")).toBeVisible();
  expect(await page.locator("details[open]").count()).toBe(0);
  expect(await page.getByText("Limits: where Qloo-backed ranking lost").count()).toBe(0);
});

test("/proof at 390px: tables scroll inside a focusable region with a visible cue; the live panel sits below the scoreboard", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Analytics on: the live panel must sit below the scoreboard, not above the title.
  await page.route("**/api/qloo/stats/trust", (r) => r.fulfill({ json: { enabled: true, since: "2026-10-30T00:00:00.000Z", playbooks: 3, narratedPlaybooks: 2, bySource: { live: 2, mcp_public: 1 }, claimsChecked: 40, claimsRemoved: 2, removedRate: 0.05, medianLatencyMs: 9000, sponsorsHidden: 1, cities: 3, last24h: { playbooks: 1, claimsChecked: 10 } } }));
  await page.route("**/api/qloo/stats/team", (r) => r.fulfill({ json: { enabled: false } }));
  await page.goto("/proof");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
  const regions = page.locator("[role='region'][tabindex='0'][aria-label$='scrolls sideways']");
  expect(await regions.count()).toBeGreaterThan(3);
  const overflowing = regions.filter({ has: page.locator("table") });
  const n = await overflowing.count();
  let cues = 0;
  for (let i = 0; i < n; i += 1) {
    const r = overflowing.nth(i);
    if ((await r.locator("xpath=ancestor::details[not(@open)]").count()) > 0) continue; // inside a closed disclosure
    const over = await r.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    if (over) { cues += 1; await expect(r.locator("xpath=..").getByTestId("scroll-cue")).toBeVisible(); }
  }
  expect(cues).toBeGreaterThan(0);
  const live = page.getByTestId("live-stats");
  await expect(live).toBeVisible({ timeout: 15_000 });
  const boardBox = (await page.getByRole("region", { name: "At a glance" }).boundingBox())!;
  const liveBox = (await live.boundingBox())!;
  expect(liveBox.y).toBeGreaterThan(boardBox.y + boardBox.height - 1);
  const bad = (await new AxeBuilder({ page }).withRules(["scrollable-region-focusable", "empty-table-header"]).analyze()).violations;
  expect(bad.map((v) => v.id)).toEqual([]);
});

test("/v2 at 390px: RSVP buttons are 44px and look disabled when off, and opening a lower accordion item keeps its header put", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/v2");
  await expect(page.getByRole("heading", { level: 1, name: "Taste Loop: the next version" })).toBeVisible({ timeout: 20_000 });
  const rsvp = page.locator("[data-tour='v2-rsvp']");
  const off = (await rsvp.getByText(/^Mock — not live$/).count()) > 0;
  if (off) {
    await expect(rsvp).toContainText("Prototype buttons switch on when analytics is enabled");
    for (const name of ["Going", "Waitlist", "I was there"]) {
      const b = rsvp.getByRole("button", { name });
      await expect(b).toHaveAttribute("aria-disabled", "true");
      expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
      expect(await b.evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth))).toBeGreaterThan(0);
    }
  }
  const items = page.locator("[data-tour='v2-experiences'] h3 button");
  expect(await items.count()).toBeGreaterThan(3);
  const target = items.nth(3);
  await target.scrollIntoViewIfNeeded();
  const before = (await target.boundingBox())!.y;
  await target.click();
  await page.waitForTimeout(150);
  const after = (await target.boundingBox())!.y;
  expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
  await expect(items.first()).toHaveAttribute("aria-expanded", "true");
});

test("/agents and /v2 have no unfocusable scrollable regions (axe)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/agents", "/v2"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
    const bad = (await new AxeBuilder({ page }).withRules(["scrollable-region-focusable", "empty-table-header"]).analyze()).violations;
    expect(bad.map((v) => `${path} ${v.id}`)).toEqual([]);
  }
});

test("no console errors from the stats calls on /proof and /v2 when analytics are off", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && !/WebGL|tiles/i.test(m.text())) errors.push(m.text()); });
  for (const path of ["/proof", "/v2"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(800);
  }
  expect(errors.filter((e) => /503|Failed to load resource/.test(e))).toEqual([]);
});
