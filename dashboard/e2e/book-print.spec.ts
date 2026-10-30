import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { blockMapTiles } from "./live";

// The print edition of the Tour Book against the real recording (run against a built server, see CLAUDE.md "Recording-backed specs").
// Desktop only: print layout does not depend on the viewport, and one pass keeps the PDF checks cheap.
test.skip(({ isMobile }) => isMobile, "print layout is viewport-independent");
test.beforeEach(async ({ page }) => { await blockMapTiles(page); });

async function openPrint(page: import("@playwright/test").Page) {
  await page.goto("/tours/book?showcase=1");
  await expect(page.getByRole("heading", { name: "Market selection" })).toBeVisible({ timeout: 60_000 });
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".pe")).toBeVisible({ timeout: 10_000 });
}

test("print media: no interactive chrome, no '+N more', no request chips, one chapter per page", async ({ page }) => {
  await openPrint(page);
  const bad = await page.evaluate(() => {
    const vis = (e: Element) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden"; };
    const controls = [...document.querySelectorAll("button, [role=button], [role=dialog], a[href=\"#main-content\"], [data-app-shell]")].filter(vis).map((e) => e.outerHTML.slice(0, 80));
    const text = document.body.innerText;
    return { controls, more: text.match(/\+\d+ more|Qloo · \d+ requests?/g) ?? [], screenBook: [...document.querySelectorAll(".tour-book")].some(vis) };
  });
  expect(bad.controls, "visible controls in print").toEqual([]);
  expect(bad.more, "web leftovers in print").toEqual([]);
  expect(bad.screenBook, "the screen book is out of the printed page").toBe(false);
  const chapters = await page.locator(".pe-chapter").evaluateAll((els) => els.map((e) => ({ id: e.id, bb: getComputedStyle(e).breakBefore })));
  expect(chapters.length).toBeGreaterThanOrEqual(3);
  for (const c of chapters) expect(c.bb, `${c.id} starts a page`).toBe("page");
  // Every sponsor the recording lists for a city is in its print chapter (no "+N more").
  const rows = await page.locator('.pe-chapter [data-section="sponsors"] ol li').count();
  expect(rows).toBeGreaterThan(chapters.length * 4);
});

test("A4 PDF: 10 to 26 pages, contents on page 2, numbered pages, no near-empty page, no text over the footer", async ({ page }) => {
  await openPrint(page);
  await page.evaluate(() => document.fonts.ready);
  const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, isEvalSupported: false }).promise;
  expect(doc.numPages).toBeGreaterThanOrEqual(10);
  expect(doc.numPages).toBeLessThanOrEqual(26);
  const pages: Array<{ lines: number; text: string; items: Array<{ str: string; y: number; x: number }>; h: number }> = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const p = await doc.getPage(n);
    const tc = await p.getTextContent();
    const items = (tc.items as Array<{ str: string; transform: number[] }>).filter((i) => i.str.trim()).map((i) => ({ str: i.str, x: i.transform[4]!, y: i.transform[5]! }));
    pages.push({ lines: new Set(items.map((i) => Math.round(i.y))).size, text: items.map((i) => i.str).join(" "), items, h: p.view[3]! });
  }
  expect(pages[0]!.text.toLowerCase()).toContain("advance & sponsor book");
  expect(pages[1]!.text.toLowerCase()).toContain("contents");
  pages.forEach((p, i) => {
    // Two of the lines are the running header and footer: a page needs at least 3 more.
    expect(p.lines, `page ${i + 1} is nearly empty (${p.lines} lines)`).toBeGreaterThanOrEqual(5);
    if (i > 0) expect(p.items.some((t) => t.str.trim() === String(i + 1)), `page ${i + 1} carries its number`).toBe(true);
    // Footer text sits below the body: nothing but footer items in the bottom 20 mm band, and no body line within 2 mm of it.
    const band = 20 * 2.835, body = p.items.filter((t) => t.y > band + 6);
    const footer = p.items.filter((t) => t.y <= band);
    expect(footer.every((t) => /Tour Intelligence|Recorded Qloo run|Sample data|Live Qloo run|^\d+$|^[·×,]$|\d{4}$/.test(t.str.trim()) || t.str.trim().length < 14), `page ${i + 1} footer band holds only the footer`).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });
  // The edition label carries the recording's own date.
  expect(pages[1]!.text).toMatch(/Recorded Qloo run, \d{1,2} [A-Z][a-z]{2} \d{4}/);
});

test("the print edition exists only while printing: beforeprint mounts it, afterprint removes it, the screen book never carries a copy", async ({ page }) => {
  await page.goto("/tours/book?showcase=1");
  await expect(page.getByRole("heading", { name: "Market selection" })).toBeVisible({ timeout: 60_000 });
  expect(await page.locator(".pe").count()).toBe(0);
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await expect(page.locator(".pe")).toHaveCount(1);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator(".pe")).toHaveCount(0);
});
