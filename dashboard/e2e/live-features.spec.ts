import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { blockMapTiles, LIVE, LIVE_SKIP_REASON } from "./live";

// LIVE only: these use the deployed gateway's real Qloo, Open-Meteo/Nager and Gemini calls on the recorded Los Angeles example, so they spend
// quota and are skipped unless LIVE=1. Run against a deployed site, never in the default local run:
//   E2E_BASE_URL=https://tour-intel-qloo-602700957663.us-central1.run.app LIVE=1 npx playwright test e2e/live-features.spec.ts
test.skip(!LIVE, LIVE_SKIP_REASON);
test.setTimeout(120_000);

const LA = "/tours/playbook/5368361?showcase=1";

test.beforeEach(async ({ page }) => { await blockMapTiles(page); });

const playbookReady = async (page: import("@playwright/test").Page) => {
  await expect(page.getByRole("heading", { name: "Los Angeles" }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/\d+ verified · \d+ removed/).first()).toBeVisible({ timeout: 30_000 });
};

test("Sponsors by age group: at least one band, headed as a signed index vs the average audience, never a percent", async ({ page }) => {
  await page.goto(LA);
  await playbookReady(page);
  const card = page.locator("[data-tour='card-sponsors']");
  await card.getByRole("button", { name: "By age group" }).click();
  const bands = page.getByTestId("segment-band");
  await expect(bands.first()).toBeVisible({ timeout: 90_000 }); // Qloo demographics, then one recommend call per band
  expect(await bands.count()).toBeGreaterThanOrEqual(1);
  const headers = await page.getByTestId("segment-header").allInnerTexts();
  expect(headers.length).toBeGreaterThanOrEqual(1);
  for (const h of headers) {
    expect(h).toContain("vs the average audience");
    expect(h).not.toContain("%");
  }
  for (const text of await bands.allInnerTexts()) expect(text).not.toContain("%");
});

test("Advance & risks: the weather section says it is not a forecast", async ({ page }) => {
  await page.goto(LA);
  await playbookReady(page);
  await page.getByRole("tab", { name: "Advance & risks" }).click();
  await expect(page.getByText(/not a forecast/i).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Daytime highs average/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open-Meteo historical archive" })).toBeVisible();
});

test("Ask live: one strategist question returns an answer with a work log", async ({ page }) => {
  await page.goto(LA);
  await playbookReady(page);
  await page.locator("[data-tour='ask']:visible").first().click();
  const live = page.getByText("Ask live", { exact: true });
  await expect(live).toBeVisible({ timeout: 15_000 });
  const question = page.getByText("Ask live", { exact: true }).locator("xpath=following-sibling::*[1]").getByRole("button").first();
  const asked = (await question.innerText()).trim();
  expect(asked.length).toBeGreaterThan(5);
  await question.click();
  // A live turn: up to 4 model rounds and 6 Qloo calls. It ends with a Work log (reasoning summary and one line per call) above the answer.
  const log = page.getByRole("button", { name: "Work log" }).first();
  await expect(log).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/UNAVAILABLE|CAPPED/)).toHaveCount(0);
  if ((await log.getAttribute("aria-expanded")) !== "true") await log.click();
  await expect(log).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(`#${await log.getAttribute("aria-controls")}`)).not.toBeEmpty();
  await expect(page.getByText(asked).first()).toBeVisible(); // the question stays on screen above its answer
});
