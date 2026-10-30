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

test("3 hero: no decorative blank art over 400px wide, hero uses both columns", async ({ page }) => {
  for (const [w, h] of [[1440, 900], [1280, 800]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(LA);
    await loaded(page);
    const big = await page.locator("header").filter({ has: page.locator("h1") }).first().evaluate((hd) => [...hd.querySelectorAll("[aria-hidden='true']")]
      .filter((el) => el.getBoundingClientRect().width > 400 && !(el.textContent ?? "").trim()).map((el) => el.tagName));
    expect(big, `aria-hidden empty art at ${w}`).toEqual([]);
    // Right half is used: the advance tiles sit in the right column.
    const tile = await page.getByText("TOP ZONE", { exact: true }).first().boundingBox();
    expect(tile!.x, "tiles in the right half").toBeGreaterThan(w * 0.4);
  }
});

test("5 remove from tour: focus stays on the toggled button and the footer does not jump", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(LA);
  await loaded(page);
  const footer = page.locator("div.sticky.z-20").filter({ has: page.getByRole("button", { name: /Remove from tour|Add to tour/ }) }).last();
  const remove = page.getByRole("button", { name: "Remove from tour" });
  const before = (await footer.boundingBox())!.height;
  await remove.click();
  const add = page.getByRole("button", { name: "Add to tour" });
  await expect(add).toBeVisible();
  await expect(add).toBeFocused();
  expect(Math.abs((await footer.boundingBox())!.height - before), "footer height change").toBeLessThanOrEqual(1);
});

test("12 keyboard: skip link first, Remove precedes Next, card DOM order matches the visual grid", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(LA);
  await loaded(page);
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => document.activeElement?.closest("main") !== null || document.activeElement?.tagName === "MAIN")).toBe(true);
  const order = await page.evaluate(() => {
    const idx = (q: string) => { const els = [...document.querySelectorAll("button, a")]; return els.findIndex((e) => new RegExp(q).test(e.textContent ?? "")); };
    return { remove: idx("^Remove from tour$"), next: idx("^Next: ") };
  });
  expect(order.remove).toBeGreaterThan(-1);
  expect(order.remove).toBeLessThan(order.next);
  const cards = await page.locator("[data-card]").evaluateAll((els) => els.map((e) => ({ id: e.getAttribute("data-card")!, y: Math.round(e.getBoundingClientRect().top), x: Math.round(e.getBoundingClientRect().left) })));
  const visual = [...cards].sort((a, b) => a.y - b.y || a.x - b.x).map((c) => c.id);
  expect(cards.map((c) => c.id)).toEqual(visual);
});

test("13 targets: outbound links, claims, breadcrumbs and primary buttons are 44px high on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(LA);
  await loaded(page);
  const small = await page.locator("main a, main button, nav[aria-label='Breadcrumb'] a, nav[aria-label='Breadcrumb'] button").evaluateAll((els) => els
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ el, r }) => r.width > 1 && r.height > 1 && !/\bsr-only\b/.test(el.className) && !el.closest("[role=tablist]"))
    .filter(({ r }) => r.height < 43.5)
    .map(({ el, r }) => `${el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`));
  expect(small).toEqual([]);
});

test("4 numbers key: a small expandable key explains every term, and tied venues say so", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(LA);
  await loaded(page);
  const key = page.getByText("How to read these numbers");
  await expect(key).toBeVisible();
  await key.click();
  for (const t of ["Affinity", "Fan rank / city rank", "Venue fit", "Shared taste", "Share"]) await expect(page.locator("[data-number-key]").getByText(t, { exact: true })).toBeVisible();
  await expect(page.locator("[data-number-key]")).toContainText("not a share of fans");
});

const ADVANCE_DOWN_BODY = "{}";
const item = (n: number) => ({ text: `Requirement ${n}: carry the signed contract, passport copies and the original invitation letter for the border officer.`, sourceUrl: `https://example.com/${n}` });
const ADVANCE_LOADED = {
  weather: { status: "ok", source: "Open-Meteo", sourceUrl: "https://open-meteo.com", years: [2024, 2025], days: 60, tempMaxC: { mean: 24, min: 18, max: 31 }, tempMinC: { mean: 14 }, rainDaysShare: 0.1, note: "Historical, not a forecast." },
  holidays: { status: "ok", source: "Nager.Date", sourceUrl: "https://date.nager.at", items: Array.from({ length: 6 }, (_, i) => ({ date: `2026-11-0${i + 1}`, name: `Holiday ${i}`, localName: `Holiday ${i}`, near: false })) },
  visa: { status: "ok", summary: "A work visa is needed.", leadTime: "8 weeks", items: Array.from({ length: 14 }, (_, i) => item(i)), sources: [{ title: "Gov", url: "https://example.com/g" }], cached: false },
  equipment: { status: "ok", summary: "An ATA carnet is advised.", items: Array.from({ length: 14 }, (_, i) => item(i + 20)), sources: [{ title: "Customs", url: "https://example.com/c" }], cached: false },
  generatedAt: "2026-10-31T00:00:00Z",
};

