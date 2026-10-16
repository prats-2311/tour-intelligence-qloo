import { expect, test } from "@playwright/test";

const noHorizontalScroll = async (page: import("@playwright/test").Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

for (const path of ["/", "/tours/board?sample=1", "/tours/board?sample=long", "/insights", "/campaign"]) {
  test(`no horizontal scroll at this viewport: ${path}`, async ({ page }) => {
    await page.goto(path);
    if (path.includes("sample")) await expect(page.getByTestId("city-row").first()).toBeVisible({ timeout: 15_000 });
    await noHorizontalScroll(page);
  });
}

test("no horizontal scroll at 360px with long names (Review Focus 4)", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/tours/board?sample=long");
  await expect(page.getByTestId("city-row").first()).toBeVisible({ timeout: 15_000 });
  await noHorizontalScroll(page);
});

test("touch targets are at least 44px on mobile", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile");
  await page.goto("/tours/board?sample=1");
  await expect(page.getByTestId("city-row").first()).toBeVisible({ timeout: 15_000 });
  // Ruling R-touch: every visible button/link/tab must be at least 44x44 (both dimensions).
  // Excludes visually hidden (sr-only) elements and MapLibre's own attribution/controls.
  const small = await page.evaluate(() => [...document.querySelectorAll("button, a, [role=tab]")]
    .filter((el) => !el.closest(".maplibregl-map"))
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ el, r }) => r.width > 1 && r.height > 1 && getComputedStyle(el).clip === "auto" && !/\bsr-only\b/.test(el.className))
    .filter(({ r }) => r.height < 43.5 || r.width < 43.5)
    .map(({ el, r }) => `${el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`));
  expect(small).toEqual([]);
});
