import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { markTestTraffic, test } from "./fixtures";
import { blockMapTiles } from "./live";

// Saved tours, end to end: plan a tour, see it saved, find it in My tours, search, open, mark final, delete.
// Needs the saved-tours BFF and gateway (feat/tours-gw): run it after merge with
//   SAVED_TOURS_E2E=1 E2E_BASE_URL=<build with a gateway> npx playwright test saved-tours
// or locally: gateway `PORT=8094 node dist/collab/devServer.js`, dashboard server with COLLAB_FAKE=1, and a dev server NOT in fixtures mode (the board run must be "live").
// The board stream is fulfilled from the committed synthetic recording, so no Qloo, Gemini or Tavily call is made.
test.skip(process.env.SAVED_TOURS_E2E !== "1", "needs the saved-tours gateway and BFF: set SAVED_TOURS_E2E=1");

const rec = JSON.parse(fs.readFileSync(path.resolve("src/test/fixtures/showcase.synthetic.json"), "utf8")) as { artist: string; boardEvents: Array<{ type: string }>; playbooks: Record<string, Array<{ type: string }>> };
const sse = (events: unknown[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");

test("plan, auto-save, search, open, mark final, delete", async ({ page }) => {
  await blockMapTiles(page);
  await page.route("**/api/qloo/tour-board", (r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: sse(rec.boardEvents) }));
  await page.route("**/api/qloo/city-playbook**", (r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: sse(Object.values(rec.playbooks)[0] ?? []) }));
  await page.goto("/tours/board?new=1");
  await page.getByLabel("Artist", { exact: true }).fill(rec.artist);
  await page.getByRole("button", { name: "Mexico", exact: true }).click(); // a new tour starts with no region picked
  await page.getByRole("button", { name: "Score markets" }).click();

  const toast = page.locator("[data-toast-viewport]").getByText("Saved to My tours");
  await expect(toast).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Open My tours" }).click();
  await expect(page).toHaveURL(/\/tours\/mine/);
  await expect(page.getByRole("heading", { name: "My tours" })).toBeVisible();
  const row = page.getByTestId("saved-tour").first();
  await expect(row).toContainText(rec.artist);
  await expect(row.getByTestId("tour-status")).toHaveText("Draft");

  const box = page.getByRole("searchbox", { name: "Search saved tours" });
  await box.fill("zzzz-no-such-tour");
  await expect(page.getByText("No saved tours match that search.")).toBeVisible();
  await box.fill(rec.artist.split(" ")[0]!);
  await expect(page.getByTestId("saved-tour").first()).toBeVisible();

  // Open: the board is back, finished, without a new board request.
  let boardCalls = 0;
  page.on("request", (q) => { if (q.url().includes("/api/qloo/tour-board")) boardCalls++; });
  await page.getByTestId("saved-tour").first().getByRole("link", { name: /^Open / }).click();
  await expect(page).toHaveURL(/\/tours\/board\?saved=/);
  await expect(page.getByTestId("city-row").first()).toBeVisible({ timeout: 20_000 });
  expect(boardCalls).toBe(0);

  await page.goto("/tours/mine");
  const again = page.getByTestId("saved-tour").first();
  await again.getByRole("button", { name: /^Mark final: / }).click();
  await expect(again.getByTestId("tour-status")).toHaveText("Final");

  await again.getByRole("button", { name: /^Delete / }).click();
  await expect(again.getByText("Delete this tour? This can't be undone.")).toBeVisible();
  await again.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByText("No saved tours yet. Plan a tour and it's saved here automatically.")).toBeVisible();
});

// ---- more cases ----------------------------------------------------------------------------------------------------------------------
async function stubRuns(page: Page) {
  await blockMapTiles(page);
  await page.route("**/api/qloo/tour-board", (r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: sse(rec.boardEvents) }));
  await page.route("**/api/qloo/city-playbook**", (r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: sse(Object.values(rec.playbooks)[0] ?? []) }));
}
async function plan(page: Page) {
  await stubRuns(page);
  await page.goto("/tours/board?new=1");
  await page.getByLabel("Artist", { exact: true }).fill(rec.artist);
  await page.getByRole("button", { name: "Mexico", exact: true }).click(); // a new tour starts with no region picked
  await page.getByRole("button", { name: "Score markets" }).click();
  await expect(page.locator("[data-toast-viewport]").getByText("Saved to My tours")).toBeVisible({ timeout: 20_000 });
}
const ownerToken = (page: Page) => page.evaluate(() => localStorage.getItem("tiq.owner"));
async function firstSavedId(page: Page): Promise<string> {
  await page.goto("/tours/mine");
  const href = await page.getByTestId("saved-tour").first().getByRole("link", { name: /^Open / }).getAttribute("href");
  return new URL(href!, "http://x").searchParams.get("saved")!;
}
const rowsOf = (page: Page) => page.getByTestId("city-row").evaluateAll((els) => els.map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim()));