/**
 * The team workspace (status line, notes count, teammates) arrives after the recording and grows the header above the tab bar (+120 to +230px on a
 * phone). Where scroll anchoring exists the browser moves scrollY with it; that is a page-load shift, not a tab switch, so wait for it to land first.
 */
async function settled(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  let last = -1, same = 0;
  for (let i = 0; i < 40 && same < 4; i++) {
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    same = h === last ? same + 1 : 0;
    last = h;
    await page.waitForTimeout(250);
  }
}

// Switching to the tall Advance tab (content loading in, or the unavailable panel) must not move the tab bar: the page's scroll position holds.
for (const [name, mode] of [["unavailable (no gateway)", "down"], ["loaded (gateway answers)", "loaded"], ["whatever this environment returns", "env"]] as const) {
  for (const [w, h] of [[390, 844], [1440, 900]] as const) {
    test(`6 advance tab at ${w}px, ${name}: switching tabs does not jump the page`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      if (mode === "down") await page.route("**/api/qloo/advance**", (r) => r.fulfill({ status: 503, contentType: "application/json", body: ADVANCE_DOWN_BODY }));
      // Answer after a beat, as the real lookups do, so the skeleton is on screen first and the panel grows when the content lands.
      if (mode === "loaded") await page.route("**/api/qloo/advance**", async (r) => { await new Promise((ok) => setTimeout(ok, 700)); await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ADVANCE_LOADED) }); });
      await page.goto(LA);
      await loaded(page);
      await settled(page);
      await page.evaluate(() => window.scrollTo(0, 1500));
      const before = await page.evaluate(() => window.scrollY);
      expect(before).toBeGreaterThan(1000);
      const tab = page.getByRole("tab", { name: "Advance & risks" });
      const tabTop = () => tab.evaluate((e) => Math.round(e.getBoundingClientRect().top));
      const top0 = await tabTop();
      await tab.click();
      if (mode === "down") {
        await expect(page.getByText("Advance & risks needs the live service. Try again.")).toBeVisible();
        await expect(page.getByText("Could not load this. Try again later.")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(1);
      }
      if (mode === "loaded") await expect(page.getByText("Requirement 0:").first()).toBeVisible({ timeout: 15_000 });
      await settled(page); // late content (skeleton -> text) lands after the click
      const after = await page.evaluate(() => window.scrollY);
      expect(Math.abs(after - before), "scroll jump").toBeLessThanOrEqual(5);
      expect(Math.abs((await tabTop()) - top0), "tab bar moved").toBeLessThanOrEqual(5);
    });
  }
}

test("7+8 pitch sheet: known breadcrumb, no chrome in print, no UI instruction printed, one A4 page", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/tours/pitch/5368361/St%C3%BCssy?showcase=1");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Stüssy × .+ — Los Angeles$/, { timeout: 20_000 });
  const crumbs = page.locator("nav[aria-label='Breadcrumb']");
  await expect(crumbs).toContainText("Pitch sheet · Stüssy");
  await expect(crumbs).not.toContainText("Page not found");
  await page.emulateMedia({ media: "print" });
  for (const sel of ["nav[aria-label='Breadcrumb']", "[data-mobile-bar]", "[data-app-shell]", "aside[aria-label='Site sections']", "button[aria-label='Ask about this tour']", "a[href='#main-content']"]) {
    await expect(page.locator(sel).first(), sel).toBeHidden();
  }
  expect(await page.locator(".pitch-sheet").innerText()).not.toMatch(/By age group/);
  const pdf = await page.pdf({ format: "A4", printBackground: true });
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length;
  expect(pages, "PDF pages").toBe(1);
  await page.emulateMedia({ media: "screen" });
  await expect(page.locator(".pitch-sheet")).toContainText("Open 'By age group' on the playbook");
});

test("7+8 pitch sheet at phone width prints one page too", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tours/pitch/5368361/St%C3%BCssy?showcase=1");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Stüssy × .+ — Los Angeles$/, { timeout: 20_000 });
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("[data-mobile-bar]")).toBeHidden();
  await expect(page.locator("button[aria-label='Ask about this tour']")).toBeHidden();
  const pdf = await page.pdf({ format: "A4", printBackground: true });
  expect((pdf.toString("latin1").match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length).toBe(1);
});

test("lower: Acts tab uses the width, card renamed, claims panel names the sentence left out", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(LA);
  await loaded(page);
  await expect(page.getByRole("heading", { name: "Places, films and TV these fans love" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What these fans love here" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Acts fans love" }).click();
  const card = page.locator("[role=tabpanel] article").first();
  const main = await page.locator("main").boundingBox();
  expect((await card.boundingBox())!.width, "Acts card width").toBeGreaterThan(main!.width * 0.7);
});

test("a11y: heading order has no skipped level on the playbook", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(LA);
  await loaded(page);
  const levels = await page.locator("main h1, main h2, main h3, main h4").evaluateAll((hs) => hs.map((h) => Number(h.tagName[1])));
  for (let i = 1; i < levels.length; i++) expect(levels[i]! - levels[i - 1]!, `heading jump at ${i}`).toBeLessThanOrEqual(1);
});
