import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { test, dismissTourPrompt, isTeamOrStatsConsoleError, qlooDataCalls, useSyntheticRecordings, useWorkingWorkspace } from "./fixtures";

// E2E_BASE_URL set = the daily live run against the deployed site: real recordings, real gateway.
const LIVE = Boolean(process.env.E2E_BASE_URL);

// Console noise we ignore, and why: only errors tied to the map style/tile host (tiles.openfreemap.org). Local runs abort those requests so the
// suite never depends on the network; Chromium then logs "Failed to load resource: net::ERR_FAILED" for that URL (matched through the message
// location) and MapLibre reports the aborted fetch. Nothing else is ignored: a 404, a React warning or an uncaught exception fails the test.
const TILE_HOST = /openfreemap/i;
// Team workspace (/api/qloo/ws) and live stats (/api/qloo/stats/*) calls are deliberate and carry no Qloo, Gemini or Tavily data: `qlooDataCalls`
// drops them from the "recorded example makes zero calls" checks, and their 502s on the BFF-less fixtures dev server are not console failures.

test.beforeEach(async ({ page }) => {
  await dismissTourPrompt(page); // a returning visitor: the first-visit tour card would sit over the phone's sticky action footer
  if (!LIVE) {
    await page.route(/tiles\.openfreemap\.org/, (route) => route.abort());
    await useSyntheticRecordings(page);
  }
});

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function expectNoSeriousA11y(page: Page, where: string) {
  // Rows fade in with a spring: wait for running animations to finish so contrast is measured on settled pixels (motion stays on, as judges see it).
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${where}: ${v.id} (${v.impact}) ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), `axe on ${where}`).toEqual([]);
}

test("promoter judge path: landing → board → playbook → hold → book → proof", async ({ page }) => {
  test.setTimeout(120_000);
  const t0 = Date.now();
  const errors: string[] = [];
  const qloo: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && !TILE_HOST.test(m.text()) && !TILE_HOST.test(m.location().url) && !isTeamOrStatsConsoleError(m)) errors.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => { if (!TILE_HOST.test(e.message)) errors.push(`pageerror: ${e.message}`); });
  page.on("request", (r) => { if (r.url().includes("/api/qloo/") && (!LIVE || r.method() === "POST")) qloo.push(`${r.method()} ${r.url()}`); });

  // 1. Landing: three beats, then the showcase CTA.
  await page.goto("/");
  const beats = page.getByRole("list", { name: "The story in three beats" });
  await expect(beats).toBeVisible();
  await expect(beats.getByRole("listitem")).toHaveCount(3);
  expect(await noOverflow(page), "landing overflow").toBe(true);
  await expectNoSeriousA11y(page, "landing");
  await page.getByRole("link", { name: "See the example tour" }).click();

  // 2. Board: the hidden-goldmine city, named from the page.
  const rows = page.getByTestId("city-row");
  await expect(rows.first()).toBeVisible({ timeout: 20_000 });
  const goldmine = rows.filter({ hasText: "Hidden goldmine" }).first();
  await expect(goldmine).toBeVisible();
  const cityName = (await goldmine.getAttribute("data-city-name"))!;
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
  const proofLink = page.getByRole("main").getByRole("link", { name: /How we tested it/ }).first();
  await expect(proofLink).toHaveAttribute("href", "/proof");
  expect(await noOverflow(page), "playbook overflow").toBe(true);
  await expectNoSeriousA11y(page, "playbook");

  // 4. Back to the board, hold the dates, open the book.
  await page.goBack();
  await expect(rows.first()).toBeVisible();
  await page.getByRole("button", { name: "Review shortlist" }).click();
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
  expect(qlooDataCalls(qloo), LIVE ? "showcase must make zero POSTs to /api/qloo/" : "showcase must make zero /api/qloo/ calls").toEqual([]);
  expect(Date.now() - t0).toBeLessThan(120_000);
});

// ---- Plan 7 Task 2a: main-path correctness (synthetic showcase: a major-market row, close calls, an unplaced city, cities with no playbook) ----

