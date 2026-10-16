import { defineConfig } from "@playwright/test";

// E2E_PORT lets the suite run when something else already holds :5173.
const port = Number(process.env.E2E_PORT ?? 5173);

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  webServer: {
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
