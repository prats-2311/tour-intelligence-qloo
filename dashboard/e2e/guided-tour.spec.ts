import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";
import { blockMapTiles } from "./live";
import { ringOnTarget, targetFit, visibleTarget } from "./tourHelpers";

// The four guided tours (src/lib/tour/tours.ts) on the recorded example. Runs on whatever recording the server serves, against a built
// dashboard (see dashboard/CLAUDE.md); no live Qloo, Gemini or web call is made, and a spec below proves the tours themselves fetch nothing.
const BOARD = "/tours/board?showcase=1";

interface TourSpec { id: string; title: string; minutes: number; key: string; steps: Array<{ title: RegExp | string; targets: string[]; /** The first target must be on screen, not just a fallback. */ strict?: boolean }>; }

const TOURS: TourSpec[] = [
  {
    id: "essentials", title: "The essentials", minutes: 2, key: "tiq.tour.v1", steps: [
      { title: "The hook", targets: ["sponsors-top", "card-sponsors"], strict: true },
      { title: "By age group", targets: ["sponsors-age", "card-sponsors"], strict: true },
      { title: "Pitch sheet", targets: ["sponsors-pitch", "card-sponsors"], strict: true },
      { title: "Checked claims", targets: ["claims-badge", "claims-tile"] },
      { title: "Acts, venues and promo zones", targets: ["card-co_billing", "card-venue_fit", "card-promo_zones"], strict: true },
      { title: "Ask about this tour", targets: ["ask"], strict: true },
      { title: "The Tour Board", targets: ["moves", "board-header"], strict: true },
      { title: "Without Qloo", targets: ["board-panel"], strict: true },
      { title: "Tour Book", targets: ["book-cover"], strict: true },
    ],
  },
  {
    id: "plan", title: "Plan the tour", minutes: 2, key: "tiq.tour.plan", steps: [
      { title: "Age groups, city by city", targets: ["age-matrix"], strict: true },
      { title: "Filters and the quadrant", targets: ["charts-filters", "quadrant"], strict: true },
      { title: "Advance and risks", targets: ["tab-advance"], strict: true },
      { title: "Budget", targets: ["budget-header"], strict: true },
      { title: "Your documents and a city plan", targets: ["chat-tools", "ask"], strict: true },
      { title: "Compare: the same model, without Qloo", targets: ["sponsors-compare"], strict: true },
      { title: "Your saved tours", targets: ["nav-mine", "nav-menu"] },
    ],
  },
  {
    id: "team", title: "Work as a team", minutes: 2, key: "tiq.tour.team", steps: [
      { title: "A private demo workspace", targets: ["team-bar"], strict: true },
      { title: "Status chips", targets: ["status-chip", "team-bar"], strict: true },
      { title: "City and card notes", targets: ["city-notes", "team-bar"], strict: true },
      { title: "Team overrides", targets: ["override-team", "advance-tiles"] },
      { title: "Share link and team activity", targets: ["team-share", "team-bar"], strict: true },
      { title: "Decisions in the Tour Book", targets: ["chapter-team", "book-cover"] },
    ],
  },
  {
    id: "trust", title: "Trust and agents", minutes: 1, key: "tiq.tour.trust", steps: [
      { title: "Pre-registered tests", targets: ["proof-test", "proof-top"] },
      { title: "Checker catch rates and live numbers", targets: ["proof-checkers", "live-stats", "proof-top"] },
      { title: "Use it from your AI agent", targets: ["agents-top"], strict: true },
      { title: "What's next", targets: ["v2-hero"], strict: true },
    ],
  },
];

// Every Playwright test gets a fresh browser context, so no tour outcome is stored when a test starts.
test.beforeEach(async ({ page }) => { await blockMapTiles(page); });

const popover = (page: Page) => page.getByTestId("tour-popover");
/** Next by keyboard (ArrowRight is bound on the document): no wait for the popover to stop moving while a page is still loading. */
const advance = (page: Page) => page.keyboard.press("ArrowRight");
const stored = (page: Page, key: string) => page.evaluate((k) => window.localStorage.getItem(k), key);

