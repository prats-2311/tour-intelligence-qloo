import { expect, test, type Page } from "@playwright/test";

// Runs must not depend on the network: map tile/style requests are blocked (the map shows its "tiles unavailable" note).
test.beforeEach(async ({ page }) => { await page.route(/tiles\.openfreemap\.org/, (route) => route.abort()); });

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

// The run is finished: all 10 rows, the summary line, and no Stop button.
const boardDone = async (page: Page) => {
  await expect(page.getByTestId("city-row")).toHaveCount(10, { timeout: 15_000 });
  await expect(page.getByText(/10 markets scored/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0);
};
const toInsights = async (page: Page) => {
  await page.getByRole("link", { name: /Insights/ }).first().click();
  await expect(page.getByTestId("boxscore-row")).toHaveCount(10);
};

// Ruling: every visible button/link/tab is at least 44x44. Excludes sr-only elements and MapLibre's own controls
// (.maplibregl-ctrl, attribution); city markers are checked.
const smallTargets = (page: Page) => page.evaluate(() => [...document.querySelectorAll("button, a, [role=tab]")]
  .filter((el) => !el.closest(".maplibregl-ctrl"))
  .map((el) => ({ el, r: el.getBoundingClientRect() }))
  .filter(({ el, r }) => r.width > 1 && r.height > 1 && getComputedStyle(el).clip === "auto" && !/\bsr-only\b/.test(el.className))
  .filter(({ r }) => r.height < 43.5 || r.width < 43.5)
  .map(({ el, r }) => `${el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`));

for (const path of ["/", "/tours/board?sample=1", "/tours/board?sample=long", "/insights", "/campaign"]) {
  test(`no horizontal scroll at this viewport: ${path}`, async ({ page }) => {
    await page.goto(path);
    if (path.includes("sample")) await boardDone(page);
    await noHorizontalScroll(page);
  });
}

test("no horizontal scroll at 360px with long names on every screen (Review Focus 4)", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/tours/board?sample=long");
  await boardDone(page);
  await expect(page.getByText("Santiago de Querétaro").first()).toBeVisible();
  await noHorizontalScroll(page);
  await page.getByTestId("city-row").getByText("Santiago de Querétaro").first().click();
  await expect(page.getByRole("dialog", { name: /Santiago de Querétaro/ })).toBeVisible();
  await noHorizontalScroll(page);
  await page.keyboard.press("Escape");
  await toInsights(page);
  await expect(page.getByTestId("boxscore-row").filter({ hasText: "Santiago de Querétaro" })).toHaveCount(1);
  await noHorizontalScroll(page);
});

test.describe("touch targets are at least 44x44 on mobile", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "mobile"));
  test("landing", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await smallTargets(page)).toEqual([]);
  });
  test("board", async ({ page }) => {
    await page.goto("/tours/board?sample=1");
    await boardDone(page);
    expect(await smallTargets(page)).toEqual([]);
  });
  test("insights after a sample run", async ({ page }) => {
    await page.goto("/tours/board?sample=1");
    await boardDone(page);
    await toInsights(page);
    expect(await smallTargets(page)).toEqual([]);
  });
});
