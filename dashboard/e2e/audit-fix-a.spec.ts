import { expect, type Page } from "@playwright/test";
import { test, dismissTourPrompt, useSyntheticRecordings } from "./fixtures";

// Audit A fixes (branch feat/audit-fix-a). Each test failed on the pre-fix code; see the commit messages for the failing lines.
test.beforeEach(async ({ page }) => { await page.route(/tiles\.openfreemap\.org/, (r) => r.abort()); await useSyntheticRecordings(page); await dismissTourPrompt(page); });

/** A working, in-memory team workspace whose snapshot carries statuses (so rows show status chips) and a little activity. */
async function workspaceWithStatuses(page: Page, statuses: Record<string, "confirmed" | "on_hold" | "considering" | "dropped">) {
  const at = Date.now() - 60_000;
  const snapshot = {
    ws: "e2eWorkspace0001", rev: 1, createdAt: at,
    statuses: Object.fromEntries(Object.entries(statuses).map(([id, status]) => [id, { status, name: "Dana", role: "Manager", at }])),
    threads: {}, overrides: {}, leads: {},
    activity: Object.entries(statuses).map(([id, status], i) => ({ id: `a${i}`, type: "status", cityId: id, name: "Dana", role: "Manager", text: status, at })),
  };
  await page.route("**/api/qloo/ws", (r) => r.fulfill({ json: { ws: snapshot.ws, snapshot } }));
  await page.route("**/api/qloo/ws/**", (r) => r.fulfill({ json: snapshot }));
}
const boardReady = async (page: Page, rows = 10) => {
  await expect(page.getByTestId("city-row")).toHaveCount(rows, { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0, { timeout: 30_000 });
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
};

for (const width of [1440, 1280]) {
  test(`1. board city names with a status chip keep their width at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await workspaceWithStatuses(page, { "5368361": "confirmed", "4671654": "on_hold", "3530597": "confirmed" });
    await page.goto("/tours/board?sample=1&ws=e2eWorkspace0001");
    await boardReady(page);
    await expect(page.getByTestId("status-chip").first()).toBeVisible();
    const bad = await page.getByTestId("city-name-text").evaluateAll((els) => els.map((e) => {
      const r = e.getBoundingClientRect();
      const longestWord = Math.max(...(e.textContent ?? "").split(/\s+/).map((w) => w.length));
      const lineH = parseFloat(getComputedStyle(e).lineHeight) || 20;
      return { t: e.textContent, w: Math.round(r.width), lines: Math.round(r.height / lineH), longestWord };
    }).filter((x) => x.lines > 2 || x.w < x.longestWord * 6));
    expect(bad, "no city name is squeezed into a narrow column").toEqual([]);
  });
}

test("2. every keyboard focus stop on the landing page shows a 2px outline", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "See the example tour" })).toBeVisible();
  const lacking: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    const r = await page.evaluate(() => {
      const e = document.activeElement as HTMLElement | null;
      if (!e || e === document.body) return null;
      const cs = getComputedStyle(e);
      return { id: `${e.tagName} ${(e.textContent ?? e.getAttribute("aria-label") ?? "").trim().slice(0, 30)}`, style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), shadow: cs.boxShadow, focusVisible: e.matches(":focus-visible") };
    });
    if (!r || seen.has(r.id)) continue;
    seen.add(r.id);
    if (r.focusVisible && !((r.style !== "none" && r.width >= 2) || (r.shadow !== "none" && /\d+px/.test(r.shadow)))) lacking.push(`${r.id}: outline ${r.style} ${r.width}px`);
  }
  expect(seen.size, "tabbed through several controls").toBeGreaterThan(5);
  expect(lacking, "focused controls without a visible indicator").toEqual([]);
});

test("5. replaying the agent keeps the page stable: focus on Stop, team bar stays, nav does not shift, counter says replaying", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await workspaceWithStatuses(page, {});
  await page.goto("/tours/board?showcase=1");
  await expect(page.getByTestId("city-row").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("team-bar")).toBeVisible();
  const navTop = () => page.evaluate(() => [...document.querySelectorAll("aside a, nav a")].filter((a) => /Tour Book|Charts|Budget/.test(a.textContent ?? "")).map((a) => Math.round(a.getBoundingClientRect().top)).join(","));
  const before = await navTop();
  await page.getByRole("button", { name: "Replay the agent" }).click();
  const stop = page.getByRole("button", { name: "Stop" });
  await expect(stop).toBeVisible();
  await expect(stop, "keyboard focus moves to Stop instead of falling to the body").toBeFocused();
  await expect(page.getByTestId("team-bar"), "team bar stays during the replay").toBeVisible();
  await expect(page.getByRole("button", { name: /Board · replaying/ }), "counter must not show a misleading number").toBeVisible();
  expect(await navTop(), "sidebar items keep their position").toBe(before);
  await expect(page.getByRole("button", { name: /Board · \d+ Qloo calls/ })).toBeVisible({ timeout: 30_000 });
});

test("6. budget inputs have a visible 1px border at 3:1 or more against the card", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/tours/budget?sample=1");
  const first = page.getByLabel("Artist fee, Guadalajara");
  await expect(first).toBeVisible({ timeout: 20_000 });
  const bad = await page.evaluate(() => {
    const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!); };
    const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const bgOf = (e: Element | null): number[] => { while (e) { const c = getComputedStyle(e).backgroundColor; if (c && !/rgba\(.*, 0\)|transparent/.test(c)) return rgb(c); e = e.parentElement; } return [0, 0, 0]; };
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLInputElement>("section input[type=text]")) {
      const cs = getComputedStyle(el);
      const w = parseFloat(cs.borderTopWidth);
      const b = rgb(cs.borderTopColor), card = bgOf(el.parentElement);
      const l1 = lum(b), l2 = lum(card);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      if (w < 1 || cs.borderTopStyle === "none" || ratio < 3) out.push(`${el.getAttribute("aria-label")}: ${w}px ${ratio.toFixed(2)}:1`);
    }
    return out;
  });
  expect(bad).toEqual([]);
});
