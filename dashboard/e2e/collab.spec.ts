import { expect, test } from "@playwright/test";
import { blockMapTiles, LIVE, LIVE_SKIP_REASON } from "./live";

// Team workspace on the recorded example. Locally the BFF talks to the in-memory collab server (COLLAB_FAKE=1); the deployed site uses the
// gateway's Firestore store. Reading is free of Qloo and Gemini calls; the write test creates data on the target site, so it is LIVE-only.
const BOARD = "/tours/board?showcase=1";
const LA = "/tours/playbook/5368361?showcase=1";

test.beforeEach(async ({ page }) => { await blockMapTiles(page); });

test("the board opens a private seeded workspace: status chips and ws= in the URL", async ({ page }) => {
  await page.goto(BOARD);
  await expect(page.getByTestId("city-row").first()).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/[?&]ws=[A-Za-z0-9_-]{10,64}(&|$)/, { timeout: 20_000 });
  const chips = page.getByTestId("status-chip");
  await expect(chips.first()).toBeVisible({ timeout: 20_000 });
  expect(await chips.count()).toBeGreaterThanOrEqual(1);
  for (const text of await chips.allInnerTexts()) expect(text).toMatch(/Considering|Confirmed|On hold|Dropped/);
  expect(new URL(page.url()).searchParams.get("showcase")).toBe("1"); // the share link keeps the example
});

test("two visitors never share a workspace", async ({ browser }) => {
  const ids: string[] = [];
  for (let i = 0; i < 2; i += 1) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await blockMapTiles(page);
    await page.goto(BOARD);
    await expect(page).toHaveURL(/[?&]ws=/, { timeout: 20_000 });
    ids.push(new URL(page.url()).searchParams.get("ws")!);
    await ctx.close();
  }
  expect(ids[0]).not.toBe(ids[1]);
});

test("the Notes sheet shows the demo banner over seeded notes from demo teammates", async ({ page }) => {
  await page.goto(LA);
  await expect(page).toHaveURL(/[?&]ws=/, { timeout: 20_000 });
  const notes = page.getByRole("button", { name: /^(City )?[Nn]otes for .*Los Angeles.*: \d+ notes?/ }).first();
  await expect(notes).toBeVisible({ timeout: 20_000 });
  await notes.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("demo-banner")).toContainText("Demo discussion between fictional teammates");
  await expect(sheet.getByText("Demo teammate").first()).toBeVisible();
  await expect(sheet.getByRole("textbox", { name: "Add a note" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

test.describe("writes", () => {
  test.skip(!LIVE, LIVE_SKIP_REASON);

  test("add a note with an identity, reload the same URL, the note persists", async ({ page }) => {
    const text = `E2E note ${Date.now()}`;
    await page.goto(LA);
    await expect(page).toHaveURL(/[?&]ws=/, { timeout: 30_000 });
    const url = page.url();
    const notes = page.getByRole("button", { name: /^(City )?[Nn]otes for .*Los Angeles.*: \d+ notes?/ }).first();
    await notes.click();
    await page.getByRole("textbox", { name: "Add a note" }).fill(text);
    await page.getByRole("button", { name: "Add note" }).click();
    // First write on this device: who is writing?
    const who = page.getByRole("dialog", { name: "Who's writing?" });
    if (await who.isVisible().catch(() => false)) {
      await who.getByLabel("Your name").fill("E2E Tester");
      await who.getByText("Promoter", { exact: true }).click();
      await who.getByRole("button", { name: "Save" }).click();
    }
    await expect(page.getByRole("list", { name: "Notes" }).getByText(text)).toBeVisible({ timeout: 20_000 });
    await page.reload();
    expect(page.url()).toBe(url); // same workspace
    await page.getByRole("button", { name: /^(City )?[Nn]otes for .*Los Angeles.*: \d+ notes?/ }).first().click();
    await expect(page.getByRole("list", { name: "Notes" }).getByText(text)).toBeVisible({ timeout: 20_000 });
  });
});
