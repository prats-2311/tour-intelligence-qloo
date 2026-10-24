// Not a spec. Two modes:
//  1. `node e2e/snapshots.mjs` (dev server on :5173 with VITE_QLOO_FIXTURES=1): rendered HTML + screenshots for the lint gate (below).
//  2. `node e2e/snapshots.mjs --base <url> --out <dir>`: the showcase run, captioned PNGs of the promoter path at 1280x800 and 390x844 for
//     Devpost/README. Against a localhost base it serves the committed synthetic recordings (never the real ones); against the deployed
//     site it shows the real recording. These are our own product UI, not Qloo response data.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
if (arg("base") || arg("out")) {
  const base = arg("base") ?? `http://localhost:${process.env.E2E_PORT ?? 5173}`;
  const out = path.resolve(arg("out") ?? "test-results/screens");
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base);
  mkdirSync(out, { recursive: true });
  const fixtures = path.resolve("src/test/fixtures");
  const captions = {};
  const browser = await chromium.launch();
  for (const [vp, size] of [["desktop", { width: 1280, height: 800 }], ["mobile", { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: vp === "mobile" ? 2 : 1, baseURL: base });
    const page = await ctx.newPage();
    if (local) {
      await page.route(/tiles\.openfreemap\.org/, (r) => r.abort());
      await page.route("**/api/recordings/showcase", (r) => r.fulfill({ path: path.join(fixtures, "showcase.synthetic.json"), contentType: "application/json" }));
      await page.route("**/api/recordings/backtest", (r) => r.fulfill({ path: path.join(fixtures, "backtest.synthetic.json"), contentType: "application/json" }));
      await page.route(/\/api\/campaigns$/, (r) => r.fulfill({ json: { campaigns: [] } }));
    }
    let n = 0;
    // Bounded waits: a missing signal costs at most the timeout and logs a warning; it never hangs the run.
    const settle = async () => {
      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"), null, { timeout: 5000 }).catch(() => console.warn("  warn: animations still running"));
      await page.waitForTimeout(400); // layout-animated tab pill and number tickers finish just after getAnimations() goes idle
    };
    const mapReady = async () => { // TourMap sets data-map-ready="true" on its root once MapLibre is idle (tiles drawn). Older builds lack it.
      if (!(await page.locator("[data-map-ready]").count())) { console.warn("  warn: no data-map-ready on this build; waiting a fixed 6s for tiles"); return page.waitForTimeout(6000); }
      await page.waitForSelector('[data-map-ready="true"]', { timeout: 20000 }).catch(() => console.warn("  warn: map not idle after 20s"));
    };
    // The showcase replay has finished: no Stop button, no "still scoring", and the scored-markets summary is showing.
    const replayDone = async () => {
      await page.getByRole("button", { name: "Stop" }).waitFor({ state: "detached", timeout: 60000 });
      await page.getByText(/\d+ markets? scored/).first().waitFor({ timeout: 30000 });
      await page.getByText("still scoring").waitFor({ state: "detached", timeout: 30000 });
    };
    // Full-page captures lay fixed bottom chrome (nav bar, floating Strategist button) over the middle of the image: hide it for the capture only.
    const withoutFixedChrome = async (fn) => {
      const hidden = await page.evaluate(() => {
        const els = [...document.querySelectorAll("body *")].filter((el) => {
          const cs = getComputedStyle(el);
          // fixed chrome anywhere along the bottom (nav bar, lifted FAB) and sticky bottom footers (they also sit mid-image in a full-page shot)
          return cs.visibility !== "hidden" && ((cs.position === "fixed" && el.getBoundingClientRect().bottom > window.innerHeight / 2) || (cs.position === "sticky" && cs.bottom !== "auto"));
        });
        els.forEach((el) => { el.dataset.snapHidden = el.style.visibility || "-"; el.style.visibility = "hidden"; });
        return els.length;
      });
      try { return await fn(); } finally {
        if (hidden) await page.evaluate(() => document.querySelectorAll("[data-snap-hidden]").forEach((el) => { el.style.visibility = el.dataset.snapHidden === "-" ? "" : el.dataset.snapHidden; delete el.dataset.snapHidden; }));
      }
    };
    const shot = async (name, caption, fullPage = true) => {
      await settle();
      const file = `${String(++n).padStart(2, "0")}-${name}-${vp}.png`;
      await (fullPage ? withoutFixedChrome : (f) => f())(() => page.screenshot({ path: path.join(out, file), fullPage }));
      captions[file] = caption;
      console.log("wrote", path.join(out, file));
    };
    await page.goto("/");
    await page.getByRole("heading", { level: 1 }).waitFor();
    await shot("landing", "Landing: the story in three beats and the showcase tour");
    await page.getByRole("link", { name: "Try the showcase tour" }).click();
    const rows = page.getByTestId("city-row");
    await rows.first().waitFor({ timeout: 30000 });
    await replayDone();
    await mapReady();
    await shot("board-winnability", "Tour Board ranked by winnability, with the hidden goldmine marked");
    await page.getByRole("tab", { name: "Without Qloo" }).click();
    await page.getByText("Generic LLM answer — no taste evidence").waitFor({ timeout: 15000 });
    await page.getByRole("list", { name: "Generic ranking" }).waitFor({ timeout: 30000 });
    await page.getByText("Waiting for the board to finish").waitFor({ state: "detached", timeout: 30000 });
    await mapReady();
    await shot("board-without-qloo", "The same cities ranked without Qloo: a generic list, no verdicts");
    await page.getByRole("tab", { name: "Winnability" }).click();
    await rows.first().waitFor();
    await replayDone();
    await rows.filter({ hasText: "Hidden goldmine" }).first().getByRole("button").first().click();
    await page.getByRole("heading", { name: "Sponsors" }).first().waitFor({ timeout: 30000 });
    await page.getByText(/\d+ verified · \d+ removed/).first().waitFor({ timeout: 30000 });
    await shot("playbook-hidden-goldmine", "City playbook for the hidden goldmine: sponsors, merch, venue and co-billing, checked against evidence");
    await page.goBack();
    await rows.first().waitFor();
    await page.getByRole("button", { name: "Hold these dates" }).click();
    await page.getByRole("link", { name: "Open Tour Book" }).click();
    await page.getByText("Advance & sponsor pitch").first().waitFor({ timeout: 30000 });
    await shot("tour-book-cover", "Tour Book cover: the advance and sponsor pitch", false);
    await page.goto("/proof");
    await page.getByRole("heading", { name: "What this shows" }).waitFor();
    await shot("proof", "Proof: both backtest runs, checked against real tours");
    await ctx.close();
  }
  writeFileSync(path.join(out, "captions.json"), JSON.stringify(captions, null, 1));
  await browser.close();
  process.exit(0);
}
mkdirSync("test-results/html", { recursive: true });
mkdirSync("test-results/shots", { recursive: true });
const routes = { landing: "/", board: "/tours/board?sample=1", insights: "/insights", campaign: "/campaign", playbook: "/tours/playbook/4005539?sample=1", book: "/tours/book?sample=1", without: "/tours/board?sample=1&mode=without", strategist: "/tours/board?sample=1" }; // order matters: insights follows board; playbook and book load their own sample run
const browser = await chromium.launch();
for (const [vp, size] of [["mobile", { width: 375, height: 812 }], ["desktop", { width: 1280, height: 800 }]]) {
  const page = await (await browser.newContext({ viewport: size, deviceScaleFactor: vp === "mobile" ? 2 : 1 })).newPage();
  for (const [name, path] of Object.entries(routes)) {
    if (name === "insights") { // client-side nav keeps the sample run in the provider
      await page.getByRole("link", { name: /Insights/ }).first().click();
      await page.getByTestId("boxscore-row").first().waitFor({ timeout: 15000 });
    } else await page.goto(`http://localhost:${process.env.E2E_PORT ?? 5173}${path}`);
    if (name === "board") {
      await page.getByText(/10 markets scored/).waitFor({ timeout: 15000 });
      await page.getByRole("button", { name: "Stop" }).waitFor({ state: "detached", timeout: 15000 });
    }
    if (name === "playbook") await page.getByText(/\d+ verified · \d+ removed/).first().waitFor({ timeout: 15000 });
    if (name === "book") await page.getByRole("button", { name: "Download PDF" }).waitFor({ timeout: 30000 });
    if (name === "without") await page.getByText("Generic LLM answer — no taste evidence").waitFor({ timeout: 15000 });
    if (name === "strategist") { // open panel with a finished sample answer and tool chips
      await page.getByText(/10 markets scored/).waitFor({ timeout: 15000 });
      await page.getByRole("button", { name: /Ask the strategist|Strategist/ }).first().click();
      await page.getByRole("button", { name: "Why is Guadalajara a hidden goldmine?" }).click();
      await page.getByText(/Hidden goldmine verdict means/).waitFor({ timeout: 15000 });
    }
    if (name === "landing") await page.getByRole("heading", { level: 1 }).waitFor();
    if (name === "campaign") await page.waitForLoadState("networkidle");
    if (vp === "desktop") {
      // Markup only: strip dev-server <style>/<script> (the whole Tailwind/MapLibre sheet) so the lint sees what the route actually uses.
      const markup = await page.evaluate(() => {
        const c = document.body.cloneNode(true);
        c.querySelectorAll("script,style,svg path").forEach((n) => n.remove());
        return c.outerHTML;
      });
      writeFileSync(`test-results/html/${name}.html`, `<!doctype html><html><body>${markup}</body></html>`);
      const used = await page.evaluate(() => {
        const out = { shadows: new Set(), gradients: new Set(), fonts: new Set() };
        for (const el of document.querySelectorAll("body *")) {
          if (el.closest(".maplibregl-map")) continue;
          const cs = getComputedStyle(el);
          if (cs.boxShadow !== "none") out.shadows.add(`${el.tagName}.${String(el.className).slice(0, 60)} :: ${cs.boxShadow.slice(0, 60)}`);
          if (cs.backgroundImage.includes("gradient")) out.gradients.add(`${el.tagName}.${String(el.className).slice(0, 60)}`);
          out.fonts.add(cs.fontFamily.split(",")[0]);
        }
        return { shadows: [...out.shadows], gradients: [...out.gradients], fonts: [...out.fonts] };
      });
      writeFileSync(`test-results/html/${name}.computed.json`, JSON.stringify(used, null, 1));
    }
    await page.screenshot({ path: `test-results/shots/${name}-${vp}.png`, fullPage: true });
  }
}
await browser.close();
