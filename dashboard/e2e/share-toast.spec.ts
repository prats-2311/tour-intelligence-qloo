import { expect, test, type Page } from "@playwright/test";
import { blockMapTiles } from "./live";

// Clicking Share must confirm in a toast and move nothing: the first ranked row and the header row keep their boxes (±1px).
// Needs the built dashboard with the recorded showcase and the in-memory collab server (see dashboard/CLAUDE.md, "E2E").
const BOARD = "/tours/board?showcase=1";
const LA = "/tours/playbook/5368361?showcase=1";
const WIDTHS = [1280, 1440, 2000];

type Box = { x: number; y: number; width: number; height: number };
const box = async (page: Page, sel: string): Promise<Box> => {
  const b = await page.locator(sel).first().boundingBox();
  if (!b) throw new Error(`no box for ${sel}`);
  return b;
};
const same = (a: Box, b: Box, what: string) => {
  for (const k of ["x", "y", "width", "height"] as const) expect(Math.abs(a[k] - b[k]), `${what} ${k}: ${a[k]} -> ${b[k]}`).toBeLessThanOrEqual(1);
};
const share = async (page: Page) => {
  const direct = page.getByRole("button", { name: "Share with your team" });
  if (!(await direct.isVisible())) { await page.getByRole("button", { name: "Team", exact: true }).click(); await page.getByRole("menuitem", { name: "Share with your team" }).click(); }
  else await direct.click();
};

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await blockMapTiles(page);
});

for (const width of WIDTHS) {
  test(`Tour Board at ${width}px: Share toasts and shifts nothing`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(BOARD);
    const row = page.getByTestId("city-row").first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("status-chip").first()).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/[?&]ws=/, { timeout: 20_000 });
    await page.waitForTimeout(500);
    const rowSel = '[data-testid="city-row"]', headSel = '[data-tour="board-header"]';
    const rowBefore = await box(page, rowSel), headBefore = await box(page, headSel);
    const barBefore = await box(page, '[data-testid="team-bar"]');
    await share(page);
    const toast = page.locator("[data-toast-viewport] [role=status]").filter({ hasText: "Link copied" });
    await expect(toast).toBeVisible();
    await expect(toast).toContainText("Don't post contracts, fees or personal details.");
    await page.waitForTimeout(400);
    same(rowBefore, await box(page, rowSel), "first city row");
    same(headBefore, await box(page, headSel), "header row");
    same(barBefore, await box(page, '[data-testid="team-bar"]'), "team bar");
    await expect(page.locator(headSel).getByRole("status")).toHaveCount(0); // nothing inline in the header
    if (width >= 1280) {
      // one row: every control in the header's action row sits on the same line
      const ys = await page.locator(`${headSel} button:visible, ${headSel} a:visible`).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      expect(new Set(ys.filter((y) => y > headBefore.y + 60)).size, "header controls on one row").toBeLessThanOrEqual(2);
    }
    // the toast sits at the bottom centre of the viewport
    const t = await toast.boundingBox();
    expect(Math.abs(t!.x + t!.width / 2 - width / 2)).toBeLessThanOrEqual(2);
    expect(t!.y + t!.height).toBeLessThanOrEqual(900);
    // it goes away by itself
    await expect(toast).toHaveCount(0, { timeout: 8_000 });
  });

  test(`LA playbook at ${width}px: Share toasts and shifts nothing`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(LA);
    await expect(page.getByTestId("status-picker")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("team-bar")).toBeVisible();
    await page.waitForTimeout(800);
    const sels = ["main h1", '[data-testid="status-picker"]', '[data-testid="team-bar"]', "main [data-card]"];
    const before = [];
    for (const s of sels) before.push(await box(page, s));
    await share(page);
    await expect(page.locator("[data-toast-viewport] [role=status]").filter({ hasText: "Link copied" })).toBeVisible();
    await page.waitForTimeout(400);
    for (const [i, s] of sels.entries()) same(before[i]!, await box(page, s), s);
    await expect(page.getByTestId("team-bar").getByRole("status")).toHaveCount(0);
  });
}

test("a blocked clipboard shows an error toast with the link to select, and still shifts nothing", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("denied")) }, configurable: true }); });
  await page.goto(BOARD);
  await expect(page.getByTestId("city-row").first()).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/[?&]ws=/, { timeout: 20_000 });
  await page.waitForTimeout(500);
  const before = await box(page, '[data-testid="city-row"]');
  await share(page);
  const alert = page.locator("[data-toast-viewport] [role=alert]");
  await expect(alert).toBeVisible();
  await expect(alert.getByLabel("Text to copy")).toHaveValue(/ws=/);
  same(before, await box(page, '[data-testid="city-row"]'), "first city row");
});