test("a reload of My tours keeps the list (the owner token persists)", async ({ page }) => {
  await plan(page);
  await page.goto("/tours/mine");
  await expect(page.getByTestId("saved-tour")).toHaveCount(1);
  const tok = await ownerToken(page);
  await page.reload();
  await expect(page.getByTestId("saved-tour")).toHaveCount(1);
  expect(await ownerToken(page)).toBe(tok);
});

test("another browser (a different owner) cannot see or open the tour", async ({ page, browser }) => {
  await plan(page);
  const id = await firstSavedId(page);
  const mine = await ownerToken(page);
  const ctx2 = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
  await markTestTraffic(ctx2);
  const p2 = await ctx2.newPage();
  await stubRuns(p2);
  await p2.goto("/tours/mine");
  await expect(p2.getByText("No saved tours yet. Plan a tour and it's saved here automatically.")).toBeVisible();
  const other = await p2.evaluate(async () => ((await (await fetch("/api/owners", { method: "POST" })).json()) as { ownerToken: string }).ownerToken);
  expect(other).toBeTruthy();
  expect(other).not.toBe(mine);
  await p2.goto(`/tours/board?saved=${id}`);
  await expect(p2.getByText("That saved tour no longer exists.")).toBeVisible();
  const status = await p2.evaluate(async ([tid, tok]) => (await fetch(`/api/tours/${tid}`, { headers: { "x-tiq-owner": tok! } })).status, [id, other] as const);
  expect(status).toBe(404);
  const noTok = await p2.evaluate(async (tid) => (await fetch(`/api/tours/${tid}`)).status, id);
  expect([401, 403, 404]).toContain(noTok);
  await ctx2.close();
});

test("the showcase never creates a saved tour", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", (q) => { if (q.method() === "POST" && /\/api\/(tours|owners)(\?|$)/.test(q.url())) posts.push(q.url()); });
  await stubRuns(page);
  await page.goto("/tours/board?showcase=1");
  await expect(page.getByTestId("city-row").first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2500);
  expect(posts).toEqual([]);
});

test("opening a saved tour makes no board request and shows the same rows and scores", async ({ page }) => {
  await plan(page);
  await expect(page.getByTestId("city-row").first()).toBeVisible();
  await expect.poll(async () => (await rowsOf(page)).length).toBeGreaterThan(2);
  const before = await rowsOf(page);
  const id = await firstSavedId(page);
  const board: string[] = [];
  page.on("request", (q) => { if (q.url().includes("/api/qloo/tour-board")) board.push(q.url()); });
  await page.goto(`/tours/mine`);
  await page.getByTestId("saved-tour").first().getByRole("link", { name: /^Open / }).click();
  await expect(page).toHaveURL(new RegExp(`saved=${id}`));
  await expect.poll(async () => (await rowsOf(page)).length).toBe(before.length);
  expect(await rowsOf(page)).toEqual(before);
  expect(board).toEqual([]);
});

test("the Tour Book and a seeded playbook open from a saved tour without new Qloo calls", async ({ page }) => {
  await plan(page);
  const cityId = Object.keys(rec.playbooks)[0]!;
  await page.locator("#city-row-" + cityId).click();
  await expect(page).toHaveURL(new RegExp(`/tours/playbook/${cityId}`));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes("/api/tours/"), { timeout: 15_000 });
  const calls: string[] = [];
  page.on("request", (q) => { if (/\/api\/qloo\/(tour-board|city-playbook)/.test(q.url())) calls.push(q.url()); });
  await page.goto("/tours/mine");
  await page.getByTestId("saved-tour").first().getByRole("link", { name: /^Open / }).click();
  await expect(page.getByTestId("city-row").first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: /Tour Book/ }).first().click();
  await expect(page).toHaveURL(/\/tours\/book/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goBack();
  await page.locator("#city-row-" + cityId).click();
  await expect(page).toHaveURL(new RegExp(`/tours/playbook/${cityId}`));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(calls).toEqual([]);
});

