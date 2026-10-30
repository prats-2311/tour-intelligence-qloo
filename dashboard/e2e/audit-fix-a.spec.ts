import fs from "node:fs";
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

for (const width of [1440, 1280]) {
  test(`10. the breadcrumb on the board is fully visible at ${width} (not under the top bar or the board)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tours/board?sample=1");
    await boardReady(page);
    const r = await page.evaluate(() => {
      const nav = document.querySelector("nav[aria-label=Breadcrumb]")!;
      const bad: string[] = [];
      for (const el of nav.querySelectorAll("a, span[aria-current]")) {
        const b = el.getBoundingClientRect();
        for (const [x, y] of [[b.left + 2, b.top + 2], [b.right - 2, b.bottom - 2]] as const) {
          const hit = document.elementFromPoint(x, y);
          if (!hit || !nav.contains(hit)) bad.push(`${el.textContent} covered by ${(hit as HTMLElement | null)?.tagName}.${String((hit as HTMLElement | null)?.className).slice(0, 40)}`);
        }
      }
      return bad;
    });
    expect(r, "every breadcrumb corner is hit-testable").toEqual([]);
  });
}

test("7. printing the Tour Book hides the app chrome", async ({ page }) => {
  await page.goto("/tours/book?sample=1");
  await expect(page.getByRole("heading", { name: "Market selection" })).toBeVisible({ timeout: 30_000 });
  await page.emulateMedia({ media: "print" });
  const shown = await page.evaluate(() => {
    const vis = (e: Element) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden"; };
    const q: Record<string, string> = {
      "hamburger bar": "[data-mobile-bar]", breadcrumbs: "nav[aria-label=Breadcrumb]", "recorded/sample banner": "[data-app-chrome]",
      "ask FAB": 'button[aria-label="Ask about this tour"], button[aria-label="Ask the strategist"]', sidebar: "aside[aria-label='Site sections']", "top bar": "header[data-app-shell]", toasts: "[role=status].fixed",
    };
    return Object.entries(q).filter(([, sel]) => [...document.querySelectorAll(sel)].some(vis)).map(([k]) => k);
  });
  expect(shown, "app chrome visible in print").toEqual([]);
});

for (const url of ["/tours/board?sample=1", "/tours/board?sample=long", "/tours/board?showcase=1"]) {
  test(`9. move reasons are never sliced mid-line (${url})`, async ({ page }, info) => {
    // The real recording (read-only, local) has the longest reasons; fall back to the synthetic one when it is not on this machine.
    const real = "/Users/prateeksrivastava/Documents/qloo/tour-intel-proof-publish/private-data/showcase.json";
    if (url.includes("showcase") && fs.existsSync(real)) await page.route("**/api/recordings/showcase", (r) => r.fulfill({ path: real, contentType: "application/json" }));
    await page.goto(url);
    await expect(page.getByTestId("move-row").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0, { timeout: 30_000 });
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
    const bad = await page.evaluate(() => [...document.querySelectorAll("[data-testid=move-reason]")].filter((e) => (e as HTMLElement).offsetParent !== null).flatMap((e) => {
      const li = e.closest("li")!.getBoundingClientRect(), r = e.getBoundingClientRect();
      const sliced = r.bottom > li.bottom + 0.5;
      const truncated = e.scrollHeight > e.clientHeight + 1;
      return sliced || (truncated && !e.getAttribute("title")) ? [`${(e.textContent ?? "").slice(0, 40)} sliced=${sliced} truncatedWithoutTitle=${truncated && !e.getAttribute("title")}`] : [];
    }));
    expect(bad, `${info.project.name}: reason text clipped`).toEqual([]);
  });
}

test("8. the board defines its terms: legend row, labelled bars, tab definitions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/tours/board?sample=1");
  await boardReady(page);
  const legend = page.getByTestId("board-legend");
  await expect(legend).toBeVisible();
  const text = (await legend.innerText()).replace(/\s+/g, " ");
  expect(text).toContain("Fan heat: how much this artist's fans over-index here");
  expect(text).toContain("Activation: sponsor, venue and local fit");
  expect(text).toContain("Winnability: 50/50 of the two");
  await expect(legend.locator("[data-bar-key=fanheat]")).toBeVisible();
  await expect(legend.locator("[data-bar-key=activation]")).toBeVisible();
  for (const name of ["Density-only", "Without Qloo"]) expect(await page.getByRole("tab", { name }).getAttribute("title"), `${name} tab definition`).toMatch(/^[^:]+: .{20,}/);
});

/** Text contrast (WCAG 1.4.3) of every visible text node against its effective background; returns the elements below AA. */
const lowContrast = (page: Page) => page.evaluate(() => {
  const parse = (c: string): number[] | null => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (m) { const p = m[1]!.split(/[ ,/]+/).map(Number); return [p[0]!, p[1]!, p[2]!, p[3] === undefined ? 1 : p[3]]; }
    const mm = c.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?/);
    return mm ? [+mm[1]! * 255, +mm[2]! * 255, +mm[3]! * 255, mm[4] === undefined ? 1 : +mm[4]] : null;
  };
  const over = (f: number[], b: number[]) => [f[0]! * f[3]! + b[0]! * (1 - f[3]!), f[1]! * f[3]! + b[1]! * (1 - f[3]!), f[2]! * f[3]! + b[2]! * (1 - f[3]!), 1];
  const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!); };
  const bgOf = (e: Element): number[] | null => {
    const layers: number[][] = [];
    let n: Element | null = e;
    while (n) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage !== "none" && n !== document.body) return null;
      const c = parse(cs.backgroundColor);
      if (c && c[3]! > 0) { layers.push(c); if (c[3]! >= 1) break; }
      n = n.parentElement;
    }
    let b = [28, 27, 24, 1];
    if (layers.length && layers[layers.length - 1]![3]! >= 1) b = layers.pop()!;
    while (layers.length) b = over(layers.pop()!, b);
    return b;
  };
  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of document.body.querySelectorAll("*")) {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    if (r.width <= 0 || r.height <= 0 || cs.visibility === "hidden" || cs.display === "none" || e.closest(".maplibregl-map, .sr-only") || /\bsr-only\b/.test(String((e as HTMLElement).className))) continue;
    if (![...e.childNodes].some((x) => x.nodeType === 3 && (x.textContent ?? "").trim())) continue;
    const fg = parse(cs.color), bg = bgOf(e);
    if (!fg || !bg) continue;
    let eo = 1; for (let n: Element | null = e; n && n !== document.body; n = n.parentElement) eo *= +getComputedStyle(n).opacity;
    if (eo < 0.05) continue; // fully transparent (tooltips before hover)
    const f = over([fg[0]!, fg[1]!, fg[2]!, fg[3]! * eo], bg);
    const L1 = lum(f), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const fs = parseFloat(cs.fontSize), large = fs >= 24 || (fs >= 18.66 && +cs.fontWeight >= 700);
    if (ratio < (large ? 3 : 4.5)) {
      const k = `${e.tagName}${(e.textContent ?? "").trim().slice(0, 30)}`;
      if (!seen.has(k)) { seen.add(k); out.push(`${ratio.toFixed(2)}:1 "${(e.textContent ?? "").trim().slice(0, 30)}" (${e.tagName.toLowerCase()}${(e as HTMLElement).dataset.testid ? `[${(e as HTMLElement).dataset.testid}]` : ""})`); }
    }
  }
  return out;
});

for (const [name, url] of [["landing", "/"], ["board", "/tours/board?sample=1"], ["charts", "/tours/insights?sample=1&ws=e2eWorkspace0001"], ["budget", "/tours/budget?sample=1"], ["book", "/tours/book?sample=1"]] as const) {
  test(`11. text contrast is at least AA on ${name}`, async ({ page }) => {
    await workspaceWithStatuses(page, { "5368361": "confirmed", "4671654": "on_hold", "3530597": "dropped" });
    await page.goto(url);
    if (name === "board") await boardReady(page);
    else if (name === "charts") await expect(page.getByRole("heading", { name: "Verdict mix" })).toBeVisible({ timeout: 20_000 });
    else if (name === "book") await expect(page.getByRole("heading", { name: "Market selection" })).toBeVisible({ timeout: 30_000 });
    else if (name === "budget") await expect(page.getByLabel("Artist fee, Guadalajara")).toBeVisible({ timeout: 20_000 });
    else await expect(page.getByRole("link", { name: "See the example tour" })).toBeVisible();
    await page.waitForTimeout(500);
    expect(await lowContrast(page)).toEqual([]);
  });
}

const small = (page: Page, sel: string) => page.evaluate((s) => [...document.querySelectorAll(s)]
  .map((el) => ({ el, r: el.getBoundingClientRect() })).filter(({ r }) => r.width > 0 && r.height > 0)
  .filter(({ r }) => r.height < 43.5 || r.width < 43.5)
  .map(({ el, r }) => `${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`), sel);

test("13. breadcrumbs, ranking tabs and map markers are at least 44x44 on the board at 1440", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/tours/board?sample=1");
  await boardReady(page);
  expect(await small(page, "nav[aria-label=Breadcrumb] a, [role=tab], .maplibregl-marker button")).toEqual([]);
});
test("13. chart scatter markers are at least 44x44", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/tours/insights?sample=1");
  await expect(page.getByRole("heading", { name: "Verdict mix" })).toBeVisible({ timeout: 20_000 });
  const n = await page.locator("[data-tour=quadrant] a.absolute, [data-tour=quadrant] button.absolute").count();
  expect(n, "scatter has markers").toBeGreaterThan(3);
  expect(await small(page, "[data-tour=quadrant] a.absolute, [data-tour=quadrant] button.absolute")).toEqual([]);
});

test("15. a chart marker with no playbook says so when pressed, and Reset filters is disabled with nothing to reset", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/tours/insights?sample=1");
  await expect(page.getByRole("heading", { name: "Verdict mix" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Reset filters" })).toBeDisabled();
  const marker = page.locator("[data-tour=quadrant] button.absolute").first();
  await marker.click();
  await expect(page.getByRole("tooltip")).toContainText(/No playbook/);
});
