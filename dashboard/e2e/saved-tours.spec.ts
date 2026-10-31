import fs from "node:fs";
import path from "node:path";
import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { blockMapTiles } from "./live";

// Saved tours, end to end: plan a tour, see it saved, find it in My tours, search, open, mark final, delete.
// Needs the saved-tours BFF and gateway (feat/tours-gw): run it after merge with
//   SAVED_TOURS_E2E=1 E2E_BASE_URL=<build with a gateway> npx playwright test saved-tours
// or locally: gateway `PORT=8094 node dist/collab/devServer.js`, dashboard server with COLLAB_FAKE=1, and a dev server NOT in fixtures mode (the board run must be "live").
// The board stream is fulfilled from the committed synthetic recording, so no Qloo, Gemini or Tavily call is made.
test.skip(process.env.SAVED_TOURS_E2E !== "1", "needs the saved-tours gateway and BFF: set SAVED_TOURS_E2E=1");

const rec = JSON.parse(fs.readFileSync(path.resolve("src/test/fixtures/showcase.synthetic.json"), "utf8")) as { artist: string; boardEvents: Array<{ type: string }>; playbooks: Record<string, Array<{ type: string }>> };
const sse = (events: unknown[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");

test("plan, auto-save, search, open, mark final, delete", async ({ page }) => {
  await blockMapTiles(page);
  await page.route("**/api/qloo/tour-board", (r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: sse(rec.boardEvents) }));
  await page.route("**/api/qloo/city-playbook**", (r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: sse(Object.values(rec.playbooks)[0] ?? []) }));
  await page.goto("/tours/board?new=1");
  await page.getByLabel("Artist").fill(rec.artist);
  await page.getByRole("button", { name: "Score markets" }).click();

  const toast = page.locator("[data-toast-viewport]").getByText("Saved to My tours");
  await expect(toast).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Open My tours" }).click();
  await expect(page).toHaveURL(/\/tours\/mine/);
  await expect(page.getByRole("heading", { name: "My tours" })).toBeVisible();
  const row = page.getByTestId("saved-tour").first();
  await expect(row).toContainText(rec.artist);
  await expect(row.getByTestId("tour-status")).toHaveText("Draft");

  const box = page.getByRole("searchbox", { name: "Search saved tours" });
  await box.fill("zzzz-no-such-tour");
  await expect(page.getByText("No saved tours match that search.")).toBeVisible();
  await box.fill(rec.artist.split(" ")[0]!);
  await expect(page.getByTestId("saved-tour").first()).toBeVisible();

  // Open: the board is back, finished, without a new board request.
  let boardCalls = 0;
  page.on("request", (q) => { if (q.url().includes("/api/qloo/tour-board")) boardCalls++; });
  await page.getByTestId("saved-tour").first().getByRole("link", { name: /^Open / }).click();
  await expect(page).toHaveURL(/\/tours\/board\?saved=/);
  await expect(page.getByTestId("city-row").first()).toBeVisible({ timeout: 20_000 });
  expect(boardCalls).toBe(0);

  await page.goto("/tours/mine");
  const again = page.getByTestId("saved-tour").first();
  await again.getByRole("button", { name: /^Mark .* as final$/ }).click();
  await expect(again.getByTestId("tour-status")).toHaveText("Final");

  await again.getByRole("button", { name: /^Delete / }).click();
  await expect(again.getByText("Delete this tour? This can't be undone.")).toBeVisible();
  await again.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByText("No saved tours yet. Plan a tour and it's saved here automatically.")).toBeVisible();
});
