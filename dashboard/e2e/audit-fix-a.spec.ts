import { expect, type Page } from "@playwright/test";
import { test, dismissTourPrompt, useSyntheticRecordings } from "./fixtures";

// Audit A fixes (branch feat/audit-fix-a). Each test failed on the pre-fix code; see the commit messages for the failing lines.
test.beforeEach(async ({ page }) => { await page.route(/tiles\.openfreemap\.org/, (r) => r.abort()); await useSyntheticRecordings(page); await dismissTourPrompt(page); });

/** A working, in-memory team workspace whose snapshot carries statuses (so rows show status chips) and a little activity. */
async function workspaceWithStatuses(page: Page, statuses: Record<string, "confirmed" | "on_hold" | "considering" | "dropped">) {
  const at = Date.now() - 60_000;
  const snapshot = {
    ws: "e2eWorkspace0001", rev: 1, createdAt: at,
    statuses: Object.fromEntries(Object.entries(statuses).map(([id, status]) => [id, { status, name: "Dana", role: "Manager", at }])),
    threads: {}, overrides: {}, leads: {},
    activity: Object.entries(statuses).map(([id, status], i) => ({ id: `a${i}`, type: "status", cityId: id, name: "Dana", role: "Manager", text: status, at })),
  };
  await page.route("**/api/qloo/ws", (r) => r.fulfill({ json: { ws: snapshot.ws, snapshot } }));
  await page.route("**/api/qloo/ws/**", (r) => r.fulfill({ json: snapshot }));
}
const boardReady = async (page: Page) => {
  await expect(page.getByTestId("city-row")).toHaveCount(10, { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0, { timeout: 30_000 });
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
};

for (const width of [1440, 1280]) {
  test(`1. board city names with a status chip keep their width at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await workspaceWithStatuses(page, { "5368361": "confirmed", "4671654": "on_hold", "3530597": "confirmed" });
    await page.goto("/tours/board?sample=1&ws=e2eWorkspace0001");
    await boardReady(page);
    await expect(page.getByTestId("status-chip").first()).toBeVisible();
    const bad = await page.getByTestId("city-name-text").evaluateAll((els) => els.map((e) => {
      const r = e.getBoundingClientRect();
      const longestWord = Math.max(...(e.textContent ?? "").split(/\s+/).map((w) => w.length));
      const lineH = parseFloat(getComputedStyle(e).lineHeight) || 20;
      return { t: e.textContent, w: Math.round(r.width), lines: Math.round(r.height / lineH), longestWord };
    }).filter((x) => x.lines > 2 || x.w < x.longestWord * 6));
    expect(bad, "no city name is squeezed into a narrow column").toEqual([]);
  });
}
