import { expect, test } from "@playwright/test";
import { blockMapTiles } from "./live";
import { ringOnTarget } from "./tourHelpers";

// /v2 (a concept page: every label must say so), /agents (public MCP tools and an example report) and the not-found page.
// Recording-backed and free of live calls; the recording is whatever the server serves.
test.beforeEach(async ({ page }) => { await blockMapTiles(page); });

const V2_TARGETS = ["v2-hero", "v2-profile", "v2-venues", "v2-match", "v2-act", "v2-experiences", "v2-rsvp", "v2-outcome", "v2-loop", "v2-compare"];

test("/v2 labels itself a concept: not built, fictional profile, blank venue answers, mock or prototype taps", async ({ page }) => {
  await page.goto("/v2");
  await expect(page.getByRole("heading", { level: 1, name: "Taste Loop: the next version" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Concept preview — not built yet")).toBeVisible();
  await expect(page.getByText("Fictional example").first()).toBeVisible();
  // Venue intent fields are left for the venue to answer, never filled in by us.
  const venues = page.locator("[data-tour='v2-venues']");
  const lines = venues.locator("li").filter({ hasText: /^(Open to collabs|Room size|Free nights)/ });
  expect(await lines.count()).toBeGreaterThanOrEqual(3);
  for (const t of await lines.allInnerTexts()) expect(t).toMatch(/\? \(the venue answers\)$/);
  // Fans prove it: a mock with dead buttons, or (when the site has analytics on) a labelled prototype.
  const rsvp = page.locator("[data-tour='v2-rsvp']");
  const tag = (await rsvp.getByText(/^(Mock — not live|Prototype)$/).first().innerText()).trim();
  if (tag === "Mock — not live") {
    await expect(rsvp).toContainText("Mock — not live. The buttons do nothing and nothing is sent.");
    for (const name of ["Going", "Waitlist", "I was there"]) await expect(rsvp.getByRole("button", { name })).toBeDisabled();
  } else {
    await expect(rsvp).toContainText("Prototype: taps from visitors of this page, not real fans.");
  }
  // No percentages anywhere on the page, and every outcome box either says No data yet or shows labelled prototype counts.
  expect(await page.locator("main").innerText()).not.toContain("%");
  await expect(page.locator("[data-tour='v2-outcome']")).toContainText(/No data yet|Prototype taps, not real fans/);
});

test("the v2 tour has 10 steps and each highlights its section", async ({ page }) => {
  await page.goto("/v2");
  await page.getByTestId("take-v2-tour").click();
  const popover = page.getByTestId("tour-popover");
  for (let i = 1; i <= 10; i += 1) {
    await expect(popover).toContainText(`${i} of 10`);
    await expect(page.getByTestId("tour-ring")).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => ringOnTarget(page, [V2_TARGETS[i - 1]!]), { timeout: 15_000, message: `v2 step ${i}: ring on ${V2_TARGETS[i - 1]}` }).toBe(true);
    if (i < 10) await popover.getByRole("button", { name: "Next" }).click();
  }
  await popover.getByRole("button", { name: "Done" }).click();
  await expect(popover).toHaveCount(0);
  // The concept tour keeps its own storage key: the v1 tour prompt is not marked done by it.
  expect(await page.evaluate(() => window.localStorage.getItem("tiq.tour.v1"))).toBeNull();
  expect(await page.evaluate(() => window.localStorage.getItem("tiq.tour.v2"))).toBe("completed");
});

test("/agents lists the 9 public MCP tools and an example report without do-not-book acts", async ({ page }) => {
  await page.goto("/agents");
  const table = page.getByRole("table", { name: "Public MCP tools" });
  await expect(table).toBeVisible({ timeout: 20_000 });
  await expect(table.locator("tbody tr")).toHaveCount(9);
  for (const name of ["find_tour_markets", "get_city_playbook", "suggest_support_acts", "rank_venues", "get_local_moment", "get_sponsors_by_age", "get_advance_risks", "get_team_notes", "get_tour_report"]) {
    await expect(table.getByRole("rowheader", { name })).toBeVisible();
  }
  await expect(page.getByTestId("report-label")).toContainText(/^Example output, built from the (recorded|sample) .+ run/);
  const body = page.locator("main");
  await expect(body).toContainText("# Tour report:");
  expect(await page.content()).not.toMatch(/ariel pink/i); // the example report is built from the recording, which lists the act
});

test("an unknown address says Page not found and links back to the example", async ({ page }) => {
  await page.goto("/nope");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: "Back to the example tour" }).click();
  await expect(page).toHaveURL(/\/$/);
});
