import { expect } from "@playwright/test";
import { markTestTraffic, test } from "./fixtures";
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
    await markTestTraffic(ctx);
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

test("the seeded Best room override shows its team reason and Qloo's pick with its why", async ({ page }) => {
  await page.goto("/tours/playbook/5368361?showcase=1");
  const line = page.getByTestId("team-line").first();
  await expect(line).toContainText("Team value · Maya — Smaller room suits a presale night (team call)", { timeout: 20_000 });
  await expect(page.getByTestId("qloo-suggested").first()).toContainText(/Qloo suggested: .+ — venue fit \d\.\d\d, #1 of \d+ rooms/);
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
    // First write on this device: "Who's writing?" appears inline in the notes sheet (not a separate dialog).
    const who = page.getByTestId("inline-identity");
    if (await who.isVisible({ timeout: 3_000 }).catch(() => false)) {
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

test("Edit / Revert text lines up with the hero tile text at 1440", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(LA);
  const tiles = page.locator("[data-tour='advance-tiles'] > div");
  await expect(tiles.first()).toBeVisible({ timeout: 20_000 });
  for (const label of ["TOP ZONE", "BEST ROOM", "SUPPORT"]) {
    const tile = tiles.filter({ has: page.locator("dt", { hasText: label }) });
    await expect(tile.getByRole("button", { name: /^Edit / })).toBeVisible({ timeout: 20_000 });
    const [valueLeft, editLeft] = await tile.evaluate((el) => {
      const firstText = (root: Element) => {
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent ?? "").trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
        const n = w.nextNode()!; const r = document.createRange(); r.selectNodeContents(n); return r.getBoundingClientRect().left;
      };
      const dd = el.querySelector("dd")!;
      const edit = Array.from(dd.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Edit")!;
      const value = dd.querySelector("[data-testid='team-value']") ?? dd.firstElementChild!;
      return [firstText(value), firstText(edit)];
    });
    expect(Math.abs(editLeft! - valueLeft!), `${label}: Edit text ${editLeft} vs value ${valueLeft}`).toBeLessThanOrEqual(2);
  }
});
