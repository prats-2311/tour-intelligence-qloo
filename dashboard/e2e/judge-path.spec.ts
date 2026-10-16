import { expect, test } from "@playwright/test";

test("judge path: landing → showcase → board → why → insights", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Win their city." })).toBeVisible();
  await page.getByRole("link", { name: "Try the showcase tour" }).click();
  await expect(page.getByText("Sample data — illustrative, not Qloo output").first()).toBeVisible();
  await expect(page.getByTestId("city-row")).toHaveCount(10, { timeout: 15_000 });
  await expect(page.getByTestId("city-row").nth(2)).toContainText("Guadalajara");
  await expect(page.getByTestId("city-row").nth(2)).toContainText("Hidden goldmine");
  await page.getByRole("tab", { name: "Density-only" }).click();
  await expect(page.getByTestId("city-row").nth(5)).toContainText("Guadalajara");
  await page.getByRole("tab", { name: "Winnability" }).click();
  await page.getByTestId("city-row").nth(2).getByText("Guadalajara").click();
  await expect(page.getByRole("dialog", { name: /Guadalajara/ })).toContainText("0.5 × fan heat + 0.5 × activation");
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: /Insights/ }).first().click();
  await expect(page.getByTestId("boxscore-row")).toHaveCount(10);
  await page.screenshot({ path: `test-results/judge-path-${test.info().project.name}.png`, fullPage: true });
});
