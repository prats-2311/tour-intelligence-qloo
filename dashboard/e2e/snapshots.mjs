// Not a spec: `node e2e/snapshots.mjs` (dev server on :5173 with VITE_QLOO_FIXTURES=1) writes rendered HTML + screenshots for the lint gate.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("test-results/html", { recursive: true });
mkdirSync("test-results/shots", { recursive: true });
const routes = { landing: "/", board: "/tours/board?sample=1", insights: "/insights", campaign: "/campaign" }; // order matters: insights follows board
const browser = await chromium.launch();
for (const [vp, size] of [["mobile", { width: 375, height: 812 }], ["desktop", { width: 1280, height: 800 }]]) {
  const page = await (await browser.newContext({ viewport: size, deviceScaleFactor: vp === "mobile" ? 2 : 1 })).newPage();
  for (const [name, path] of Object.entries(routes)) {
    if (name === "insights") { // client-side nav keeps the sample run in the provider
      await page.getByRole("link", { name: /Insights/ }).first().click();
      await page.getByTestId("boxscore-row").first().waitFor({ timeout: 15000 });
    } else await page.goto(`http://localhost:5173${path}`);
    if (name === "board") await page.getByTestId("city-row").first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(800);
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