test("My tours at phone width: no horizontal scroll and every action reachable", async ({ page }) => {
  await plan(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tours/mine");
  const row = page.getByTestId("saved-tour").first();
  await expect(row).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  for (const [role, name] of [["link", /^Open /], ["button", /^Mark final: /], ["button", /^Delete /]] as const) {
    const el = row.getByRole(role, { name });
    await el.scrollIntoViewIfNeeded();
    const box = (await el.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(391);
    expect(box.height).toBeGreaterThanOrEqual(40);
  }
});

test("delete removes it from the list and the saved link then says it is gone", async ({ page }) => {
  await plan(page);
  const id = await firstSavedId(page);
  const row = page.getByTestId("saved-tour").first();
  await row.getByRole("button", { name: /^Delete / }).click();
  await row.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByTestId("saved-tour")).toHaveCount(0);
  await page.goto(`/tours/board?saved=${id}`);
  await expect(page.getByText("That saved tour no longer exists.")).toBeVisible();
});

test("Save as campaign (POST /api/tours without an owner token) is not taken over by saved tours", async ({ page }) => {
  await page.goto("/");
  const r = await page.evaluate(async () => { const res = await fetch("/api/tours", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); return { status: res.status, text: await res.text() }; });
  expect(r.text).not.toContain("owner required");
  expect(r.status).not.toBe(201);
});

test("My tours has no serious or critical accessibility violations", async ({ page }) => {
  await plan(page);
  await page.goto("/tours/mine");
  await expect(page.getByTestId("saved-tour").first()).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  expect(violations.map((v) => v.id)).toEqual([]);
});

test("reloading an open playbook keeps the same artist and scores, never the example", async ({ page }) => {
  await plan(page);
  const cityId = Object.keys(rec.playbooks)[0]!;
  await page.locator("#city-row-" + cityId).click();
  await expect(page).toHaveURL(new RegExp(`/tours/playbook/${cityId}.*saved=`));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes("/api/tours/"), { timeout: 15_000 });
  const crumb = async () => (await page.getByRole("navigation", { name: /breadcrumb/i }).innerText()).replace(/\s+/g, " ").trim();
  const before = { crumb: await crumb(), h1: await page.getByRole("heading", { level: 1 }).innerText() };
  if ((page.viewportSize()?.width ?? 0) >= 1024) expect(before.crumb).toContain(`${rec.artist} tour`); // phones collapse the trail
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
  expect(await page.getByRole("heading", { level: 1 }).innerText()).toBe(before.h1);
  expect(await crumb()).toBe(before.crumb);
  await expect(page.getByText("Recorded Qloo run")).toHaveCount(0);
  // A bare playbook URL (no saved id, no example flag) says the tour is not open, instead of showing the example.
  await page.goto(`/tours/playbook/${cityId}`);
  await expect(page.getByRole("heading", { name: "This tour isn't open in this tab" })).toBeVisible();
  await expect(page.locator("#main-content").getByRole("link", { name: "My tours" })).toBeVisible();
});

test("a tour note written while the tour was open is there when it is reopened from My tours", async ({ page }) => {
  await plan(page);
  await expect(page.getByTestId("city-row").first()).toBeVisible({ timeout: 20_000 });
  const text = `Saved-tour note ${Date.now()}`;
  // Wide bars show "Tour notes" as a button; narrow ones put it in the Team menu.
  const openNotes = async () => {
    const btn = page.getByRole("button", { name: /Tour notes/ }).first();
    if (await btn.isVisible().catch(() => false)) { await btn.click(); return; }
    await page.getByRole("button", { name: "Team", exact: true }).first().click();
    await page.getByRole("menuitem", { name: /^Tour notes/ }).click();
  };
  await openNotes();
  await page.getByRole("textbox", { name: "Add a note" }).fill(text);
  await page.getByRole("button", { name: "Add note" }).click();
  const who = page.getByTestId("inline-identity");
  if (await who.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await who.getByLabel("Your name").fill("E2E Tester");
    await who.getByText("Promoter", { exact: true }).click();
    await who.getByRole("button", { name: "Save" }).click();
  }
  await expect(page.getByRole("list", { name: "Notes" }).getByText(text)).toBeVisible({ timeout: 20_000 });
  const patched = await page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes("/api/tours/") && /"ws":"/.test(r.request().postData() ?? ""), { timeout: 15_000 });
  expect(patched.ok()).toBe(true);
  await page.keyboard.press("Escape");
  await page.goto("/tours/mine");
  await page.getByTestId("saved-tour").first().getByRole("link", { name: /^Open / }).click();
  await expect(page).toHaveURL(/\/tours\/board\?.*saved=/);
  await expect(page).toHaveURL(/[?&]ws=/, { timeout: 20_000 });
  await expect(page.getByTestId("city-row").first()).toBeVisible({ timeout: 20_000 });
  await openNotes();
  await expect(page.getByRole("list", { name: "Notes" }).getByText(text)).toBeVisible({ timeout: 20_000 });
});
