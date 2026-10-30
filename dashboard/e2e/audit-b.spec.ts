import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";
import { blockMapTiles } from "./live";

// Audit B fixes on the recorded Los Angeles playbook (zero live calls). Needs the built or dev server with RECORDINGS_DIR (see dashboard/CLAUDE.md).
const LA = "/tours/playbook/5368361?showcase=1";
test.beforeEach(async ({ page }) => { await blockMapTiles(page); });

async function loaded(page: Page) {
  await expect(page.getByRole("heading", { name: "Los Angeles" }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/\d+ verified · \d+ removed/).first()).toBeVisible({ timeout: 20_000 });
}
async function openChat(page: Page) {
  await page.locator('button[aria-label="Ask about this tour"], button:has-text("Ask about this tour"), button:has-text("Strategist")').first().click();
  await expect(page.getByLabel("Ask a question about this tour")).toBeVisible();
}

for (const [w, h, min] of [[1280, 800, 300], [1440, 900, 300], [390, 844, 240]] as const) {
  test(`1 chat: recorded answer gets a readable area at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(LA);
    await loaded(page);
    await openChat(page);
    const chip = page.locator("section[aria-label='Strategist'] button").filter({ hasText: /\?/ }).first();
    await chip.click();
    await expect(page.locator("section[aria-label='Strategist'] [data-answer]").first()).toBeVisible({ timeout: 15_000 });
    const list = page.locator("section[aria-label='Strategist'] ol[aria-live]").first();
    const box = await list.boundingBox();
    expect(box!.height, "answer list height").toBeGreaterThanOrEqual(min);
    // Suggestions collapsed after the first answer.
    await expect(page.getByRole("button", { name: /Suggestions/ })).toHaveAttribute("aria-expanded", "false");
  });
}

test("2 chat error: plain language, readable at 390, with Retry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(LA);
  await loaded(page);
  await openChat(page);
  await page.route("**/api/qloo/**/strategist", (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Qloo gateway not configured" }) }));
  await page.getByLabel("Ask a question about this tour").fill("A free text live question");
  await page.getByRole("button", { name: "Send" }).click();
  const msg = page.getByText("The live strategist isn't available right now. Recorded answers still work.");
  await expect(msg).toBeVisible();
  await expect(page.locator("body")).not.toContainText("gateway not configured");
  const b = await msg.boundingBox();
  expect(b!.height).toBeGreaterThan(15);
  expect(b!.x).toBeGreaterThanOrEqual(0);
  expect(b!.x + b!.width).toBeLessThanOrEqual(390);
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});
