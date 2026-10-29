import AxeBuilder from "@axe-core/playwright";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { useSyntheticRecordings } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.route(/tiles\.openfreemap\.org/, (route) => route.abort());
  await useSyntheticRecordings(page);
});

const Q1 = "Why does Los Angeles rank above São Paulo here?";
const Q2 = "Which sponsor should I pitch first in Mexico City, and why?";
const NOTE = "This example can replay the two recorded questions. Try your own artist to ask anything.";

for (const start of ["/tours/board?showcase=1", "/tours/playbook/4005539?showcase=1"]) {
  test(`Ask about this tour replays a recorded question with its work log (${start})`, async ({ page }, info) => {
    const qloo: string[] = [];
    page.on("request", (r) => { if (r.url().includes("/api/qloo/")) qloo.push(r.url()); });
    await page.goto(start);
    await expect(page.getByTestId("city-row").or(page.getByRole("heading", { level: 1 })).first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Ask about this tour" }).first().click();
    const panel = page.getByRole("region", { name: "Strategist" });
    await expect(panel.getByRole("button", { name: Q1 })).toBeVisible();
    await expect(panel.getByRole("button", { name: Q2 })).toBeVisible();
    await expect(panel.getByText(NOTE)).toBeVisible();
    await expect(panel.getByRole("textbox")).toHaveCount(0);

    await panel.getByRole("button", { name: Q1 }).click();
    await expect(panel.getByText(/Invented test answer/)).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByRole("button", { name: "Work log" })).toHaveAttribute("aria-expanded", "true");
    await expect(panel.getByRole("button", { name: "Model reasoning summary" })).toBeVisible();
    await expect(panel.getByText("Gemini's own summary of its reasoning")).toBeVisible();
    await expect(panel.getByText(/Invented reasoning for the test fixture/)).toBeVisible();
    const tools = panel.getByRole("list", { name: "Tools used" });
    await expect(tools.getByText("7 cards")).toBeVisible();
    await expect(tools.getByText("5 results")).toBeVisible();

    // The second question replays too, with its log collapsed until opened.
    await expect(panel.getByRole("button", { name: Q2 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no horizontal overflow").toBe(true);
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    const dir = process.env.SHOT_DIR;
    if (dir) await page.screenshot({ path: path.join(dir, `ask-${start.includes("playbook") ? "playbook" : "board"}-${info.project.name}.png`) });
    expect(qloo, "the replay makes no Qloo calls").toEqual([]);
  });
}