/** Opens the sidebar (desktop) or the drawer (phones) and returns the scope holding the Tours section. */
async function navScope(page: Page) {
  const side = page.locator("aside[aria-label='Site sections']");
  if (await side.isVisible()) return side;
  await page.getByRole("button", { name: "Open navigation" }).click();
  return page.getByRole("dialog").filter({ has: page.getByRole("navigation", { name: "Sections" }) });
}

/** Starts a tour from the Tours section of the sidebar or drawer. */
async function startFromNav(page: Page, tour: TourSpec) {
  await page.goto(BOARD);
  await expect(page.getByTestId("city-row").first()).toBeVisible({ timeout: 20_000 });
  // The first-visit prompt sits in a corner; the essentials still run from the nav.
  const prompt = page.getByTestId("tour-prompt");
  if (await prompt.isVisible()) await prompt.getByRole("button", { name: "No thanks" }).click();
  if (tour.id === "team") await expect(page).toHaveURL(/[?&]ws=/, { timeout: 20_000 });
  const scope = await navScope(page);
  await scope.getByRole("button", { name: new RegExp(`^${tour.title}, ${tour.minutes} min`) }).click();
  await expect(popover(page)).toContainText(`1 of ${tour.steps.length}`);
}

async function stepThrough(page: Page, tour: TourSpec, { rings }: { rings: boolean }) {
  for (let i = 1; i <= tour.steps.length; i += 1) {
    const step = tour.steps[i - 1]!;
    const where = `${tour.id} step ${i} (${step.title})`;
    await expect(popover(page)).toContainText(`${i} of ${tour.steps.length}`);
    await expect(popover(page).getByRole("heading", { name: step.title })).toBeVisible();
    if (rings) {
      const want = step.strict ? [step.targets[0]!] : step.targets;
      await expect.poll(() => visibleTarget(page, want), { timeout: 25_000, message: `${where}: target ${want.join("|")} on screen` }).not.toBeNull();
      await expect(page.getByTestId("tour-ring")).toBeVisible({ timeout: 15_000 });
      await expect.poll(() => ringOnTarget(page, step.targets), { timeout: 15_000, message: `${where}: ring on ${step.targets.join("|")}` }).toBe(true);
    }
    if (i < tour.steps.length) await popover(page).getByRole("button", { name: "Next", exact: true }).click();
  }
}

for (const tour of TOURS) {
  test(`${tour.title}: ${tour.steps.length} steps, each ring on its target`, async ({ page }) => {
    await startFromNav(page, tour);
    await stepThrough(page, tour, { rings: true });
    await popover(page).getByRole("button", { name: "Done" }).click();
    await expect(popover(page)).toHaveCount(0);
    expect(await stored(page, tour.key)).toBe("completed");
    // The tick shows in the Tours section.
    const scope = await navScope(page);
    await expect(scope.getByRole("button", { name: `${tour.title}, ${tour.minutes} min, completed` })).toBeVisible();
  });
}

test("the essentials start from the first-visit prompt, lead with the sponsor story and keep tiq.tour.v1", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("tour-prompt")).toContainText("Take the 2-minute tour");
  await page.getByRole("button", { name: "Start tour" }).click();
  await expect(popover(page).getByRole("heading", { name: "The hook" })).toBeVisible();
  await expect(page).toHaveURL(/\/tours\/playbook\/.+showcase=1/);
  // The hook names the brand the recording ranks first and says it is outside the city's own top 20 (or its city rank).
  await expect(popover(page)).toContainText(/fans rank .+ #\d+/);
  await popover(page).getByRole("button", { name: "Skip" }).click();
  expect(await stored(page, "tiq.tour.v1")).toBe("dismissed");
});

test("How it works on the landing starts The essentials, even after the prompt was dismissed", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "No thanks" }).click();
  await page.getByTestId("take-tour").click();
  await expect(popover(page)).toContainText("1 of 9");
  await expect(popover(page).getByRole("heading", { name: "The hook" })).toBeVisible();
});

test("a returning visitor with tiq.tour.v1 set is not prompted again", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("tiq.tour.v1", "completed"));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("tour-prompt")).toHaveCount(0);
});

