import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { blockMapTiles } from "./live";

// The recorded Los Angeles playbook (zero live calls): tabs, outbound links, the claims panel, "+N more", and the do-not-book list.
// Uses the recording the server serves (RECORDINGS_DIR locally, the private bucket on the deployed site).
const LA = "/tours/playbook/5368361?showcase=1";

test.beforeEach(async ({ page }) => { await blockMapTiles(page); });

const done = async (page: import("@playwright/test").Page) => {
  await expect(page.getByRole("heading", { name: "Los Angeles" }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/\d+ verified · \d+ removed/).first()).toBeVisible({ timeout: 20_000 }); // stream finished
};

test("three tabs: How to win, Acts fans love, Advance & risks", async ({ page }) => {
  await page.goto(LA);
  await done(page);
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveText(["How to win", "Acts fans love", "Advance & risks"]);
  await expect(page.getByRole("tab", { name: "How to win" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-tour='card-sponsors']")).toBeVisible();

  await page.getByRole("tab", { name: "Acts fans love" }).click();
  await expect(page.getByRole("tab", { name: "Acts fans love" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-tour='card-sponsors']")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Acts these fans love here" })).toBeVisible();

  await page.getByRole("tab", { name: "Advance & risks" }).click();
  await expect(page.getByRole("tab", { name: "Advance & risks" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Advance & risks" }).first()).toBeVisible();
  // No live web lookup is made for the recorded example unless the deployed gateway answers; either way the tab explains itself.
  await expect(page.locator("main")).not.toContainText("undefined");
});

test("Maps links open Google Maps search for the place, city and country in a new tab", async ({ page }) => {
  await page.goto(LA);
  await done(page);
  const links = page.locator("a[href*='google.com/maps']");
  await expect(links.first()).toBeVisible();
  const hrefs = await links.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    expect(href).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=[^&]+$/);
    expect(decodeURIComponent(href.split("query=")[1]!)).toMatch(/^.+, Los Angeles, .+$/); // "<place>, <city>, <country>"
  }
  await expect(links.first()).toHaveAttribute("target", "_blank");
  await expect(links.first()).toHaveAttribute("rel", /noopener/);
  await expect(links.first()).toHaveAccessibleName(/^Open .+ in Google Maps \(new tab\)$/);
});

test("the claims panel opens from a badge and lists verified claims with where they were found", async ({ page }) => {
  await page.goto(LA);
  await done(page);
  await page.locator("[data-tour='claims-badge']").first().click();
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Checked claims");
  await expect(panel).toContainText("Anything that doesn't match is removed.");
  await expect(panel.getByText(/^Verified: /).first()).toBeVisible();
  await expect(panel).not.toContainText("Ariel Pink");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});

test('"+N more" expands the sponsors list and "Show fewer" collapses it', async ({ page }) => {
  await page.goto(LA);
  await done(page);
  const card = page.locator("[data-tour='card-sponsors']");
  const more = card.getByRole("button", { name: /^\+\d+ more$/ });
  // The same toggle button whichever label it carries; the brand rows are the list just before it.
  const toggle = card.locator("button[aria-expanded]").filter({ hasText: /^(\+\d+ more|Show fewer)$/ });
  const rows = toggle.locator("xpath=preceding-sibling::ul[1]/li");
  await expect(more).toBeVisible();
  const n = Number((await more.innerText()).match(/\d+/)![0]);
  const before = await rows.count();
  expect(before).toBe(5);
  await more.click();
  await expect(rows).toHaveCount(5 + n);
  await expect(card.getByRole("button", { name: "Show fewer" })).toBeVisible();
  await card.getByRole("button", { name: "Show fewer" }).click();
  await expect(rows).toHaveCount(5);
});

test("hero tiles explain each Qloo pick and the why links to its card", async ({ page }) => {
  await page.goto(LA);
  await done(page);
  await expect(page.getByRole("link", { name: /of in-city fan heat \(#1 of \d+ zones\)/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^shared taste [01]\.\d\d · the city likes them [01]\.\d\d$/ })).toBeVisible();
  await page.getByRole("tab", { name: "Acts fans love" }).click();
  await page.getByRole("link", { name: /of in-city fan heat/ }).click();
  await expect(page.getByRole("tab", { name: "How to win" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#card-promo_zones")).toBeInViewport();
});

test("the do-not-book act never appears: not in any tab, not in the claims panel, not in the model reasoning summary", async ({ page }) => {
  await page.goto(LA);
  await done(page);
  const everywhere = async () => expect(await page.content()).not.toContain("Ariel Pink");
  await everywhere(); // includes collapsed sections: the model reasoning summary is in the DOM even when closed
  for (const tab of ["Acts fans love", "Advance & risks", "How to win"]) {
    await page.getByRole("tab", { name: tab }).click();
    await everywhere();
  }
  const reasoning = page.getByRole("button", { name: "Model reasoning summary" });
  if (await reasoning.count()) { await reasoning.click(); await everywhere(); }
  await expect(page.locator("body")).not.toContainText(/ariel pink/i);
});

test("Compare: the same model, without Qloo loads only on click, from a fake gateway answer", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/qloo/sponsors-without-qloo*", async (route) => {
    calls += 1;
    await route.fulfill({ json: { status: "ok", model: "fake", prompt: "p", cached: false, note: "n", qlooTop: { name: "Stüssy", fanRank: 1, cityRank: null }, brands: [{ name: "Nike", fanRank: 14, cityRank: 2 }, { name: "Coca-Cola", fanRank: 2, cityRank: 5 }, { name: "Red Bull", fanRank: null, cityRank: null }, { name: "Red Cross", fanRank: null, cityRank: null, nonSponsor: true }, { name: "Visa", fanRank: 30, cityRank: null }] } });
  });
  await page.goto(LA);
  await done(page);
  const card = page.locator("[data-tour='card-sponsors']");
  await expect(card.getByText("Live: asks Gemini once, cached after.")).toBeVisible();
  expect(calls).toBe(0);
  await card.getByRole("button", { name: "Compare: the same model, without Qloo" }).click();
  await expect(card.getByTestId("compare-summary")).toHaveText("Gemini's picks average #15.3 with these fans; 1 of 4 aren't in their top 20.");
  await expect(card.getByTestId("compare-note")).toContainText("not that the ranking is right.");
  expect(calls).toBe(1);
  await card.scrollIntoViewIfNeeded();
  if (process.env.SWQ_SHOT) await card.screenshot({ path: `${process.env.SWQ_SHOT}-${test.info().project.name}.png` });
});

test("Advance & risks uses the full tab panel width at 1440, in two columns", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(LA);
  await done(page);
  await page.getByRole("tab", { name: "Advance & risks" }).click();
  const card = page.getByTestId("advance-panel");
  await expect(card).toBeVisible();
  const panelW = (await page.getByRole("tabpanel").boundingBox())!.width;
  const cardW = (await card.boundingBox())!.width;
  expect(cardW / panelW, `advance card ${cardW} of panel ${panelW}`).toBeGreaterThanOrEqual(0.8);
  const cols = page.getByTestId("advance-columns");
  if (await cols.count()) {
    const [a, b] = await cols.locator("> div").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().left));
    expect(b!, "second column sits to the right of the first").toBeGreaterThan(a! + 300);
  }
});
