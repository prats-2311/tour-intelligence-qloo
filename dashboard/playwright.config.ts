import { defineConfig } from "@playwright/test";

// E2E_PORT lets the suite run when something else already holds :5173.
const port = Number(process.env.E2E_PORT ?? 5173);
// E2E_BASE_URL (the daily live run) tests a deployed site: no dev server.
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL, trace: "retain-on-failure" },
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    env: { VITE_QLOO_FIXTURES: "1" },
  },
  projects: [
    { name: "mobile", use: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  ],
});