test("the last step offers the next tour: Next: <tour> (N steps), chained through to the end", async ({ page }) => {
  test.setTimeout(240_000);
  await startFromNav(page, TOURS[0]!);
  for (let t = 0; t < TOURS.length; t += 1) {
    const tour = TOURS[t]!;
    await expect(popover(page)).toContainText(`1 of ${tour.steps.length}`);
    for (let i = 1; i < tour.steps.length; i += 1) { await advance(page); await expect(popover(page)).toContainText(`${i + 1} of ${tour.steps.length}`); }
    await expect(popover(page)).toContainText(`${tour.steps.length} of ${tour.steps.length}`);
    const nxt = TOURS[t + 1];
    if (nxt) {
      await popover(page).getByRole("button", { name: `Next: ${nxt.title} (${nxt.steps.length} steps)` }).click();
      expect(await stored(page, tour.key)).toBe("completed");
    } else {
      await expect(popover(page).getByRole("button", { name: /^Next:/ })).toHaveCount(0);
      await popover(page).getByRole("button", { name: "Done" }).click();
      expect(await stored(page, tour.key)).toBe("completed");
    }
  }
});

test("no tour makes a live Qloo, Gemini or web call, and the lazy controls are never clicked", async ({ page }) => {
  test.setTimeout(240_000);
  const FORBIDDEN = ["/api/qloo/sponsor-segments", "/api/qloo/sponsors-without-qloo", "/api/qloo/advance", "/api/qloo/strategist", "/api/qloo/without-qloo", "/api/qloo/tour-board", "/api/qloo/city-playbook", "/api/qloo/tools/"];
  const seen: string[] = [];
  page.on("request", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) seen.push(`${r.method()} ${u.pathname}`); });
  await startFromNav(page, TOURS[0]!);
  const tourStart = seen.length;
  for (let t = 0; t < TOURS.length; t += 1) {
    const tour = TOURS[t]!;
    for (let i = 1; i < tour.steps.length; i += 1) { await advance(page); await expect(popover(page)).toContainText(`${i + 1} of ${tour.steps.length}`); }
    const nxt = TOURS[t + 1];
    if (nxt) await popover(page).getByRole("button", { name: /^Next: / }).click();
    else await popover(page).getByRole("button", { name: "Done" }).click();
  }
  const during = seen.slice(tourStart);
  const bad = during.filter((s) => FORBIDDEN.some((f) => s.includes(f)));
  expect(bad, `live calls during the tours: ${bad.join(", ")}`).toEqual([]);
  // The age matrix and compare panels were left alone: neither shows a result or a loading state.
  await page.goto("/tours/insights?showcase=1");
  await expect(page.getByTestId("age-matrix")).toBeVisible({ timeout: 20_000 });
});

test("step copy on screen follows the rules: no 'insights', no percent sign, pronoun-neutral", async ({ page }) => {
  for (const tour of TOURS) {
    await startFromNav(page, tour);
    for (let i = 1; i <= tour.steps.length; i += 1) {
      const text = (await popover(page).innerText()).replace(/\n/g, " ");
      expect(text, `${tour.id} step ${i}`).not.toMatch(/insights/i);
      expect(text, `${tour.id} step ${i}`).not.toContain("%");
      expect(text, `${tour.id} step ${i}`).not.toMatch(/\b(he|she|his|hers|him)\b/i);
      if (i < tour.steps.length) await advance(page);
    }
    await page.keyboard.press("Escape");
  }
});

test("Skip persists: the tour is dismissed now and the prompt stays away after a reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("tour-prompt")).toBeVisible();
  await page.getByRole("button", { name: "Start tour" }).click();
  await popover(page).getByRole("button", { name: "Next", exact: true }).click();
  await popover(page).getByRole("button", { name: "Skip" }).click();
  await expect(popover(page)).toHaveCount(0);
  expect(await stored(page, "tiq.tour.v1")).toBe("dismissed");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("tour-prompt")).toHaveCount(0);
  await page.goto(BOARD);
  await expect(page.getByTestId("city-row").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("tour-prompt")).toHaveCount(0);
});

