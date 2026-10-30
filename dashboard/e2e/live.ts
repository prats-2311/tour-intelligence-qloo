import type { Page } from "@playwright/test";

/**
 * LIVE=1 marks the specs that need the real gateway (live Qloo, Gemini, web lookups). They are skipped by default so the
 * suite runs against a local build with the recorded showcase and an in-memory collab server. Run them only against a
 * deployed site: `E2E_BASE_URL=https://tour-intel-qloo-602700957663.us-central1.run.app LIVE=1 npx playwright test`.
 */
export const LIVE = process.env.LIVE === "1";
export const LIVE_SKIP_REASON = "needs live Qloo/Gemini: set LIVE=1 and E2E_BASE_URL to run";

/** Map tiles are a third-party network dependency; the map shows its own "tiles unavailable" note without them. */
export async function blockMapTiles(page: Page): Promise<void> {
  await page.route(/tiles\.openfreemap\.org/, (route) => route.abort());
}

/** Clears what the app keeps in this browser (tour outcome, identity), before the page loads. */
export async function freshBrowser(page: Page): Promise<void> {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch { /* blocked */ } });
}
