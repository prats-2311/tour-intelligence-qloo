import { expect, test, type Page } from "@playwright/test";
import { blockMapTiles } from "./live";

// The recorded example's guided tour (src/lib/tour/tourSteps.ts): 9 steps, each highlighting a `data-tour` target.
// Runs on whatever recording the server serves; no live Qloo or Gemini call is made.
const TOUR_KEY = "tiq.tour.v1";
// data-tour values tried in order, like the overlay does; a trailing * is a prefix (the hook step targets the playbook city's row).
const STEP_TARGETS = [["board-header"], ["city-*"], ["moves"], ["board-panel"], ["card-sponsors"], ["card-co_billing"], ["claims-badge", "claims-tile"], ["ask"], ["book-cover"]];

// Every Playwright test gets a fresh browser context, so no tour outcome is stored when a test starts.
test.beforeEach(async ({ page }) => { await blockMapTiles(page); });

/** The on-screen element carrying a data-tour value that starts with `prefix`. */
const visibleTarget = (page: Page, ids: string[]) => page.evaluate((list) => {
  const all = [...document.querySelectorAll<HTMLElement>("[data-tour]")];
  let el: HTMLElement | undefined;
  for (const id of list) {
    el = all.find((e) => (id.endsWith("*") ? (e.dataset.tour ?? "").startsWith(id.slice(0, -1)) : e.dataset.tour === id) && e.getClientRects().length > 0);
    if (el) break;
  }
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { tour: el.dataset.tour!, label: el.getAttribute("aria-label") ?? "", text: (el.textContent ?? "").trim().slice(0, 40), top: r.top, left: r.left, width: r.width, height: r.height };
}, ids);

/** True when the tour ring sits on the on-screen target (the target's box padded by 6px), measured in one frame so scrolling cannot skew it. */
const ringOnTarget = (page: Page, ids: string[]) => page.evaluate((list) => {
  const all = [...document.querySelectorAll<HTMLElement>("[data-tour]")];
  let el: HTMLElement | undefined;
  for (const id of list) {
    el = all.find((e) => (id.endsWith("*") ? (e.dataset.tour ?? "").startsWith(id.slice(0, -1)) : e.dataset.tour === id) && e.getClientRects().length > 0);
    if (el) break;
  }
  const ring = document.querySelector<HTMLElement>("[data-testid='tour-ring']");
  if (!el || !ring) return false;
  const t = el.getBoundingClientRect(), r = ring.getBoundingClientRect();
  return Math.abs(r.left - (t.left - 6)) < 10 && Math.abs(r.top - (t.top - 6)) < 10 && Math.abs(r.width - (t.width + 12)) < 10 && Math.abs(r.height - (t.height + 12)) < 10;
}, ids);

test("the tour has 9 steps and every step highlights its target", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start tour" }).click();
  const popover = page.getByTestId("tour-popover");
  for (let i = 1; i <= 9; i += 1) {
    await expect(popover).toContainText(`${i} of 9`);
    // Wait for the step's target to mount and the ring to settle on it.
    const prefix = STEP_TARGETS[i - 1]!;
    await expect.poll(() => visibleTarget(page, prefix), { timeout: 20_000, message: `step ${i}: target ${prefix.join("|")} on screen` }).not.toBeNull();
    await expect(page.getByTestId("tour-ring")).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => ringOnTarget(page, prefix), { timeout: 15_000, message: `step ${i}: ring on ${prefix.join("|")}` }).toBe(true);
    if (i < 9) await popover.getByRole("button", { name: "Next" }).click();
  }
  await expect(popover.getByRole("button", { name: "Done" })).toBeVisible();
  await popover.getByRole("button", { name: "Done" }).click();
  await expect(popover).toHaveCount(0);
  expect(await page.evaluate((k) => window.localStorage.getItem(k), TOUR_KEY)).toBe("completed");
});

test("step 8 highlights the chat button", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start tour" }).click();
  const popover = page.getByTestId("tour-popover");
  for (let i = 1; i < 8; i += 1) await popover.getByRole("button", { name: "Next" }).click();
  await expect(popover).toContainText("8 of 9");
  await expect(popover.getByRole("heading", { name: "Ask about this tour" })).toBeVisible();
  const chat = await visibleTarget(page, ["ask"]);
  expect(chat, "the chat button (data-tour=ask) is on screen").not.toBeNull();
  expect(chat!.label === "Ask about this tour" || chat!.text.includes("Ask about this tour")).toBe(true);
  await expect.poll(() => ringOnTarget(page, ["ask"]), { timeout: 15_000 }).toBe(true);
});

test("Skip persists: the tour is dismissed now and the prompt stays away after a reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("tour-prompt")).toBeVisible();
  await page.getByRole("button", { name: "Start tour" }).click();
  const popover = page.getByTestId("tour-popover");
  await popover.getByRole("button", { name: "Next" }).click();
  await popover.getByRole("button", { name: "Skip" }).click();
  await expect(popover).toHaveCount(0);
  expect(await page.evaluate((k) => window.localStorage.getItem(k), TOUR_KEY)).toBe("dismissed");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("tour-prompt")).toHaveCount(0);
  await page.goto("/tours/board?showcase=1");
  await expect(page.getByTestId("city-row").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("tour-prompt")).toHaveCount(0);
});
