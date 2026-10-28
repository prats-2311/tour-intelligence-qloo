import path from "node:path";
import type { Page } from "@playwright/test";

const dir = path.resolve("src/test/fixtures");

/**
 * The real recordings are private and served by the dashboard server; the e2e dev server has no such endpoint,
 * so every spec serves the committed synthetic recordings (same shape) at the same URLs.
 */
export async function useSyntheticRecordings(page: Page): Promise<void> {
  await page.route("**/api/recordings/showcase", (r) => r.fulfill({ path: path.join(dir, "showcase.synthetic.json"), contentType: "application/json" }));
  await page.route("**/api/recordings/backtest", (r) => r.fulfill({ path: path.join(dir, "backtest.v3.synthetic.json"), contentType: "application/json" }));
}
