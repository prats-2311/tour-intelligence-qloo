import { expect, test } from "@playwright/test";
import { qlooDataCalls, dismissTourPrompt, useSyntheticRecordings } from "./fixtures";

// Runs must not depend on the network: map tile/style requests are blocked (the map shows its "tiles unavailable" note).
test.beforeEach(async ({ page }) => { await page.route(/tiles\.openfreemap\.org/, (route) => route.abort()); await useSyntheticRecordings(page); await dismissTourPrompt(page); });

test("judge path: landing → showcase → board → why → taste", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Know which brands your artist's fans love in each city, before the sponsor meeting." })).toBeVisible();
  await page.goto("/tours/board?sample=1"); // the Lumen Vale sample: its cities are asserted below
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
  await page.getByRole("link", { name: /Taste/ }).first().click();
  await expect(page.getByTestId("boxscore-row")).toHaveCount(10);
  await page.screenshot({ path: `test-results/judge-path-${test.info().project.name}.png`, fullPage: true });
});

test("showcase → Guadalajara playbook → Review shortlist → Book", async ({ page }) => {
  const t0 = Date.now();
  await page.goto("/tours/board?sample=1"); // the Lumen Vale sample: its cities are asserted below
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
  await page.getByRole("button", { name: "Review shortlist" }).click();
  await page.getByRole("link", { name: "Open Tour Book" }).click();
  await expect(page.getByRole("heading", { name: "Market selection" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Curitiba", level: 2 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(120_000); // spec §7.1: judge path in two minutes
  await page.screenshot({ path: `test-results/judge-path-book-${test.info().project.name}.png`, fullPage: true });
});

test("strategist answers a suggested question with tool chips in the showcase", async ({ page }) => {
  await page.goto("/tours/board?sample=1");
  const open = page.getByRole("button", { name: /Ask about this tour/ }).first();
  await open.click();
  await page.getByRole("button", { name: "Why is Guadalajara a hidden goldmine?" }).click();
  await expect(page.getByText(/Hidden goldmine verdict means/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Playbook/ })).toBeVisible();
});

test("Without Qloo shows the generic list with the banner and no verdicts", async ({ page }) => {
  await page.goto("/tours/board?sample=1");
  await page.getByRole("tab", { name: "Without Qloo" }).click();
  await expect(page.getByText("Generic LLM answer — no taste evidence")).toBeVisible();
  await expect(page.getByRole("list", { name: "Generic ranking" })).toBeVisible();
  // Since a81e699 ("Without Qloo compares the LLM's order with Qloo's verdicts") each generic row carries Qloo's verdict as a comparison badge.
  // The generic answer itself still has none: outside the Generic ranking list (page-wide) there is no verdict label, and no map legend anywhere.
  for (const label of ["Play", "Hidden goldmine", "De-risk", "Consider", "Skip", "Not enough data"]) {
    const outside = await page.getByText(label, { exact: true }).evaluateAll((els) => els.filter((e) => !e.closest('[aria-label="Generic ranking"]')).length);
    expect(outside, `verdict label "${label}" outside the comparison list`).toBe(0);
  }
  await expect(page.getByLabel("Map legend")).toHaveCount(0);
});

// Placeholder recording (Lumen Vale) until the real one is committed: the banner is then the sample text, otherwise the recorded label.
const SHOWCASE_BANNER = /Sample data — illustrative, not Qloo output|Recorded Qloo run · \d{4}-\d{2}-\d{2} — not live/;

test("showcase mode replays the recording with zero gateway calls", async ({ page }) => {
  const api: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/api/qloo/")) api.push(r.url()); });
  await page.goto("/");
  await page.getByRole("link", { name: "See the example tour" }).click();
  await expect(page).toHaveURL(/\/tours\/board\?showcase=1/);
  await expect(page.getByText(SHOWCASE_BANNER).first()).toBeVisible();
  await expect(page.getByTestId("city-row").first()).toBeVisible({ timeout: 15_000 });
  expect(await page.getByTestId("city-row").count()).toBeGreaterThan(0);
  await page.getByTestId("city-row").first().getByRole("button").first().click();
  await expect(page).toHaveURL(/\/tours\/playbook\/[^?]+\?showcase=1/);
  await expect(page.getByText(SHOWCASE_BANNER).first()).toBeVisible();
  const open = page.getByRole("button", { name: /Ask about this tour/ }).first();
  await open.click();
  await page.getByRole("button", { name: "Why does Los Angeles rank above São Paulo here?" }).click();
  await expect(page.getByText(/Invented test answer/)).toBeVisible();
  expect(qlooDataCalls(api), "no Qloo, Gemini or Tavily call (team workspace calls are allowed)").toEqual([]);
});