// Audit C 5: every step's target is on screen (not under the popover or the bars) at the two sizes the audit used.
for (const vp of [{ w: 390, h: 844 }, { w: 1440, h: 900 }]) {
  for (const tour of TOURS) {
    test(`${tour.title} at ${vp.w}px: each step's target is at least 80% visible and not covered by the popover`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await startFromNav(page, tour);
      for (let i = 1; i <= tour.steps.length; i += 1) {
        const step = tour.steps[i - 1]!;
        const where = `${tour.id} step ${i} (${step.title}) at ${vp.w}`;
        await expect(popover(page)).toContainText(`${i} of ${tour.steps.length}`);
        await expect.poll(() => visibleTarget(page, step.strict ? [step.targets[0]!] : step.targets), { timeout: 25_000, message: `${where}: target on screen` }).not.toBeNull();
        // The scroll settles over a few frames (smooth scroll, lazy cards): wait for the fit rather than a fixed delay.
        await expect.poll(async () => {
          const f = await targetFit(page, step.targets, vp.w <= 500);
          return f ? `${f.visible >= 0.8 && f.covered <= 0.05 ? "ok" : `visible ${(f.visible * 100).toFixed(0)}% covered ${(f.covered * 100).toFixed(0)}%`}` : "no target";
        }, { timeout: 15_000, message: `${where}: at least 80% visible and not covered by the popover` }).toBe("ok");
        await expect.poll(async () => {
          const ring = await page.getByTestId("tour-ring").boundingBox();
          return !ring || (ring.x >= -0.5 && ring.x + ring.width <= vp.w + 0.5 && ring.y >= -0.5 && ring.y + ring.height <= vp.h + 0.5);
        }, { timeout: 10_000, message: `${where}: ring inside the viewport` }).toBe(true);
        if (i < tour.steps.length) await popover(page).getByRole("button", { name: "Next", exact: true }).click();
      }
    });
  }
}

test("The essentials never leave a page they have left: six playbook steps, then the board twice, then the book", async ({ page }) => {
  test.setTimeout(120_000);
  await startFromNav(page, TOURS[0]!);
  const seen: string[] = [];
  for (let i = 1; i <= 9; i += 1) {
    const want = i <= 6 ? "/tours/playbook/" : i <= 8 ? "/tours/board" : "/tours/book";
    await expect(popover(page)).toContainText(`${i} of 9`);
    await expect.poll(() => new URL(page.url()).pathname, { message: `step ${i} route` }).toContain(want);
    seen.push(new URL(page.url()).pathname.replace(/\/playbook\/.*/, "/playbook"));
    if (i < 9) await advance(page);
  }
  expect(seen.filter((p, i) => i === 0 || p !== seen[i - 1])).toEqual(["/tours/playbook", "/tours/board", "/tours/book"]);
});

test("the first-visit prompt never covers body text or links, on the landing page at 390 and 1440", async ({ page }) => {
  for (const vp of [{ w: 390, h: 844 }, { w: 1440, h: 900 }]) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto("/");
    const prompt = page.getByTestId("tour-prompt");
    await expect(prompt).toBeVisible();
    // Scroll to the very end: nothing the user can read or click may sit under the prompt (the page reserves its height).
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const box = (await prompt.boundingBox())!;
    const covered = await page.evaluate((b) => {
      const hits: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("main a[href], main button, main p, main li, main h1, main h2")) {
        if (el.closest("[data-testid='tour-prompt']")) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const ox = Math.min(r.right, b.x + b.width) - Math.max(r.left, b.x), oy = Math.min(r.bottom, b.y + b.height) - Math.max(r.top, b.y);
        if (ox > 2 && oy > 2) hits.push(`${el.tagName.toLowerCase()} ${(el.textContent ?? "").trim().slice(0, 30)}`);
      }
      return hits;
    }, box);
    expect(covered, `under the prompt at ${vp.w}`).toEqual([]);
  }
});

test("after a tour started from the phone drawer ends, focus returns to the drawer toggle", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startFromNav(page, TOURS[3]!);
  await popover(page).getByRole("button", { name: "Skip" }).click();
  await expect(popover(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeFocused();
});
