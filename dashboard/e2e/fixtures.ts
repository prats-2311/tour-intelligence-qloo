import path from "node:path";
import type { ConsoleMessage, Page } from "@playwright/test";

const dir = path.resolve("src/test/fixtures");

/**
 * The real recordings are private and served by the dashboard server; the e2e dev server has no such endpoint,
 * so every spec serves the committed synthetic recordings (same shape) at the same URLs.
 */
export async function useSyntheticRecordings(page: Page): Promise<void> {
  await page.route("**/api/recordings/showcase", (r) => r.fulfill({ path: path.join(dir, "showcase.synthetic.json"), contentType: "application/json" }));
  await page.route("**/api/recordings/backtest", (r) => r.fulfill({ path: path.join(dir, "backtest.v3.synthetic.json"), contentType: "application/json" }));
}

/**
 * Team workspaces (`/api/qloo/ws`, `/api/qloo/ws/*`) and live analytics (`/api/qloo/stats/*`) are deliberate, data-free calls the board, playbook,
 * book and /proof make even on the recorded or sample path: they read and write only the team's own notes and the gateway's own counts.
 */
const TEAM_OR_STATS = /\/api\/qloo\/(?:ws|stats)(?:[/?\s]|$)/;

/**
 * The real invariant of "the recorded example is free": no request that reaches Qloo, Gemini or Tavily (`/tour-board`, `/city-playbook`, `/tools/*`,
 * `/strategist`, `/without-qloo`, `/this-week`, `/advance`, `/sponsor-segments`, `/v2/tap`). Pass the `/api/qloo/` request URLs (or "METHOD url"
 * strings) a spec collected; only team-workspace and stats calls are dropped, so a spec stays strict about everything else.
 */
export function qlooDataCalls(calls: readonly string[]): string[] {
  return calls.filter((c) => !TEAM_OR_STATS.test(c));
}

/** True for a browser console error caused by a team-workspace or stats call (the fixtures dev server has no BFF behind them, so they answer 502). */
export function isTeamOrStatsConsoleError(m: ConsoleMessage): boolean {
  return TEAM_OR_STATS.test(m.location().url);
}

/**
 * The guided tour (86cc069) offers itself on a first visit to the recorded example with a fixed card above the bottom bar. On a phone it sits over the
 * sticky action footer, so specs that are not about the tour start as a returning visitor who already dismissed it (the stored outcome, as "No thanks" writes).
 * guided-tour.spec.ts never calls this: it needs the first-visit prompt.
 */
export async function dismissTourPrompt(page: Page): Promise<void> {
  await page.addInitScript(() => { try { window.localStorage.setItem("tiq.tour.v1", "dismissed"); } catch { /* storage blocked: the prompt shows */ } });
}

/**
 * The fixtures dev server has no BFF, so every /api/qloo/ws call fails and the team bar (shown optimistically) disappears again: a 96 px shift on phones
 * that production, with workspaces working, never has. Layout specs that measure the board as visitors see it call this to get a working, empty,
 * in-memory workspace (same shape as the gateway's snapshot); the bar then stays put. Nothing is persisted and no Qloo data is involved.
 */
export async function useWorkingWorkspace(page: Page): Promise<void> {
  const snapshot = { ws: "e2eWorkspace0001", rev: 0, createdAt: Date.now(), statuses: {}, threads: {}, overrides: {}, leads: {}, activity: [] };
  await page.route("**/api/qloo/ws", (r) => r.fulfill({ json: { ws: snapshot.ws, snapshot } }));
  await page.route("**/api/qloo/ws/**", (r) => r.fulfill({ json: snapshot }));
}
