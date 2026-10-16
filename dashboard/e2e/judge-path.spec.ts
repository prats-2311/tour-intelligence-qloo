import { expect, test } from "@playwright/test";

// Runs must not depend on the network: map tile/style requests are blocked (the map shows its "tiles unavailable" note).
test.beforeEach(async ({ page }) => { await page.route(/tiles\.openfreemap\.org/, (route) => route.abort()); });

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
  await expect(page).toHaveURL(/\/tours\/playbook\/4005539\?sample=1/);
  await expect(page.getByText(/\d+ verified · \d+ removed/).first()).toBeVisible({ timeout: 15_000 }); // stream finished
  await page.getByRole("button", { name: "Why this score?" }).first().click();
  await expect(page.getByRole("dialog", { name: /Guadalajara/ })).toContainText("0.5 × fan heat + 0.5 × activation");
  await page.keyboard.press("Escape");
  await page.goBack();
  await page.getByRole("link", { name: /Insights/ }).first().click();
  await expect(page.getByTestId("boxscore-row")).toHaveCount(10);
  await page.screenshot({ path: `test-results/judge-path-${test.info().project.name}.png`, fullPage: true });
});

test("showcase → Guadalajara playbook → Build tour → Book", async ({ page }) => {
  await page.goto("/");
  const t0 = Date.now();
  await page.getByRole("link", { name: "Try the showcase tour" }).click();
  await expect(page.getByText("Sample data — illustrative, not Qloo output").first()).toBeVisible();
  // Scoped to the board rows: map markers carry the same "Guadalajara, Hidden goldmine" name and come first in the DOM.
  await expect(page.getByTestId("city-row")).toHaveCount(10, { timeout: 15_000 });
  await page.getByTestId("city-row").getByRole("button", { name: /^Guadalajara/ }).click();
  await expect(page.getByRole("heading", { name: "Guadalajara" })).toBeVisible();
  await expect(page.getByText("7 verified · 2 removed").first()).toBeVisible();
  await expect(page.getByText("Cerro Alto Mezcal is the strongest sponsor fit at 0.91.")).toBeVisible();
  await page.getByRole("button", { name: "2 verified · 1 removed" }).click();
  await expect(page.getByText("Number 0.93 not in evidence")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goBack();
  await page.getByRole("button", { name: "Build tour" }).click();
  await page.getByRole("link", { name: "Open Tour Book" }).click();
  await expect(page.getByRole("heading", { name: "Market selection" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Curitiba", level: 2 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(120_000); // spec §7.1: judge path in two minutes
  await page.screenshot({ path: `test-results/judge-path-book-${test.info().project.name}.png`, fullPage: true });
});

test("strategist answers a suggested question with tool chips in the showcase", async ({ page }) => {
  await page.goto("/tours/board?sample=1");
  const open = page.getByRole("button", { name: /Ask the strategist|Strategist/ }).first();
  await open.click();
  await page.getByRole("button", { name: "Why is Guadalajara a hidden goldmine?" }).click();
  await expect(page.getByText(/Hidden goldmine verdict means/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Playbook/ })).toBeVisible();
});

test("Without Qloo shows the generic list with the banner and no verdicts", async ({ page }) => {
  await page.goto("/tours/board?sample=1");
  await page.getByRole("tab", { name: "Without Qloo" }).click();
  await expect(page.getByText("Generic LLM answer — no taste evidence")).toBeVisible();
  await expect(page.getByRole("list", { name: "Generic ranking" }).getByText("Hidden goldmine")).toHaveCount(0);
});