const showcaseFixture = JSON.parse(readFileSync(path.resolve("src/test/fixtures/showcase.synthetic.json"), "utf8")) as { playbooks: Record<string, unknown>; boardEvents: Array<{ type: string; city?: { id: string; name: string } }> };
const unrecordedCity = () => showcaseFixture.boardEvents.flatMap((e) => (e.type === "city_scored" ? [e.city!] : [])).find((c) => !(c.id in showcaseFixture.playbooks))!;

async function openShowcaseBoard(page: Page) {
  await page.goto("/tours/board?showcase=1");
  await expect(page.getByTestId("city-row").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("city-row")).toHaveCount(showcaseFixture.boardEvents.filter((e) => e.type === "city_scored").length);
}

for (const width of [1280, 1024]) {
  test(`desktop board rows keep every city name readable at ${width}px, with chips on their own line`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await page.setViewportSize({ width, height: 800 });
    await openShowcaseBoard(page);
    // The fixture must exercise the rows that used to squeeze the name: a major-market seed and a close call.
    await expect(page.getByText("Major market").first()).toBeVisible();
    await expect(page.getByText("Close call").first()).toBeVisible();
    const rows = await page.getByTestId("city-row").evaluateAll((els) => els.map((el) => {
      const name = el.querySelector<HTMLElement>("[data-testid=city-name]")!;
      const text = el.querySelector<HTMLElement>("[data-testid=city-name-text]")!;
      const notes = el.querySelector<HTMLElement>("[data-testid=row-notes]");
      const bars = el.querySelector<HTMLElement>("[data-testid=bar-fanheat]")?.parentElement?.getBoundingClientRect();
      const nb = name.getBoundingClientRect();
      return {
        label: el.getAttribute("data-city-name"), text: text.textContent, width: Math.round(nb.width), truncated: text.scrollWidth > text.clientWidth + 1,
        notesBelow: notes ? notes.getBoundingClientRect().top >= nb.bottom - 1 : true,
        notesOverBars: notes && bars ? notes.getBoundingClientRect().right > bars.left && notes.getBoundingClientRect().left < bars.right && notes.getBoundingClientRect().top < bars.bottom && notes.getBoundingClientRect().bottom > bars.top : false,
      };
    }));
    for (const r of rows) {
      expect(r.text, `${r.label} name text`).toBe(r.label);
      expect(r.width, `${r.label} name width at ${width}`).toBeGreaterThanOrEqual(80);
      expect(r.truncated, `${r.label} name truncated at ${width}`).toBe(false);
      expect(r.notesBelow, `${r.label} notes under the name`).toBe(true);
      expect(r.notesOverBars, `${r.label} notes over the bars`).toBe(false);
    }
  });
}

test("mobile: the strategist button never covers a visible score, verdict pill or fan heat value on the board", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile");
  await openShowcaseBoard(page);
  const fab = page.getByRole("button", { name: "Ask about this tour" });
  await expect(fab).toBeVisible();
  const stops = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight / 200));
  for (let i = 0; i <= stops; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), i * 200);
    const hits = await page.evaluate(() => {
      const f = document.querySelector<HTMLElement>("[aria-label='Ask about this tour']")!.getBoundingClientRect();
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("[data-testid=row-score], [data-testid=row-chip], [data-testid=row-bar-value]")) {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.bottom < 0 || r.top > window.innerHeight) continue;
        const top = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).find((e) => !e.closest("[aria-label='Ask about this tour']"));
        if (!top || !el.contains(top) && !top.contains(el)) continue; // hidden under the sticky footer, not covered by the button
        const overlap = r.left < f.right && r.right > f.left && r.top < f.bottom && r.bottom > f.top;
        if (overlap) out.push(`${el.getAttribute("data-testid")} "${(el.textContent ?? "").trim()}" under the button`);
      }
      return out;
    });
    expect(hits, `scrollY ${i * 200}`).toEqual([]);
  }
});

