import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { dismissTourPrompt, useSyntheticRecordings } from "./fixtures";

test.beforeEach(async ({ page }) => { await page.route(/tiles\.openfreemap\.org/, (route) => route.abort()); await useSyntheticRecordings(page); await dismissTourPrompt(page); });

test("tour budget: blank by default, example loaded fits the page, axe clean, no data calls (the team workspace probe is the app's own)", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (r) => { if (/\/api\//.test(r.url()) && !/recordings|\/api\/qloo\/ws/.test(r.url())) calls.push(r.url()); });
  await page.goto("/tours/budget?showcase=1");
  await expect(page.getByRole("heading", { name: "Tour budget", level: 1 })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("total-margin")).toHaveText("—");
  await page.getByRole("button", { name: "Load example (fictional figures)" }).click();
  await expect(page.getByText("Example budget with fictional figures — replace with your own.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  expect(calls).toEqual([]);
});
