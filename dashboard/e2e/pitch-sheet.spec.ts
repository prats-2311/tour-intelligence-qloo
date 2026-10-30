import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { blockMapTiles } from "./live";

// The recorded Los Angeles playbook (zero live calls): a sponsor row opens a one-page brief that prints without app chrome.
const LA = "/tours/playbook/5368361?showcase=1";

test.beforeEach(async ({ page }) => { await blockMapTiles(page); });

test("Stüssy pitch sheet opens from the Sponsors card, reads from the recording, prints clean and goes back", async ({ page }) => {
  await page.goto(LA);
  await expect(page.getByText(/\d+ verified · \d+ removed/).first()).toBeVisible({ timeout: 20_000 });
  const pitch = page.getByRole("link", { name: "Pitch sheet for Stüssy" });
  // Fixed chrome (journey stepper, first-visit tour prompt, sticky Add to tour bar, toasts) must not sit on the link where a scroll-into-view leaves it,
  // and the team workspace arriving late must not move it under the finger: the link's centre point hits the link itself.
  await pitch.evaluate((el) => el.scrollIntoView({ block: "end", inline: "center" })); // the worst case: bottom edge of the screen
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(600);
  const hit = await pitch.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { ok: !!top && (top === el || el.contains(top)), over: top ? `${top.tagName}.${String(top.className).slice(0, 60)}` : "none", bottom: r.bottom, vh: innerHeight };
  });
  expect(hit.ok, `link is covered by ${hit.over} (bottom ${hit.bottom} of ${hit.vh})`).toBe(true);
  await pitch.click();
  await expect(page).toHaveURL(/\/tours\/pitch\/5368361\/St%C3%BCssy\?showcase=1/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Stüssy × .+ — Los Angeles$/, { timeout: 20_000 });
  const sheet = page.locator(".pitch-sheet");
  await expect(sheet).toContainText("Why this brand");
  await expect(sheet).toContainText(/fans rank Stüssy #1 in Los Angeles/);
  await expect(sheet).toContainText("Open 'By age group' on the playbook to add the age breakdown.");
  await expect(sheet).toContainText(/recorded on \d+ \w+ \d{4} \(recorded example\)/);
  await expect(sheet).toContainText("Draft for discussion — not an offer or agreement.");
  await expect(sheet).not.toContainText("Ariel Pink");
  await expect(page.locator("[data-pitch-actions]")).toBeVisible();

  await page.emulateMedia({ media: "print" });
  await expect(page.locator("[data-pitch-actions]")).toBeHidden();
  await expect(page.locator("[data-app-shell]").first()).toBeHidden();
  await expect(sheet).toBeVisible();
  await page.emulateMedia({ media: "screen" });

  await page.getByRole("link", { name: "Back to playbook" }).click();
  await expect(page).toHaveURL(/\/tours\/playbook\/5368361\?showcase=1/);
});

test("a hidden non-sponsor gets the unavailable message, not a sheet", async ({ page }) => {
  await page.goto("/tours/pitch/5368361/Planned%20Parenthood?showcase=1");
  await expect(page.getByText("This name isn't available for a pitch sheet.")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("main")).not.toContainText("Planned Parenthood");
});