test("showcase rows with no recorded playbook are not links; a direct URL explains instead of showing empty tiles", async ({ page }) => {
  await openShowcaseBoard(page);
  const missing = unrecordedCity();
  const row = page.locator(`[data-city-id="${missing.id}"]`);
  await expect(row.getByRole("button")).toHaveCount(0);
  const n = Object.keys(showcaseFixture.playbooks).length;
  await expect(page.getByText(`Playbooks are recorded for ${n} cities in this example. Try your own artist to open any city.`)).toBeVisible();
  await page.goto(`/tours/playbook/${missing.id}?showcase=1`);
  await expect(page.getByRole("heading", { name: missing.name })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(`Playbooks are recorded for ${n} cities in this example.`)).toBeVisible();
  await expect(page.getByText("—", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to the Tour Board" })).toHaveAttribute("href", "/tours/board?showcase=1");
  await expectNoSeriousA11y(page, "unrecorded playbook");
});

test("a playbook has How to win, Acts fans love and Advance & risks, and Back keeps ?showcase=1", async ({ page }) => {
  await openShowcaseBoard(page);
  const recorded = Object.keys(showcaseFixture.playbooks)[0]!;
  await page.locator(`[data-city-id="${recorded}"]`).getByRole("button").first().click();
  await expect(page).toHaveURL(/\/tours\/playbook\/.*showcase=1/);
  await expect(page.getByRole("tab", { name: "How to win" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("tab")).toHaveText(["How to win", "Acts fans love", "Advance & risks"]); // tabs renamed and Advance & risks added with the playbook tabs feature
  expect(await noOverflow(page), "playbook overflow").toBe(true);
  await expectNoSeriousA11y(page, "playbook tabs");
  await page.getByRole("link", { name: "Back to Tour Board" }).click();
  await expect(page).toHaveURL(/\/tours\/board\?showcase=1/);
  await expect(page.getByTestId("city-row").first()).toBeVisible();
});

// ---- Fix round 1 ----

test("mobile: the held playbook's primary action is never clipped, even for a long next-city name", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile");
  for (const url of ["/tours/playbook/4005539?sample=long", "/tours/playbook/3464975?sample=long"]) {
    await page.goto(url);
    const primary = page.getByTestId("primary-action");
    await expect(primary).toBeVisible({ timeout: 20_000 });
    const m = await primary.evaluate((el) => ({ text: el.textContent, sw: el.scrollWidth, cw: el.clientWidth, inner: [...el.querySelectorAll("span")].map((s) => s.scrollWidth - s.clientWidth) }));
    expect(m.text, url).toMatch(/^Next: /);
    expect(m.sw, `${url} "${m.text}" clipped`).toBeLessThanOrEqual(m.cw);
    for (const d of m.inner) expect(d).toBeLessThanOrEqual(0);
    expect(await noOverflow(page)).toBe(true);
  }
  await page.goto("/tours/playbook/4005539?sample=long");
  expect(await page.getByTestId("primary-action").textContent()).toContain("San Juan de los Lagos");
});

test("mobile: without a sticky footer (?mode=without) the strategist button leaves the last row readable", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile");
  await page.goto("/tours/board?showcase=1&mode=without");
  await expect(page.getByRole("list", { name: "Generic ranking" })).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const r = await page.evaluate(() => {
    const f = document.querySelector("[aria-label='Ask about this tour']")!.getBoundingClientRect();
    const items = [...document.querySelectorAll("[aria-label='Generic ranking'] li")];
    const last = items[items.length - 1]!.getBoundingClientRect();
    return { fabTop: f.top, fabBottom: f.bottom, fabLeft: f.left, lastTop: last.top, lastBottom: last.bottom, lastRight: last.right };
  });
  expect(r.fabBottom, "the button sits in the lifted position, above the tab bar and its gap").toBeLessThanOrEqual(812 - 80);
  const overlaps = r.fabTop < r.lastBottom && r.fabBottom > r.lastTop && r.fabLeft < r.lastRight;
  expect(overlaps, JSON.stringify(r)).toBe(false);
});

test("desktop 1024: the Hidden goldmine chip clears the score bars", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.setViewportSize({ width: 1024, height: 800 });
  await openShowcaseBoard(page);
  const gaps = await page.getByTestId("city-row").evaluateAll((els) => els.filter((el) => /Hidden goldmine/.test(el.textContent ?? "")).map((el) => {
    const bars = el.querySelector("[data-testid=bar-fanheat]")!.parentElement!.parentElement!.getBoundingClientRect();
    const chip = el.querySelector("[data-testid=row-chip]")!.getBoundingClientRect();
    return Math.round(chip.left - bars.right);
  }));
  expect(gaps.length).toBeGreaterThan(0);
  for (const g of gaps) expect(g).toBeGreaterThanOrEqual(8);
});

// ---- Plan 7 Task 2b: one thread, Markets → Decide → Playbook → Tour Book ----

function watch(page: Page) {
  const errors: string[] = [];
  const qloo: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && !TILE_HOST.test(m.text()) && !TILE_HOST.test(m.location().url) && !isTeamOrStatsConsoleError(m)) errors.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => { if (!TILE_HOST.test(e.message)) errors.push(`pageerror: ${e.message}`); });
  page.on("request", (r) => { if (r.url().includes("/api/qloo/") && (!LIVE || r.method() === "POST")) qloo.push(`${r.method()} ${r.url()}`); });
  return { errors, qloo };
}
const stepper = (page: Page) => page.getByRole("navigation", { name: "Primary" });
const stepState = (page: Page, id: string) => stepper(page).locator(`[data-step=${id}]`).getAttribute("data-state");

