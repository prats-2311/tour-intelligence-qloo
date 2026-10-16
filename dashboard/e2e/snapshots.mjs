// Not a spec: `node e2e/snapshots.mjs` (dev server on :5173 with VITE_QLOO_FIXTURES=1) writes rendered HTML + screenshots for the lint gate.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
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
