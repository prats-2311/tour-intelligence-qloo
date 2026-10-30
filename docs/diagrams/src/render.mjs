// Renders each docs/diagrams/src/*.html (except base) to ../<name>.png (1500x1000) and ../<name>@2x.png (3000x2000).
// Run from the repo root: node docs/diagrams/src/render.mjs [name...]
import { createRequire } from "node:module";
import { readdirSync, copyFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_DIR || "/Users/prateeksrivastava/Documents/qloo/tour-intel-release4/dashboard/node_modules/playwright");
const here = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv.slice(2);
const names = readdirSync(here).filter((f) => f.endsWith(".html")).map((f) => f.replace(/\.html$/, "")).filter((n) => !only.length || only.includes(n));
const browser = await chromium.launch();
for (const [scale, suffix] of [[1, ""], [2, "@2x"]]) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  for (const n of names) {
    await page.goto(pathToFileURL(path.join(here, n + ".html")).href);
    await page.waitForTimeout(150);
    await page.locator("#c").screenshot({ path: path.join(here, "..", `${n}${suffix}.png`) });
  }
  await ctx.close();
}
await browser.close();
for (const n of ["architecture", "playbook-flow"]) if (names.includes(n)) copyFileSync(path.join(here, "..", `${n}@2x.png`), path.join(here, "..", "..", "screens", `${n}.png`));
console.log("rendered", names.join(", "));