test("the four steps walk through the stepper: Markets, Decide, Playbook, Tour Book", async ({ page }, info) => {
  test.setTimeout(120_000);
  const { errors, qloo } = watch(page);
  const nav = stepper(page);

  // Markets
  await page.goto("/");
  await expect(nav.getByRole("link")).toHaveText([/Markets/, /Decide/, /Playbook/, /Tour Book/]);
  expect(await stepState(page, "markets"), "2e5057a: no active step on the landing doorway").toBe("todo");
  expect(await noOverflow(page), "markets overflow").toBe(true);
  await expectNoSeriousA11y(page, "markets");
  if (info.project.name === "mobile") {
    for (const link of await nav.getByRole("link").all()) expect((await link.boundingBox())!.height, "44 px stepper target").toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("link", { name: "See the example tour" }).click();

  // Decide
  await expect(page.getByTestId("city-row").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0, { timeout: 30_000 });
  expect(await stepState(page, "decide")).toBe("current");
  expect(await stepState(page, "markets")).toBe("done");
  expect(await noOverflow(page), "decide overflow").toBe(true);
  await expectNoSeriousA11y(page, "decide");

  // Playbook, through the stepper: the top-ranked recorded city when none was opened.
  await nav.getByRole("link", { name: /Playbook/ }).click();
  await expect(page).toHaveURL(/\/tours\/playbook\/[^?]+\?showcase=1/);
  await expect(page.getByRole("heading", { name: "Sponsors" }).first()).toBeVisible({ timeout: 20_000 });
  expect(await stepState(page, "playbook")).toBe("current");
  expect(await stepState(page, "decide")).toBe("done");
  expect(await noOverflow(page), "playbook overflow").toBe(true);
  await expectNoSeriousA11y(page, "playbook");
  const playbookUrl = page.url();

  // Tour Book
  await nav.getByRole("link", { name: /Tour Book/ }).click();
  await expect(page).toHaveURL(/\/tours\/book\?showcase=1/);
  await expect(page.getByText("Advance & sponsor pitch").first()).toBeVisible({ timeout: 30_000 });
  expect(await stepState(page, "book")).toBe("current");
  expect(await stepState(page, "playbook")).toBe("done");
  expect(await noOverflow(page), "book overflow").toBe(true);
  await expectNoSeriousA11y(page, "book");

  // Back through the stepper: Playbook returns to the city opened last, Decide keeps the run.
  await nav.getByRole("link", { name: /Playbook/ }).click();
  expect(page.url()).toBe(playbookUrl);
  await nav.getByRole("link", { name: /Decide/ }).click();
  await expect(page.getByTestId("city-row").first()).toBeVisible();
  await nav.getByRole("link", { name: /Markets/ }).click();
  await expect(page.getByRole("link", { name: "See the example tour" })).toBeVisible();

  expect(errors, "console/page errors").toEqual([]);
  expect(qlooDataCalls(qloo), "zero /api/qloo calls on the showcase thread").toEqual([]);
});

test("opens ready: a bare /tours/board is the example, 'Try your own artist' is one click to the form", async ({ page }) => {
  const { errors, qloo } = watch(page);
  await page.goto("/tours/board");
  await expect(page.getByTestId("city-row").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("Artist", { exact: true })).toHaveCount(0);
  await page.goto("/");
  await page.getByRole("link", { name: "Try your own artist" }).click();
  await expect(page.getByLabel("Artist", { exact: true })).toBeVisible();
  expect(await noOverflow(page), "form overflow").toBe(true);
  expect(errors, "console/page errors").toEqual([]);
  expect(qlooDataCalls(qloo)).toEqual([]);
});

test("with no run every step opens the example, never an empty page", async ({ page }) => {
  const { errors, qloo } = watch(page);
  await page.goto("/proof");
  await stepper(page).getByRole("link", { name: /Tour Book/ }).click();
  await expect(page.getByText("Advance & sponsor pitch").first()).toBeVisible({ timeout: 30_000 });
  await page.goto("/proof");
  await stepper(page).getByRole("link", { name: /Playbook/ }).click();
  await expect(page.getByRole("heading", { name: "Sponsors" }).first()).toBeVisible({ timeout: 20_000 });
  await page.goto("/proof");
  await stepper(page).getByRole("link", { name: /Decide/ }).click();
  await expect(page.getByTestId("city-row").first()).toBeVisible({ timeout: 20_000 });
  expect(errors, "console/page errors").toEqual([]);
  expect(qlooDataCalls(qloo)).toEqual([]);
});

test("Taste profile is a quiet board link and /insights opened directly shows the example's taste data", async ({ page }) => {
  const { errors, qloo } = watch(page);
  await page.goto("/insights");
  await expect(page.getByTestId("boxscore-row").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Score a Tour Board to see taste by market")).toHaveCount(0);
  expect(await noOverflow(page), "insights overflow").toBe(true);
  await expectNoSeriousA11y(page, "insights");
  await page.goto("/tours/board?showcase=1");
  await expect(page.getByTestId("city-row").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("link", { name: "Taste profile" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Compare taste" })).toHaveCount(0);
  expect(errors, "console/page errors").toEqual([]);
  expect(qlooDataCalls(qloo)).toEqual([]);
});

test("each board tab explains itself in one line", async ({ page }) => {
  await page.goto("/tours/board?showcase=1");
  await expect(page.getByTestId("city-row").first()).toBeVisible({ timeout: 20_000 });
  const note = page.getByTestId("mode-note");
  await expect(note).toHaveText("Ranked by winnability: fan heat and how winnable the city is, 50/50.");
  await page.getByRole("tab", { name: "Density-only" }).click();
  await expect(note).toHaveText("Same scores, sorted by fan heat only — the order a density-only tool would give.");
  await page.getByRole("tab", { name: "Without Qloo" }).click();
  await expect(note).toContainText("A generic LLM's city order, with no taste data."); // 7aa6588: the note matches Test A
});

test("preloading the next step loads a chunk and makes zero /api/qloo requests", async ({ page }) => {
  test.skip(LIVE, "chunk file names are hashed in the deployed build");
  const { qloo } = watch(page);
  const boardChunk = page.waitForRequest((r) => /TourBoard/.test(r.url()) && !r.url().includes("/api/"), { timeout: 20_000 });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "See the example tour" })).toBeVisible();
  await boardChunk; // requested by the visible primary control, with no click
  await page.waitForTimeout(500);
  expect(qlooDataCalls(qloo), "preload must not call Qloo").toEqual([]);
});

test("the board leads with where fan heat and winnability disagree", async ({ page }, info) => {
  if (!LIVE) await useWorkingWorkspace(page); // as in production, where the team bar is part of the header
  const { qloo } = watch(page);
  await page.goto("/tours/board?showcase=1");
  const section = page.getByTestId("moves-section");
  await expect(section.getByRole("heading", { name: "Where fan heat and winnability disagree" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0, { timeout: 30_000 });
  await expect(section.getByTestId("move-row").first().or(section.getByText("Fan heat and winnability agree on this board."))).toBeVisible();
  const visibleRows = await section.getByTestId("move-row").evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).length);
  expect(visibleRows, "phones show two moves, desktop three").toBeLessThanOrEqual(info.project.name === "mobile" ? 2 : 3);
  // The ranking controls must stay on the first screen. The ranked list itself used to start there too; since 24b2106 (artist title on its own row on
  // phones) and f4e678b (the team bar, 96 px on phones, in the header) its first row starts just below the fold (about 830-930 px at 375x812, 864 at
  // 1280x800), so the guard is the Ranking tabs. If the list should be back on the first screen, that is a layout change, not a spec change.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const tabsTop = await page.locator('[role="tablist"][aria-label="Ranking"]').evaluate((e) => e.getBoundingClientRect().top + window.scrollY);
  expect(tabsTop, "the Ranking tabs sit within the first viewport").toBeLessThan(page.viewportSize()!.height);
  const above = await page.evaluate(() => document.querySelector('[data-testid="moves-section"]')!.getBoundingClientRect().top < document.querySelector('[role="tablist"][aria-label="Ranking"]')!.getBoundingClientRect().top);
  expect(above, "the section sits above the tabs").toBe(true);
  expect(await noOverflow(page)).toBe(true);
  await expectNoSeriousA11y(page, "board moves section");
  const dir = process.env.SHOT_DIR;
  if (dir) await section.screenshot({ path: path.join(dir, `moves-${info.project.name}.png`) });
  expect(qlooDataCalls(qloo), "the recorded board makes no Qloo calls").toEqual([]);
});

// Layout shift: the stepper, the tab note and the Suspense fallbacks reserve their height.
for (const url of ["/tours/board", "/tours/board?showcase=1&mode=density"]) {
  test(`no layout jumps on the board (${url}): total layout shift < 0.1 after the replay settles`, async ({ page }) => {
    if (!LIVE) await useWorkingWorkspace(page); // see fixtures.ts: without it the team bar appears and vanishes on the BFF-less dev server
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number };
      w.__cls = 0;
      new PerformanceObserver((list) => { for (const e of list.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) w.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(url);
    await expect(page.getByTestId("city-row").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0, { timeout: 30_000 });
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
    await page.waitForTimeout(600);
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    console.log(`CLS ${url} ${page.viewportSize()!.width}px: ${cls.toFixed(4)}`);
    expect(cls, "total layout-shift score").toBeLessThan(0.1);
  });
}

test("the landing leads with the pitch: headline, protagonist and no overflow, axe clean, zero Qloo calls", async ({ page }, info) => {
  const qloo: string[] = [];
  page.on("request", (r) => { if (/\/api\/qloo/.test(r.url())) qloo.push(r.url()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Know which brands your artist's fans love in each city, before the sponsor meeting." })).toBeVisible();
  await expect(page.getByText("The scenario: venues are holding dates until Friday. Pick which 2 of 5 smaller markets to confirm.")).toBeVisible(); // 5cb6457 landing copy
  await expect(page.getByRole("link", { name: "How we tested it →" })).toBeVisible();
  await expect(page.getByText("Same engine for film press tours."), "632c95a dropped the unbacked film-press line").toHaveCount(0);
  expect(await noOverflow(page)).toBe(true);
  await expectNoSeriousA11y(page, "landing");
  const dir = process.env.SHOT_DIR;
  if (dir) await page.screenshot({ path: path.join(dir, `landing-${info.project.name.includes("mobile") ? "375" : "1280"}.png`), fullPage: true });
  expect(qlooDataCalls(qloo)).toEqual([]);
});

test("Try a routing replays the recorded routing: tagged cities, unmatched banner, zero Qloo calls, axe clean, no overflow", async ({ page }, info) => {
  const qloo: string[] = [];
  const errors: string[] = [];
  page.on("request", (r) => { if (/\/api\/qloo/.test(r.url())) qloo.push(r.url()); });
  page.on("console", (m) => { if (m.type() === "error" && !TILE_HOST.test(m.text()) && !TILE_HOST.test(m.location().url) && !isTeamOrStatsConsoleError(m)) errors.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => { if (!TILE_HOST.test(e.message)) errors.push(`pageerror: ${e.message}`); });
  const shot = async (name: string) => { const dir = process.env.SHOT_DIR; if (dir) await page.screenshot({ path: path.join(dir, `${name}-${info.project.name.includes("mobile") ? "375" : "1280"}.png`), fullPage: true }); };

  await page.goto("/");
  const link = page.getByRole("link", { name: "Try a routing" });
  test.skip(LIVE && (await link.count()) === 0, "the deployed recording has no routing yet");
  await expect(link).toBeVisible();
  expect(await noOverflow(page), "landing overflow").toBe(true);
  await expectNoSeriousA11y(page, "landing with Try a routing");
  await shot("landing-routing");
  await link.click();

  await expect(page).toHaveURL(/\/tours\/board\?showcase=routing/);
  const rows = page.getByTestId("city-row");
  await expect(rows.first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0, { timeout: 30_000 });
  const n = await rows.count();
  expect(n).toBeGreaterThanOrEqual(2);
  await expect(page.getByText("Your routing", { exact: true })).toHaveCount(n);
  await expect(page.getByText("Major market", { exact: true })).toHaveCount(0);
  const banner = page.getByText(/^Not in our city list: .+\. Check the spelling or add the country\.$/);
  if (!LIVE) await expect(banner).toBeVisible();
  expect(await noOverflow(page), "routing board overflow").toBe(true);
  await expectNoSeriousA11y(page, "routing board");
  await shot("board-routing");

  // A recorded playbook opens with the routing query; the rest of the journey is the same pages.
  const openable = rows.locator("button");
  await openable.first().click();
  await expect(page).toHaveURL(/\/tours\/playbook\/[^?]+\?showcase=routing/);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  expect(await noOverflow(page), "routing playbook overflow").toBe(true);
  await page.getByRole("link", { name: /Tour Book/ }).first().click();
  await expect(page).toHaveURL(/\/tours\/book\?showcase=routing/);
  await expect(page.getByRole("heading", { name: "Market selection" })).toBeVisible({ timeout: 20_000 });
  expect(await noOverflow(page), "routing book overflow").toBe(true);
  expect(qlooDataCalls(qloo), "the recorded routing makes zero /api/qloo calls").toEqual([]);
  expect(errors).toEqual([]);
});

test("Paste your cities: the textarea, the cap message and no overflow, axe clean", async ({ page }, info) => {
  test.skip(LIVE, "form-only check, local run");
  await page.goto("/tours/board?new=1");
  const ta = page.getByLabel("Paste your cities");
  await expect(ta).toBeVisible();
  await expect(page.getByText(/One city per line/)).toBeVisible();
  await ta.fill(Array.from({ length: 10 }, (_, i) => `Town ${i}, MX`).join("\n"));
  await expect(page.getByText("Up to 8 cities — the first 8 will be used.")).toBeVisible();
  expect(await noOverflow(page), "brief form overflow").toBe(true);
  await expectNoSeriousA11y(page, "brief form with pasted cities");
  const dir = process.env.SHOT_DIR;
  if (dir) await page.screenshot({ path: path.join(dir, `brief-paste-${info.project.name.includes("mobile") ? "375" : "1280"}.png`), fullPage: true });
});
