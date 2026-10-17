import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { useSyntheticRecordings } from "./fixtures";

// E2E_BASE_URL set = the daily live run against the deployed site: real recordings, real gateway.
const LIVE = Boolean(process.env.E2E_BASE_URL);

// Console noise we ignore, and why: only errors tied to the map style/tile host (tiles.openfreemap.org). Local runs abort those requests so the
// suite never depends on the network; Chromium then logs "Failed to load resource: net::ERR_FAILED" for that URL (matched through the message
// location) and MapLibre reports the aborted fetch. Nothing else is ignored: a 404, a React warning or an uncaught exception fails the test.
const TILE_HOST = /openfreemap/i;

test.beforeEach(async ({ page }) => {
  if (!LIVE) {
    await page.route(/tiles\.openfreemap\.org/, (route) => route.abort());
    await useSyntheticRecordings(page);
    // The dev server has no backend: answer the app shell's campaign list (fetched on every route) instead of letting it 404 into the console.
    await page.route(/\/api\/campaigns$/, (route) => route.fulfill({ json: { campaigns: [] } }));
  }
});

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function expectNoSeriousA11y(page: Page, where: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${where}: ${v.id} (${v.impact}) ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), `axe on ${where}`).toEqual([]);
}

test("promoter judge path: landing → board → playbook → hold → book → proof", async ({ page }) => {
  test.setTimeout(120_000);
  const t0 = Date.now();
  const errors: string[] = [];
  const qloo: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && !TILE_HOST.test(m.text()) && !TILE_HOST.test(m.location().url)) errors.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => { if (!TILE_HOST.test(e.message)) errors.push(`pageerror: ${e.message}`); });
  page.on("request", (r) => { if (r.url().includes("/api/qloo/")) qloo.push(r.url()); });

  // 1. Landing: three beats, then the showcase CTA.
  await page.goto("/");
  const beats = page.getByRole("list", { name: "The story in three beats" });
  await expect(beats).toBeVisible();
  await expect(beats.getByRole("listitem")).toHaveCount(3);
  expect(await noOverflow(page), "landing overflow").toBe(true);
  await expectNoSeriousA11y(page, "landing");
  await page.getByRole("link", { name: "Try the showcase tour" }).click();

  // 2. Board: the hidden-goldmine city, named from the page.
  const rows = page.getByTestId("city-row");
  await expect(rows.first()).toBeVisible({ timeout: 20_000 });
  const goldmine = rows.filter({ hasText: "Hidden goldmine" }).first();
  await expect(goldmine).toBeVisible();
  const cityButton = goldmine.getByRole("button").first();
  const cityName = ((await cityButton.getAttribute("aria-label")) ?? (await cityButton.innerText())).split(/[,\n]/)[0]!.trim();
  expect(cityName.length).toBeGreaterThan(1);
  const boardCount = await rows.count();
  expect(boardCount).toBeGreaterThan(0);
  expect(await noOverflow(page), "board overflow").toBe(true);
  await expectNoSeriousA11y(page, "board");
  await page.getByRole("tab", { name: "Without Qloo" }).click();
  await expect(page.getByText("Generic LLM answer — no taste evidence")).toBeVisible();
  await expect(page.getByRole("list", { name: "Generic ranking" }).getByRole("listitem")).toHaveCount(boardCount);
  expect(await noOverflow(page), "without-qloo overflow").toBe(true);
  await page.getByRole("tab", { name: "Winnability" }).click();
  await expect(rows.first()).toBeVisible();

  // 3. The goldmine playbook: sponsor card and the proof link.
  await rows.filter({ hasText: "Hidden goldmine" }).first().getByRole("button").first().click();
  await expect(page).toHaveURL(/\/tours\/playbook\//);
  await expect(page.getByRole("heading", { name: cityName }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Sponsors" }).first()).toBeVisible({ timeout: 20_000 });
  const proofLink = page.getByRole("link", { name: /Checked against real tours/ }).first();
  await expect(proofLink).toHaveAttribute("href", "/proof");
  expect(await noOverflow(page), "playbook overflow").toBe(true);
  await expectNoSeriousA11y(page, "playbook");

  // 4. Back to the board, hold the dates, open the book.
  await page.goBack();
  await expect(rows.first()).toBeVisible();
  await page.getByRole("button", { name: "Hold these dates" }).click();
  await page.getByRole("link", { name: "Open Tour Book" }).click();
  await expect(page.getByText("Advance & sponsor pitch").first()).toBeVisible({ timeout: 20_000 });
  expect(await noOverflow(page), "book overflow").toBe(true);
  await expectNoSeriousA11y(page, "book");

  // 5. Proof shows both runs.
  await page.goto("/proof");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What this shows" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How we got here" })).toBeVisible();
  expect(await noOverflow(page), "proof overflow").toBe(true);
  await expectNoSeriousA11y(page, "proof");

  expect(errors, "console/page errors on the promoter path").toEqual([]);
  if (!LIVE) expect(qloo, "showcase must make zero /api/qloo/ calls").toEqual([]);
  expect(Date.now() - t0).toBeLessThan(120_000);
});
