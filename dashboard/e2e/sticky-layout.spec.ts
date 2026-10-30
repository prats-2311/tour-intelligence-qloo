import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { blockMapTiles } from "./live";

// Sticky chrome must never cover content: the Notes composer under the last note, and the playbook tab bar over a card an anchor jumped to.
// Recorded Los Angeles playbook with the seeded team workspace (needs the built server with RECORDINGS_DIR, see dashboard/CLAUDE.md).
const LA = "/tours/playbook/5368361?showcase=1";
test.beforeEach(async ({ page }) => { await blockMapTiles(page); });

async function stable(page: import("@playwright/test").Page) {
  let last = -1, same = 0;
  for (let i = 0; i < 40 && same < 4; i++) {
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    same = h === last ? same + 1 : 0; last = h;
    await page.waitForTimeout(250);
  }
}

for (const [w, h] of [[1500, 1000], [390, 844]] as const) {
  test(`notes sheet at ${w}x${h}: the last note sits fully above the composer when scrolled to the end`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(LA);
    await expect(page.getByText(/\d+ verified · \d+ removed/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/[?&]ws=/, { timeout: 20_000 });
    const notes = page.getByRole("button", { name: /^Notes for Sponsors.*: [1-9]\d* notes?/ }).first();
    await notes.scrollIntoViewIfNeeded();
    await notes.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("textbox", { name: "Add a note" })).toBeVisible();
    // Scrolls the thread (and any scrolling ancestor) to its end, then measures the last note against the composer.
    const measure = (toEnd = true) => dialog.evaluate((el, toEnd) => {
      const list = el.querySelector("ul[aria-label='Notes']")!;
      if (toEnd) for (let n: Element | null = list; n; n = n === el ? null : n.parentElement) n.scrollTop = n.scrollHeight;
      const items = [...list.querySelectorAll(":scope > li")];
      const last = items[items.length - 1]!;
      const lr = last.getBoundingClientRect();
      const comp = el.querySelector("[data-testid='notes-composer']")!.getBoundingClientRect();
      const mid = document.elementFromPoint(lr.left + lr.width / 2, lr.bottom - 4);
      return { n: items.length, lastBottom: lr.bottom, compTop: comp.top, covered: !mid || !last.contains(mid) };
    }, toEnd);
    await page.waitForTimeout(400);
    let r = await measure();
    expect(r.n).toBeGreaterThan(1);
    expect(r.lastBottom, "last note bottom vs composer top").toBeLessThanOrEqual(r.compTop + 0.5);
    expect(r.covered, "the last note's bottom edge is covered").toBe(false);
    // The composer grows when it asks who is writing (the visitor has no name yet); that must not slide it over the last note either.
    await dialog.getByRole("textbox", { name: "Add a note" }).fill("A draft note");
    await dialog.getByRole("button", { name: "Add note" }).click();
    await expect(dialog.getByTestId("inline-identity")).toBeVisible();
    await page.waitForTimeout(300);
    r = await measure(false); // no re-scroll: where the reader already was
    expect(r.lastBottom, "last note bottom vs composer top (identity form open)").toBeLessThanOrEqual(r.compTop + 0.5);
    expect(r.covered, "the last note's bottom edge is covered (identity form open)").toBe(false);
  });
}

for (const [w, h] of [[1280, 800], [390, 844]] as const) {
  test(`playbook at ${w}x${h}: an anchor jump lands the card fully below the sticky tab bar`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(LA);
    await expect(page.getByText(/\d+ verified · \d+ removed/).first()).toBeVisible({ timeout: 20_000 });
    await stable(page);
    const link = page.locator("a[href='#card-promo_zones']").first();
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await page.waitForTimeout(1200); // smooth scroll
    const r = await page.evaluate(() => {
      const card = document.getElementById("card-promo_zones")!.getBoundingClientRect();
      const bar = document.querySelector("[role=tablist]")!.getBoundingClientRect();
      return { cardTop: card.top, barBottom: bar.bottom };
    });
    expect(r.cardTop, "card top vs tab bar bottom").toBeGreaterThanOrEqual(r.barBottom - 0.5);
  });
}
