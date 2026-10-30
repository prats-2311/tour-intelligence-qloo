import { expect, type Page } from "@playwright/test";
import { test, dismissTourPrompt, useSyntheticRecordings } from "./fixtures";

// Runs must not depend on the network: map tile/style requests are blocked (the map shows its "tiles unavailable" note).
test.beforeEach(async ({ page }) => { await page.route(/tiles\.openfreemap\.org/, (route) => route.abort()); await useSyntheticRecordings(page); await dismissTourPrompt(page); });

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

// The run is finished: all 10 rows, the summary line, and no Stop button.
const boardDone = async (page: Page) => {
  await expect(page.getByTestId("city-row")).toHaveCount(10, { timeout: 15_000 });
  await expect(page.getByText(/10 markets scored/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0);
};
// The playbook has finished streaming (heading + verification summary), or the Book has prepared every chapter.
// Without Qloo mode: the generic list and its banner are showing.
const withoutDone = async (page: Page) => {
  await expect(page.getByText("Generic LLM answer — no taste evidence")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("list", { name: "Generic ranking" })).toBeVisible();
};
const playbookDone = async (page: Page, city: string) => {
  await expect(page.getByRole("heading", { name: city }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/\d+ verified · \d+ removed/).first()).toBeVisible({ timeout: 15_000 });
};
const bookDone = async (page: Page) => {
  await expect(page.getByRole("heading", { name: "Market selection" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeVisible({ timeout: 30_000 });
};
const toInsights = async (page: Page) => {
  await page.getByRole("link", { name: /Taste/ }).first().click();
  await expect(page.getByTestId("boxscore-row")).toHaveCount(10);
};

// Ruling: every visible button/link/tab is at least 44x44. Excludes sr-only elements and MapLibre's own controls
// (.maplibregl-ctrl, attribution); city markers are checked.
const smallTargets = (page: Page) => page.evaluate(() => [...document.querySelectorAll("button, a, [role=tab]")]
  .filter((el) => !el.closest(".maplibregl-ctrl"))
  .map((el) => ({ el, r: el.getBoundingClientRect() }))
  .filter(({ el, r }) => r.width > 1 && r.height > 1 && getComputedStyle(el).clip === "auto" && !/\bsr-only\b/.test(el.className))
  .filter(({ r }) => r.height < 43.5 || r.width < 43.5)
  .map(({ el, r }) => `${el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`));

for (const path of ["/", "/tours/board?sample=1", "/tours/board?sample=long", "/tours/board?sample=1&mode=without", "/tours/board?sample=long&mode=without", "/insights"]) {
  test(`no horizontal scroll at this viewport: ${path}`, async ({ page }) => {
    await page.goto(path);
    if (path.includes("mode=without")) await withoutDone(page);
    else if (path.includes("sample")) await boardDone(page);
    await noHorizontalScroll(page);
  });
}

const NEW_ROUTES: Array<[string, (page: Page) => Promise<void>]> = [
  ["/tours/playbook/4005539?sample=1", (p) => playbookDone(p, "Guadalajara")],
  ["/tours/playbook/3464975?sample=long", (p) => playbookDone(p, "San Juan de los Lagos")],
  ["/tours/book?sample=1", bookDone],
  ["/tours/book?sample=long", bookDone],
];
for (const [path, done] of NEW_ROUTES) {
  test(`no horizontal scroll at 360px: ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(path);
    await done(page);
    await noHorizontalScroll(page);
  });
}

test("no horizontal scroll at 360px with long names on every screen (Review Focus 4)", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/tours/board?sample=long");
  await boardDone(page);
  await expect(page.getByTestId("city-row").getByText("Santiago de Querétaro").first()).toBeVisible(); // not the map marker label, which stays hidden until hover
  await noHorizontalScroll(page);
  await page.getByTestId("city-row").getByText("Santiago de Querétaro").first().click();
  await expect(page).toHaveURL(/\/tours\/playbook\/3995465\?sample=long/);
  await expect(page.getByRole("heading", { name: "Santiago de Querétaro" }).first()).toBeVisible();
  await noHorizontalScroll(page);
  await page.goBack();
  await boardDone(page);
  await toInsights(page);
  await expect(page.getByTestId("boxscore-row").filter({ hasText: "Santiago de Querétaro" })).toHaveCount(1);
  await noHorizontalScroll(page);
});

test.describe("touch targets are at least 44x44 on mobile", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "mobile"));
  test("landing", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await smallTargets(page)).toEqual([]);
  });
  test("board", async ({ page }) => {
    await page.goto("/tours/board?sample=1");
    await boardDone(page);
    expect(await smallTargets(page)).toEqual([]);
  });
  test("insights after a sample run", async ({ page }) => {
    await page.goto("/tours/board?sample=1");
    await boardDone(page);
    await toInsights(page);
    expect(await smallTargets(page)).toEqual([]);
  });
  for (const path of ["/tours/board?sample=1&mode=without", "/tours/board?sample=long&mode=without"]) {
    test(`Without Qloo: ${path}`, async ({ page }) => {
      await page.goto(path);
      await withoutDone(page);
      expect(await smallTargets(page)).toEqual([]);
    });
  }
  test("open strategist sheet: no horizontal scroll and 44px targets inside the dialog", async ({ page }) => {
    await page.goto("/tours/board?sample=1");
    await boardDone(page);
    await page.getByRole("button", { name: "Ask about this tour" }).click();
    const dialog = page.getByRole("dialog", { name: "Ask about this tour" });
    await expect(dialog).toBeVisible();
    await noHorizontalScroll(page);
    const small = await dialog.evaluate((root) => [...root.querySelectorAll("button, a, [role=tab], textarea, input")]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ el, r }) => r.width > 1 && r.height > 1 && !/\bsr-only\b/.test(el.className))
      .filter(({ r }) => r.height < 43.5 || r.width < 43.5)
      .map(({ el, r }) => `${el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`));
    expect(small).toEqual([]);
    await page.getByRole("button", { name: "Why is Guadalajara a hidden goldmine?" }).click();
    await expect(page.getByText(/Hidden goldmine verdict means/)).toBeVisible();
    await noHorizontalScroll(page);
  });
  // The strategist FAB must never sit on top of a sticky footer's buttons (Tour Board, Playbook, Book).
  const footerOccluded = (page: Page) => page.evaluate(() => {
    const out: string[] = [];
    const footers = [...document.querySelectorAll("*")].filter((el) => {
      const cs = getComputedStyle(el);
      return cs.position === "sticky" && cs.bottom !== "auto" && el.querySelector("button, a");
    });
    for (const f of footers) {
      for (const b of f.querySelectorAll("button, a")) {
        const r = b.getBoundingClientRect();
        if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > window.innerHeight) continue;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!hit || !b.contains(hit)) out.push(`${b.tagName} "${(b.textContent ?? "").trim().slice(0, 30)}" is covered by ${hit?.tagName} "${(hit?.getAttribute("aria-label") ?? hit?.textContent ?? "").trim().slice(0, 30)}"`);
      }
    }
    return { footers: footers.length, out };
  });
  for (const [path, done] of [["/tours/board?sample=1", boardDone], ["/tours/playbook/4005539?sample=1", NEW_ROUTES[0]![1]], ["/tours/book?sample=1", bookDone]] as Array<[string, (p: Page) => Promise<void>]>) {
    test(`strategist FAB does not cover the sticky footer: ${path}`, async ({ page }) => {
      await page.goto(path);
      await done(page);
      await expect(page.getByRole("button", { name: "Ask about this tour" })).toBeVisible();
      const res = await footerOccluded(page);
      expect(res.footers).toBeGreaterThan(0);
      expect(res.out).toEqual([]);
    });
  }
  for (const [path, done] of NEW_ROUTES) {
    test(`playbook and book: ${path}`, async ({ page }) => {
      await page.goto(path);
      await done(page);
      expect(await smallTargets(page)).toEqual([]);
    });
  }
});

// Desktop board header: the artist name shares a 5-column rail with the proof link, Stop and the agent chip. It once got flex-basis 0 and
// collapsed to a sliver while those three kept their width, so the name must stay fully readable (not truncated) with Stop showing.
test.describe("desktop board header", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop"));
  for (const path of ["/tours/board?sample=1", "/tours/board?showcase=1"]) {
    test(`artist name is not clipped while scoring: ${path}`, async ({ page }) => {
      await page.goto(path);
      // The recorded showcase opens finished; "Replay the agent" is how its step-by-step run (with Stop) is watched.
      if (path.includes("showcase")) await page.getByRole("button", { name: "Replay the agent" }).click({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: "Stop" })).toBeVisible({ timeout: 15_000 });
      const h1 = page.getByRole("heading", { level: 1 });
      const m = await h1.evaluate((el) => ({ w: el.clientWidth, sw: el.scrollWidth, text: el.textContent }));
      expect(m.w, `h1 "${m.text}" collapsed`).toBeGreaterThan(200);
      expect(m.sw, `h1 "${m.text}" truncated`).toBeLessThanOrEqual(m.w);
      await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0, { timeout: 30_000 });
      const after = await h1.evaluate((el) => ({ w: el.clientWidth, sw: el.scrollWidth }));
      expect(after.sw).toBeLessThanOrEqual(after.w);
    });
  }
});
