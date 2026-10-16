# Plan 2 — Frontend: Tour Board, Landing & Taste Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the approved Stitch reference screens into a mobile-first, responsive React experience — Landing, Tour Board (live-streamed winnability with visible agent reasoning) and the Taste Insights dashboard — consuming the `qloo_gateway` SSE API through the existing Express BFF, with a clearly-labelled sample-data mode until the Qloo key arrives.

**Architecture:** The existing React 19 + Vite + Tailwind v4 dashboard gains: a BFF proxy module that streams gateway SSE to the browser; a typed client (`src/lib/qloo/*`) with an SSE parser, an event reducer and React hooks; a `TourBoardProvider` context holding the latest run (shared by Tour Board and Insights); presentational primitives (VerdictChip, DualBars, AgentLog, sheets); hand-built SVG charts; and a MapLibre map. All event→sentence narration and chart geometry are pure, tested functions. The app shell becomes responsive (bottom tab bar on phones, top bar on desktop).

**Tech Stack:** React 19, TypeScript ~6, Vite 8, Tailwind v4 (CSS-first tokens), react-router 7, TanStack Query 5, framer-motion 12, lucide-react, MapLibre GL 5, vitest 4 + jsdom + @testing-library/react, @playwright/test, Express 5 BFF.

**Spec:** `docs/superpowers/specs/2026-10-16-tour-intelligence-qloo-design.md` (§3 flow, §5 scoring, §7 product experience incl. 7.4 visible reasoning & 7.5 Taste Insights, §9 errors, §11.0 UI workflow & anti-AI-look rules). **Design source of truth:** `docs/design/DESIGN.md`; **reference screens:** `docs/design/stitch/<screen>/code.html` + `screen.png` (fixed versions; ignore `*.original.*` and the dropped landing v1).

**Plan series:** Plan 1 gateway (done except Task 12 deploy/Task 13 spike) → **Plan 2 (this)** → Plan 3 City Playbook UI + Stage-2 agents + Build tour/Book → Plan 4 Strategist, Without-Qloo comparison, MCP + WebMCP → Plan 5 Backtest & `/proof` → Plan 6 polish & submission.

## Global Constraints

- Work inside `dashboard/` unless a task says otherwise. Follow `dashboard/CLAUDE.md` (Premiere Noir, BFF pattern, `index.html` served `no-store`). TS settings: `verbatimModuleSyntax` (use `import type`), `erasableSyntaxOnly` (no enums/parameter properties), path alias `@/*` → `src/*`.
- Mobile-first: design at 375 px, expand to tablet (`md`, 768) and desktop (`lg`, 1024; reference frames 1280). No horizontal scroll at 360 px. Touch targets ≥ 44 px. Respect `prefers-reduced-motion` (framer `useReducedMotion`).
- Visual rules from `docs/design/DESIGN.md` are binding, especially §9 Banned: no gradient text, no glowing/gradient buttons, no glassmorphism/blur, no violet/indigo washes, no emoji icons, no index numbering ("01/02"), no decorative monospace, no invented labels/metrics/version strings/"LIVE" dots. Verdict chips always icon + label. Tabular numerals for numbers.
- Honesty: every number shown comes from a gateway event (or the clearly-labelled sample fixture). Sample mode always shows the banner "Sample data — illustrative, not Qloo output". Cached/stale/partial data is labelled. Integrity line verbatim where scores appear: "Affinity signal from aggregate taste data — not a ticket forecast or a claim about individuals."
- Gateway contract (mirror exactly from `cloud_run/qloo_gateway/src/types.ts` and pipelines): event types `resolve, artist_profile, region_unavailable, needs_input, tool_call, tool_result, region_empty, city_scored, playbook, done, error`; `ScoredCity { id, name, country, lat, lon, fanHeat: Score, activation: Score & { components }, winnability: Score, verdict, zones: Zone[], warnings: DataWarning[] }`; `Zone { label, lat, lon, affinity, index, share }`; `Score = { value: number; refs } | { value: null; reason: "insufficient_data"; refs }`.
- Verdict thresholds (display only, never recomputed client-side as truth): play fan≥70 & act≥60; hidden_goldmine 45≤fan<70 & act≥75; de_risk fan≥70 & act<45; consider win≥55; else skip.
- Session id: `x-session-id` header, 1–128 chars, generated once per browser (`crypto.randomUUID()`, localStorage key `qlooSessionId`).
- Tests: any test file that uses `vi.spyOn`/`vi.stubGlobal` adds `afterEach(() => { vi.restoreAllMocks(); })` so mocks never leak between tests. `cd dashboard && npm test` (vitest) green, then from repo root `./run_tests.sh` green before every commit. Component tests use `// @vitest-environment jsdom` at the top of the file. Never call the real gateway or Qloo in tests.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Stream ends mid-way** (network drop / server closes without `done`) — UI leaves the "streaming" state with an honest "Connection lost — results so far shown" notice; no infinite spinner. Test owned by Task 4.
2. **An artist name with accents or emoji** ("Beyoncé", "Sigur Rós") round-trips through the brief form, the request body and the needs_input picker without mangling. Test owned by Task 4 (reducer) and Task 10 (form).
3. **Zero scored cities** (every region empty/unavailable) — Tour Board and Insights show a designed empty state explaining which regions returned nothing; no NaN, no empty chart axes. Tests owned by Tasks 10 and 12.
4. **Very long city or artist names** ("Santiago de Querétaro", "Los Angeles–Long Beach") do not overflow cards or rows at 360 px. Test owned by Task 14 (no-horizontal-scroll check across all screens with a long-name fixture variant).
5. **User navigates away mid-stream** (Tour Board → Insights → back) — the run continues in the provider or is cleanly aborted; never two concurrent streams for the same brief. Test owned by Task 4.

---

## File Structure

```
dashboard/
  vite.config.ts                     + test block (environment node default)
  playwright.config.ts               NEW (projects: mobile 375x812, desktop 1280x800)
  e2e/judge-path.spec.ts             NEW
  server/
    index.js                         + getQlooGatewayToken(); mountQlooProxy(app, …)
    qlooProxy.js                     NEW  SSE + JSON proxy to qloo_gateway
    qlooProxy.test.js                NEW
  src/
    index.css                        tokens per DESIGN.md; retire banned treatments
    lib/
      useMediaQuery.ts               NEW
      qloo/
        types.ts                     NEW  mirrors gateway contract
        session.ts                   NEW  getSessionId()
        sse.ts                       NEW  SseParser
        client.ts                    NEW  streamTourBoard / streamCityPlaybook / callQlooTool
        fixtures/lumenVale.ts        NEW  labelled sample run
        tourBoardReducer.ts          NEW
        TourBoardProvider.tsx        NEW  context + useTourBoard()
        narrate.ts                   NEW  event → plain-language log steps (spec 7.4)
        geometry.ts                  NEW  chart scales & matrix/bars geometry
        adapters.ts                  NEW  tolerant demographics/trends/tags adapters
    components/
      AppShell.tsx                   responsive: TopBar (lg+) / BottomTabs (<lg)
      qloo/
        VerdictChip.tsx  DualBars.tsx  Sheet.tsx  WhyThisScore.tsx
        AgentLog.tsx  SampleBanner.tsx  DataWarningBadge.tsx
        TourMap.tsx (lazy)  CityRow.tsx  BriefForm.tsx  NeedsInputPicker.tsx
      insights/
        FiltersPanel.tsx  WinnabilityMatrix.tsx  ActivationBoxscore.tsx
        AudienceProfile.tsx  MomentumChart.tsx  PromoZones.tsx
        CrossDomainTaste.tsx  ArtistCompare.tsx  DataQualityTiles.tsx
    pages/
      Landing.tsx  TourBoard.tsx  TasteInsights.tsx   NEW
    App.tsx                          routes updated
```

---

### Task 1: Test & tooling foundations

**Files:**
- Modify: `dashboard/package.json` (+ lock), `dashboard/vite.config.ts`
- Create: `dashboard/playwright.config.ts`, `dashboard/src/lib/useMediaQuery.ts`, `dashboard/src/lib/useMediaQuery.test.ts`

**Interfaces:**
- Produces: `useMediaQuery(query: string): boolean`; `useIsDesktop(): boolean` (= `useMediaQuery("(min-width: 1024px)")`); npm scripts `test` (unchanged), `e2e` (`playwright test`).

- [ ] **Step 1: Install dev dependencies**

Run: `cd dashboard && npm install -D jsdom@^26 @testing-library/react@^16 @testing-library/dom@^10 @testing-library/user-event@^14 @playwright/test@^1.62.0 && npm install maplibre-gl@^5`
Expected: installs cleanly; `package.json` lists them.

- [ ] **Step 2: Add vitest block** — in `vite.config.ts`, add to the exported config (keep existing plugins/alias/proxy):

```ts
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "server/**/*.test.js"],
  },
```

If TypeScript complains about `test` in the Vite config type, add `/// <reference types="vitest/config" />` as the first line.

- [ ] **Step 3: Write the failing hook test** — `src/lib/useMediaQuery.test.ts`

```ts
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIsDesktop, useMediaQuery } from "./useMediaQuery";

function mockMatchMedia(initial: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    matches: initial,
    addEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => listeners.add(l),
    removeEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => listeners.delete(l),
  };
  vi.stubGlobal("matchMedia", vi.fn(() => mql));
  return (next: boolean) => { mql.matches = next; listeners.forEach((l) => l({ matches: next } as MediaQueryListEvent)); };
}

describe("useMediaQuery", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("returns the current match and updates on change", () => {
    const fire = mockMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery("(min-width: 1024px)"));
    expect(result.current).toBe(false);
    act(() => fire(true));
    expect(result.current).toBe(true);
  });
  it("useIsDesktop queries min-width 1024px", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith("(min-width: 1024px)");
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `cd dashboard && npx vitest run src/lib/useMediaQuery.test.ts`
Expected: FAIL — cannot resolve `./useMediaQuery`.

- [ ] **Step 5: Implement** — `src/lib/useMediaQuery.ts`

```ts
import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const useIsDesktop = (): boolean => useMediaQuery("(min-width: 1024px)");
```

- [ ] **Step 6: Playwright config** — `dashboard/playwright.config.ts`

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:5173", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    env: { VITE_QLOO_FIXTURES: "1" },
  },
  projects: [
    { name: "mobile", use: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  ],
});
```

Add script `"e2e": "playwright test"` to `package.json`. (Specs arrive in Task 14; `npx playwright install chromium` is run there.)

- [ ] **Step 7: Run tests and commit**

Run: `cd dashboard && npm test && cd .. && ./run_tests.sh`
Expected: all green (existing 22 dashboard tests + 2 new).

```bash
git add dashboard/package.json dashboard/package-lock.json dashboard/vite.config.ts dashboard/playwright.config.ts dashboard/src/lib/useMediaQuery.ts dashboard/src/lib/useMediaQuery.test.ts
git commit -m "chore(dashboard): jsdom/RTL/Playwright tooling, MapLibre dep, useMediaQuery hook"
```

---

### Task 2: Design tokens per DESIGN.md; retire banned treatments

**Files:**
- Modify: `dashboard/src/index.css`, `dashboard/src/components/ui/MorphingLoader.tsx` (only if its markup depends on the blob), `dashboard/CLAUDE.md` (design-system section)
- Create: `dashboard/src/lib/designTokens.test.ts`

**Interfaces:**
- Produces Tailwind tokens (usable as utilities): colors `bone`, `verdict-play`, `verdict-play-text`, `verdict-goldmine`, `verdict-goldmine-mark`, `verdict-derisk`, `verdict-derisk-text`, `verdict-consider`, `verdict-consider-text`, `verdict-skip`, `verdict-skip-text`, `heat-1`…`heat-6`, `state-error`, `state-error-bg`, `state-stale`, `city-1`…`city-8`. Existing token names unchanged.

- [ ] **Step 1: Write the failing test** — `src/lib/designTokens.test.ts` (node env; reads the CSS as text)

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");

describe("design tokens (DESIGN.md)", () => {
  it.each([
    ["--color-bone", "#e9e4d6"], ["--color-verdict-play", "#0f9d8a"], ["--color-verdict-play-text", "#5fd3be"],
    ["--color-verdict-goldmine", "#ffcc00"], ["--color-verdict-goldmine-mark", "#b88a00"],
    ["--color-verdict-derisk", "#e8606f"], ["--color-verdict-derisk-text", "#ff9aa4"],
    ["--color-verdict-consider", "#5a86e8"], ["--color-verdict-consider-text", "#a8c0f4"],
    ["--color-verdict-skip", "#8b877c"], ["--color-verdict-skip-text", "#bdb8ab"],
    ["--color-heat-1", "#3a382f"], ["--color-heat-6", "#e9e4d6"],
    ["--color-state-error", "#fca5a5"], ["--color-state-error-bg", "#2a1615"], ["--color-state-stale", "#d9b45a"],
    ["--color-city-1", "#ff3d00"], ["--color-city-8", "#a39200"],
  ])("defines %s = %s", (token, hex) => {
    expect(css).toMatch(new RegExp(`${token}:\\s*${hex}`, "i"));
  });

  it("has no gradient-filled text (banned)", () => {
    expect(css).not.toMatch(/background-clip:\s*text/);
  });
  it("gold button is flat (no gradient, no glow)", () => {
    const btn = css.slice(css.indexOf(".btn-gold"), css.indexOf("}", css.indexOf(".btn-gold")));
    expect(btn).not.toMatch(/gradient/);
    expect(btn).not.toMatch(/box-shadow:[^;]*0 0 \d+px/);
  });
  it("no violet/indigo background wash on body", () => {
    expect(css).not.toMatch(/#7c4dff[^;]*radial-gradient|radial-gradient[^;]*#7c4dff/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/designTokens.test.ts`
Expected: FAIL on the new tokens and the banned-treatment checks.

- [ ] **Step 3: Implement** — in `src/index.css`:
  - Add the tokens above inside the existing `@theme {}` block (exact hex values from `docs/design/DESIGN.md` frontmatter/§2; heat ramp `#3a382f #555146 #736e60 #958f7f #bab3a1 #e9e4d6`; city slots `#ff3d00 #0091ea #ff00aa #009e5c #7c4dff #c27c00 #00a0b0 #a39200`).
  - `.title-sheen`: replace the gradient clip with solid text — `color: var(--color-canvas-text);` (keep the class so existing call sites compile; delete the `@supports` gradient block).
  - `.btn-gold`: flat fill `background: var(--color-gold); color: var(--color-on-gold); box-shadow: inset 0 1px 0 rgba(255,255,255,0.25);` hover `var(--color-gold-soft)`, active `#efb900`; keep the existing `:disabled` rule.
  - `body`: remove any violet/indigo radial wash; the only allowed wash is a faint gold house light: `background: radial-gradient(1200px 600px at 100% 0%, rgba(255,204,0,0.07), transparent 60%), var(--color-canvas);`.
  - `.morphing-loader` / `@keyframes morph-blob`: replace the blob with a three-bar "level meter" loader (three 4 px bars scaling Y in sequence, gold, reduced-motion → static). Keep the class name. Update `MorphingLoader.tsx` markup only if needed to render three bars.
  - Add utility class `.tabular { font-variant-numeric: tabular-nums; font-feature-settings: "cv11"; }` and apply `font-variant-numeric: tabular-nums` on `body`.
  - Update the design-system section of `dashboard/CLAUDE.md`: Premiere Noir now follows `docs/design/DESIGN.md` (link), list the retired treatments and why (AI tells).

- [ ] **Step 4: Run tests and visually check existing pages**

Run: `npx vitest run src/lib/designTokens.test.ts && npm test && npm run build`
Expected: PASS; build succeeds. Then `npm run dev` + `npm run server` and open `/campaign` (after Task 8) or `/` now: existing pages still render with the flat gold button and solid titles.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/index.css dashboard/src/components/ui/MorphingLoader.tsx dashboard/src/lib/designTokens.test.ts dashboard/CLAUDE.md
git commit -m "feat(dashboard): DESIGN.md tokens (verdicts, heat, cities, states); retire banned AI-tell treatments"
```

---

### Task 3: Qloo client types, session id and SSE parser

**Files:**
- Create: `src/lib/qloo/types.ts`, `src/lib/qloo/session.ts`, `src/lib/qloo/sse.ts`, `src/lib/qloo/sse.test.ts`, `src/lib/qloo/session.test.ts`

**Interfaces:**
- Produces:
  - types: `QlooStatus`, `EvidenceRef`, `Score`, `DataWarning`, `Verdict`, `ComponentName`, `Zone`, `ScoredCity`, `PlaybookCard`, `ArtistProfile`, `GatewayEvent` (fully typed `city_scored.city: ScoredCity`, `playbook.playbook: { city: { name: string; country: string }; cards: PlaybookCard[] }`), `TourBrief { artist: string; artistEntityId?: string; regions: string[]; maxStops: number }`.
  - `getSessionId(): string`
  - `class SseParser { feed(chunk: string): Array<{ event: string; data: string }>; }`

- [ ] **Step 1: Write `types.ts`** (no test needed beyond typecheck — it is the mirror of the gateway contract)

```ts
export type QlooStatus = "ok" | "empty" | "needs_input" | "partial" | "degraded" | "error";
export interface EvidenceRef { tool: string; cacheKey: string; resultIndex?: number }
export type Score =
  | { value: number; refs: EvidenceRef[] }
  | { value: null; reason: "insufficient_data"; refs: EvidenceRef[] };
export interface DataWarning { tool: string; kind: "error" | "partial" | "degraded" | "stale"; code?: string; message?: string }
export type Verdict = "play" | "hidden_goldmine" | "de_risk" | "consider" | "skip" | "insufficient_data";
export type ComponentName = "sponsor_fit" | "local_hooks" | "fan_concentration" | "venue_fit";
export interface Zone { label: string; lat: number; lon: number; affinity: number; index: number; share: number }
export interface ScoredCity {
  id: string; name: string; country: string; lat: number; lon: number;
  fanHeat: Score;
  activation: Score & { components: Partial<Record<ComponentName, number>> };
  winnability: Score;
  verdict: Verdict;
  zones: Zone[];
  warnings: DataWarning[];
}
export interface PlaybookCard {
  kind: "sponsors" | "promo_zones" | "local_moment" | "venue_fit" | "co_billing";
  status: "ok" | "empty";
  items: Array<Record<string, unknown>>;
  refs: EvidenceRef[];
  warnings: DataWarning[];
}
export interface ArtistProfile {
  demographics: unknown[];
  tags: Array<{ name: string; affinity: number }>;
  trends: unknown;
  refs: EvidenceRef[];
  warnings: DataWarning[];
}
export type GatewayEvent =
  | { type: "resolve"; entity: { entityId: string; name: string } }
  | ({ type: "artist_profile" } & ArtistProfile)
  | { type: "region_unavailable"; region: string; code: string; message: string }
  | { type: "needs_input"; field: string; candidates: Array<{ id: string; name: string; type?: string }>; summary: string }
  | { type: "tool_call"; tool: string; args: Record<string, unknown>; cached: boolean }
  | { type: "tool_result"; tool: string; status: QlooStatus; resultCount: number; cacheKey: string; stale: boolean }
  | { type: "region_empty"; region: string }
  | { type: "city_scored"; city: ScoredCity }
  | { type: "playbook"; playbook: { city: { name: string; country: string }; cards: PlaybookCard[] } }
  | { type: "done"; summary: unknown }
  | { type: "error"; code: string; message: string };
export interface TourBrief { artist: string; artistEntityId?: string; regions: string[]; maxStops: number }
```

- [ ] **Step 2: Write failing tests** — `src/lib/qloo/sse.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { SseParser } from "./sse";

describe("SseParser", () => {
  it("parses complete events", () => {
    const p = new SseParser();
    expect(p.feed('event: resolve\ndata: {"a":1}\n\n')).toEqual([{ event: "resolve", data: '{"a":1}' }]);
  });
  it("buffers partial chunks across feeds", () => {
    const p = new SseParser();
    expect(p.feed("event: done\nda")).toEqual([]);
    expect(p.feed('ta: {}\n\nevent: x\ndata: 1\n\n')).toEqual([{ event: "done", data: "{}" }, { event: "x", data: "1" }]);
  });
  it("joins multi-line data with newlines and defaults event to message", () => {
    const p = new SseParser();
    expect(p.feed("data: a\ndata: b\n\n")).toEqual([{ event: "message", data: "a\nb" }]);
  });
  it("handles CRLF and ignores comments", () => {
    const p = new SseParser();
    expect(p.feed(": ping\r\nevent: e\r\ndata: 2\r\n\r\n")).toEqual([{ event: "e", data: "2" }]);
  });
  it("preserves unicode payloads (Review Focus 2)", () => {
    const p = new SseParser();
    expect(p.feed('event: resolve\ndata: {"name":"Beyoncé · Sigur Rós"}\n\n')[0]!.data).toContain("Beyoncé · Sigur Rós");
  });
});
```

`src/lib/qloo/session.test.ts`

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { getSessionId } from "./session";

describe("getSessionId", () => {
  beforeEach(() => localStorage.clear());
  it("creates once and reuses", () => {
    const a = getSessionId();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(getSessionId()).toBe(a);
  });
  it("replaces an invalid stored value", () => {
    localStorage.setItem("qlooSessionId", "x".repeat(200));
    expect(getSessionId().length).toBeLessThanOrEqual(128);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/lib/qloo`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement** — `src/lib/qloo/sse.ts`

```ts
export class SseParser {
  private buffer = "";

  feed(chunk: string): Array<{ event: string; data: string }> {
    this.buffer += chunk.replace(/\r\n/g, "\n");
    const out: Array<{ event: string; data: string }> = [];
    let sep = this.buffer.indexOf("\n\n");
    while (sep !== -1) {
      const block = this.buffer.slice(0, sep);
      this.buffer = this.buffer.slice(sep + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith(":") || line === "") continue;
        const idx = line.indexOf(":");
        const field = idx === -1 ? line : line.slice(0, idx);
        const value = idx === -1 ? "" : line.slice(idx + 1).replace(/^ /, "");
        if (field === "event") event = value;
        else if (field === "data") data.push(value);
      }
      if (data.length > 0) out.push({ event, data: data.join("\n") });
      sep = this.buffer.indexOf("\n\n");
    }
    return out;
  }
}
```

`src/lib/qloo/session.ts`

```ts
const KEY = "qlooSessionId";

export function getSessionId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && existing.length >= 1 && existing.length <= 128) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}
```

- [ ] **Step 5: Run tests, typecheck, commit**

Run: `npx vitest run src/lib/qloo && npx tsc -b`
Expected: PASS (7 tests); typecheck clean.

```bash
git add dashboard/src/lib/qloo
git commit -m "feat(dashboard): Qloo gateway types, session id and SSE parser"
```

---

### Task 4: Streaming client, sample fixture, reducer and TourBoardProvider

**Files:**
- Create: `src/lib/qloo/client.ts`, `src/lib/qloo/fixtures/lumenVale.ts`, `src/lib/qloo/tourBoardReducer.ts`, `src/lib/qloo/TourBoardProvider.tsx`, tests `client.test.ts`, `tourBoardReducer.test.ts`, `TourBoardProvider.test.tsx`

**Interfaces:**
- Consumes: Task 3 types, `SseParser`, `getSessionId`.
- Produces:
  - `streamTourBoard(brief: TourBrief, opts?: { signal?: AbortSignal; fetchImpl?: typeof fetch; sample?: boolean }): AsyncGenerator<GatewayEvent>`
  - `streamCityPlaybook(q: { artist: string; artistEntityId: string; city: string; country: string }, opts?): AsyncGenerator<GatewayEvent>`
  - `callQlooTool(name: string, args: Record<string, unknown>, opts?): Promise<{ envelope: unknown; cached: boolean; stale: boolean }>`
  - `isSampleMode(): boolean` (true when `import.meta.env.VITE_QLOO_FIXTURES === "1"`)
  - `LUMEN_VALE_SAMPLE: GatewayEvent[]` and `SAMPLE_BRIEF: TourBrief`
  - `type BoardState = { status: "idle" | "streaming" | "needs_input" | "done" | "error" | "interrupted"; source: "live" | "sample"; brief?: TourBrief; artist?: { entityId: string; name: string }; profile?: ArtistProfile; cities: ScoredCity[]; log: GatewayEvent[]; regionsEmpty: string[]; regionsUnavailable: Array<{ region: string; code: string; message: string }>; needsInput?: Extract<GatewayEvent, { type: "needs_input" }>; error?: { code: string; message: string } }`
  - `boardReducer(state: BoardState, action: BoardAction): BoardState`; `initialBoard: BoardState`; `type BoardAction = { type: "start"; brief: TourBrief; source: "live" | "sample" } | { type: "event"; event: GatewayEvent } | { type: "interrupted" } | { type: "reset" }`
  - `TourBoardProvider` + `useTourBoard(): { state: BoardState; run(brief: TourBrief, opts?: { sample?: boolean }): void; abort(): void; reset(): void }`

- [ ] **Step 1: Sample fixture** — `src/lib/qloo/fixtures/lumenVale.ts`. Values are the illustrative Lumen Vale dataset from `docs/design/screen-briefs.md` (verdicts consistent with spec §5.3). The UI must label this mode as sample data.

```ts
import type { GatewayEvent, ScoredCity, TourBrief } from "../types";

export const SAMPLE_BRIEF: TourBrief = { artist: "Lumen Vale", regions: ["Mexico", "Brazil", "United States"], maxStops: 8 };

const ref = (tool: string, k: string) => [{ tool, cacheKey: `sample-${k}` }];
const s = (v: number, k: string) => ({ value: v, refs: ref("qloo_where_popular", k) });
const city = (id: string, name: string, country: string, lat: number, lon: number, fan: number, act: number, win: number,
  verdict: ScoredCity["verdict"], components: ScoredCity["activation"]["components"]): ScoredCity => ({
  id, name, country, lat, lon, fanHeat: s(fan, `${id}-fan`),
  activation: { value: act, refs: ref("qloo_recommend", `${id}-act`), components },
  winnability: { value: win, refs: [...ref("qloo_where_popular", `${id}-fan`), ...ref("qloo_recommend", `${id}-act`)] },
  verdict, warnings: [],
  zones: [
    { label: `${name} centre`, lat, lon, affinity: 0.6, index: 0, share: 0.38 },
    { label: `${name} north`, lat: lat + 0.04, lon: lon + 0.02, affinity: 0.4, index: 1, share: 0.26 },
    { label: `${name} west`, lat: lat - 0.02, lon: lon - 0.05, affinity: 0.25, index: 2, share: 0.17 },
  ],
});

export const SAMPLE_CITIES: ScoredCity[] = [
  city("3530597", "Mexico City", "MX", 19.4326, -99.1332, 91, 77, 84, "play", { sponsor_fit: 0.8, local_hooks: 0.74, fan_concentration: 0.82, venue_fit: 0.71 }),
  city("3448439", "São Paulo", "BR", -23.5505, -46.6333, 84, 66, 75, "play", { sponsor_fit: 0.7, local_hooks: 0.62, fan_concentration: 0.71, venue_fit: 0.6 }),
  city("4005539", "Guadalajara", "MX", 20.6597, -103.3496, 62, 82, 72, "hidden_goldmine", { sponsor_fit: 0.84, local_hooks: 0.79, fan_concentration: 0.81, venue_fit: 0.86 }),
  city("3464975", "Curitiba", "BR", -25.4284, -49.2733, 51, 77, 64, "hidden_goldmine", { sponsor_fit: 0.78, local_hooks: 0.8, fan_concentration: 0.76, venue_fit: 0.72 }),
  city("5368361", "Los Angeles", "US", 34.0522, -118.2437, 88, 40, 64, "de_risk", { sponsor_fit: 0.38, local_hooks: 0.41, fan_concentration: 0.44, venue_fit: 0.36 }),
  city("3451190", "Rio de Janeiro", "BR", -22.9068, -43.1729, 72, 54, 63, "consider", { sponsor_fit: 0.58, local_hooks: 0.52, fan_concentration: 0.55, venue_fit: 0.5 }),
  city("4671654", "Austin", "US", 30.2672, -97.7431, 66, 52, 59, "consider", { sponsor_fit: 0.55, local_hooks: 0.5, fan_concentration: 0.53, venue_fit: 0.49 }),
  city("3995465", "Monterrey", "MX", 25.6866, -100.3161, 57, 59, 58, "consider", { sponsor_fit: 0.61, local_hooks: 0.55, fan_concentration: 0.63, venue_fit: 0.57 }),
  city("4887398", "Chicago", "US", 41.8781, -87.6298, 47, 49, 48, "skip", { sponsor_fit: 0.5, local_hooks: 0.47, fan_concentration: 0.49, venue_fit: 0.48 }),
  {
    id: "3470127", name: "Belo Horizonte", country: "BR", lat: -19.9167, lon: -43.9345,
    fanHeat: s(55, "3470127-fan"),
    activation: { value: null, reason: "insufficient_data", refs: [], components: { fan_concentration: 0.52 } },
    winnability: { value: null, reason: "insufficient_data", refs: [] },
    verdict: "insufficient_data", zones: [],
    warnings: [{ tool: "qloo_recommend", kind: "partial", message: "1 of 4 activation inputs returned data" }],
  },
];

const call = (tool: string, args: Record<string, unknown>, n: number, k: string): GatewayEvent[] => [
  { type: "tool_call", tool, args, cached: true },
  { type: "tool_result", tool, status: "ok", resultCount: n, cacheKey: `sample-${k}`, stale: false },
];

export const LUMEN_VALE_SAMPLE: GatewayEvent[] = [
  ...call("qloo_describe", { entity: "Lumen Vale", type: "artist" }, 1, "describe"),
  { type: "resolve", entity: { entityId: "sample-lumen-vale", name: "Lumen Vale" } },
  ...call("qloo_audience_demographics", { entity: "sample-lumen-vale" }, 6, "demo"),
  ...call("qloo_entity_tags", { entities: ["sample-lumen-vale"] }, 6, "tags"),
  ...call("qloo_trends", { entities: ["sample-lumen-vale"] }, 1, "trends"),
  ...["Mexico", "Brazil", "United States"].flatMap((r, i) => call("qloo_where_popular", { within: r }, [14, 11, 9][i]!, `heat-${i}`)),
  {
    type: "artist_profile",
    demographics: [
      { label: "≤24", index: 0.41 }, { label: "25–29", index: 0.22 }, { label: "30–34", index: 0.05 },
      { label: "35–44", index: -0.18 }, { label: "45–54", index: -0.36 }, { label: "55+", index: -0.52 },
    ],
    tags: [{ name: "dream pop", affinity: 0.94 }, { name: "synthwave", affinity: 0.88 }, { name: "bedroom pop", affinity: 0.83 }, { name: "shoegaze", affinity: 0.77 }, { name: "neo-psychedelia", affinity: 0.71 }, { name: "city pop", affinity: 0.66 }],
    trends: { series: [{ date: "2026-07-22", value: 0.41 }, { date: "2026-08-21", value: 0.46 }, { date: "2026-09-20", value: 0.52 }, { date: "2026-10-20", value: 0.59 }] },
    refs: [{ tool: "qloo_audience_demographics", cacheKey: "sample-demo" }], warnings: [],
  },
  ...SAMPLE_CITIES.flatMap((c) => call("qloo_recommend", { target_type: "brand", signal_location: `${c.name}, ${c.country}` }, 10, `brand-${c.id}`)),
  ...SAMPLE_CITIES.map((c): GatewayEvent => ({ type: "city_scored", city: c })),
  { type: "done", summary: { artist: { entityId: "sample-lumen-vale", name: "Lumen Vale" }, cities: SAMPLE_CITIES.length } },
];
```

- [ ] **Step 2: Write failing reducer tests** — `src/lib/qloo/tourBoardReducer.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { LUMEN_VALE_SAMPLE, SAMPLE_BRIEF } from "./fixtures/lumenVale";
import { boardReducer, initialBoard } from "./tourBoardReducer";
import type { GatewayEvent } from "./types";

const run = (events: GatewayEvent[]) =>
  events.reduce((s, event) => boardReducer(s, { type: "event", event }), boardReducer(initialBoard, { type: "start", brief: SAMPLE_BRIEF, source: "sample" }));

describe("boardReducer", () => {
  it("accumulates a full sample run", () => {
    const s = run(LUMEN_VALE_SAMPLE);
    expect(s.status).toBe("done");
    expect(s.source).toBe("sample");
    expect(s.artist?.name).toBe("Lumen Vale");
    expect(s.cities).toHaveLength(10);
    expect(s.profile?.tags[0]?.name).toBe("dream pop");
    expect(s.log.length).toBe(LUMEN_VALE_SAMPLE.length);
  });
  it("start resets previous results", () => {
    const s = boardReducer(run(LUMEN_VALE_SAMPLE), { type: "start", brief: SAMPLE_BRIEF, source: "live" });
    expect(s).toMatchObject({ status: "streaming", source: "live", cities: [], log: [] });
  });
  it("needs_input pauses with candidates (accents preserved — Review Focus 2)", () => {
    const s = run([{ type: "needs_input", field: "entity", summary: "Choose", candidates: [{ id: "1", name: "Beyoncé" }] }]);
    expect(s.status).toBe("needs_input");
    expect(s.needsInput?.candidates[0]?.name).toBe("Beyoncé");
  });
  it("records empty and unavailable regions separately", () => {
    const s = run([{ type: "region_empty", region: "Atlantis" }, { type: "region_unavailable", region: "Brazil", code: "QLOO_AUTH", message: "x" }]);
    expect(s.regionsEmpty).toEqual(["Atlantis"]);
    expect(s.regionsUnavailable[0]).toMatchObject({ region: "Brazil", code: "QLOO_AUTH" });
  });
  it("error keeps already-scored cities (budget stop)", () => {
    const city = (LUMEN_VALE_SAMPLE.find((e) => e.type === "city_scored") as Extract<GatewayEvent, { type: "city_scored" }>);
    const s = run([city, { type: "error", code: "BUDGET", message: "Session limit reached — try the showcase tour." }]);
    expect(s.status).toBe("error");
    expect(s.cities).toHaveLength(1);
    expect(s.error?.code).toBe("BUDGET");
  });
  it("interrupted only applies while streaming (Review Focus 1)", () => {
    const streaming = boardReducer(initialBoard, { type: "start", brief: SAMPLE_BRIEF, source: "live" });
    expect(boardReducer(streaming, { type: "interrupted" }).status).toBe("interrupted");
    expect(boardReducer(run(LUMEN_VALE_SAMPLE), { type: "interrupted" }).status).toBe("done");
  });
  it("de-duplicates a re-sent city by id", () => {
    const c = LUMEN_VALE_SAMPLE.find((e) => e.type === "city_scored")!;
    expect(run([c, c]).cities).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Write failing client tests** — `src/lib/qloo/client.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";
import { streamTourBoard } from "./client";
import { SAMPLE_BRIEF } from "./fixtures/lumenVale";

function sseResponse(chunks: string[], status = 200) {
  const body = new ReadableStream<Uint8Array>({
    start(c) { const enc = new TextEncoder(); chunks.forEach((x) => c.enqueue(enc.encode(x))); c.close(); },
  });
  return new Response(body, { status, headers: { "content-type": "text/event-stream" } });
}

describe("streamTourBoard", () => {
  it("posts the brief with a session id and yields parsed events", async () => {
    const fetchImpl = vi.fn(async () => sseResponse(['event: resolve\ndata: {"type":"resolve","entity":{"entityId":"A","name":"X"}}\n\n', 'event: done\ndata: {"type":"done","summary":{}}\n\n']));
    const out = [];
    for await (const e of streamTourBoard(SAMPLE_BRIEF, { fetchImpl: fetchImpl as unknown as typeof fetch })) out.push(e.type);
    expect(out).toEqual(["resolve", "done"]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/qloo/tour-board");
    expect((init.headers as Record<string, string>)["x-session-id"]).toBeTruthy();
    expect(JSON.parse(String(init.body))).toMatchObject({ artist: "Lumen Vale", regions: ["Mexico", "Brazil", "United States"] });
  });
  it("turns a non-OK response into a single error event", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "artist, regions[1-6], maxStops[1-20] required" }), { status: 400 }));
    const out = [];
    for await (const e of streamTourBoard(SAMPLE_BRIEF, { fetchImpl: fetchImpl as unknown as typeof fetch })) out.push(e);
    expect(out).toEqual([{ type: "error", code: "HTTP_400", message: "artist, regions[1-6], maxStops[1-20] required" }]);
  });
  it("sample mode yields the labelled fixture without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const types = [];
    for await (const e of streamTourBoard(SAMPLE_BRIEF, { fetchImpl: fetchImpl as unknown as typeof fetch, sample: true, delayMs: 0 })) types.push(e.type);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(types.at(-1)).toBe("done");
    expect(types.filter((t) => t === "city_scored")).toHaveLength(10);
  });
  it("skips malformed JSON payloads instead of throwing", async () => {
    const fetchImpl = vi.fn(async () => sseResponse(["event: resolve\ndata: {not json\n\n", 'event: done\ndata: {"type":"done","summary":{}}\n\n']));
    const out = [];
    for await (const e of streamTourBoard(SAMPLE_BRIEF, { fetchImpl: fetchImpl as unknown as typeof fetch })) out.push(e.type);
    expect(out).toEqual(["done"]);
  });
});
```

(`streamTourBoard`'s opts therefore include `delayMs?: number` for the sample pacing; default 60 ms.)

- [ ] **Step 4: Run to verify failure**

Run: `npx vitest run src/lib/qloo`
Expected: FAIL — new modules not found.

- [ ] **Step 5: Implement reducer** — `src/lib/qloo/tourBoardReducer.ts`

```ts
import type { ArtistProfile, GatewayEvent, ScoredCity, TourBrief } from "./types";

export type BoardState = {
  status: "idle" | "streaming" | "needs_input" | "done" | "error" | "interrupted";
  source: "live" | "sample";
  brief?: TourBrief;
  artist?: { entityId: string; name: string };
  profile?: ArtistProfile;
  cities: ScoredCity[];
  log: GatewayEvent[];
  regionsEmpty: string[];
  regionsUnavailable: Array<{ region: string; code: string; message: string }>;
  needsInput?: Extract<GatewayEvent, { type: "needs_input" }>;
  error?: { code: string; message: string };
};

export type BoardAction =
  | { type: "start"; brief: TourBrief; source: "live" | "sample" }
  | { type: "event"; event: GatewayEvent }
  | { type: "interrupted" }
  | { type: "reset" };

export const initialBoard: BoardState = { status: "idle", source: "live", cities: [], log: [], regionsEmpty: [], regionsUnavailable: [] };

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case "reset":
      return initialBoard;
    case "start":
      return { ...initialBoard, status: "streaming", source: action.source, brief: action.brief };
    case "interrupted":
      return state.status === "streaming" ? { ...state, status: "interrupted" } : state;
    case "event": {
      const e = action.event;
      const log = [...state.log, e];
      switch (e.type) {
        case "resolve": return { ...state, log, artist: e.entity };
        case "artist_profile": {
          const { type: _t, ...profile } = e;
          return { ...state, log, profile };
        }
        case "region_empty": return { ...state, log, regionsEmpty: [...state.regionsEmpty, e.region] };
        case "region_unavailable": return { ...state, log, regionsUnavailable: [...state.regionsUnavailable, { region: e.region, code: e.code, message: e.message }] };
        case "needs_input": return { ...state, log, status: "needs_input", needsInput: e };
        case "city_scored": return { ...state, log, cities: [...state.cities.filter((c) => c.id !== e.city.id), e.city] };
        case "done": return { ...state, log, status: "done" };
        case "error": return { ...state, log, status: "error", error: { code: e.code, message: e.message } };
        default: return { ...state, log };
      }
    }
  }
}
```

- [ ] **Step 6: Implement client** — `src/lib/qloo/client.ts`

```ts
import { LUMEN_VALE_SAMPLE } from "./fixtures/lumenVale";
import { getSessionId } from "./session";
import { SseParser } from "./sse";
import type { GatewayEvent, TourBrief } from "./types";

type StreamOpts = { signal?: AbortSignal; fetchImpl?: typeof fetch; sample?: boolean; delayMs?: number };

export const isSampleMode = (): boolean => import.meta.env.VITE_QLOO_FIXTURES === "1";

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (ms <= 0) return resolve();
  const t = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("aborted", "AbortError")); }, { once: true });
});

async function* sample(events: GatewayEvent[], opts: StreamOpts): AsyncGenerator<GatewayEvent> {
  for (const e of events) { await sleep(opts.delayMs ?? 60, opts.signal); yield e; }
}

async function* stream(url: string, init: RequestInit, opts: StreamOpts): AsyncGenerator<GatewayEvent> {
  const res = await (opts.fetchImpl ?? fetch)(url, { ...init, signal: opts.signal });
  if (!res.ok || !res.body) {
    let message = `request failed: ${res.status}`;
    try { const j = (await res.json()) as { error?: string }; if (j.error) message = j.error; } catch { /* keep default */ }
    yield { type: "error", code: `HTTP_${res.status}`, message };
    return;
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  const parser = new SseParser();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    for (const { data } of parser.feed(value)) {
      try { yield JSON.parse(data) as GatewayEvent; } catch { /* skip malformed payload */ }
    }
  }
}

export function streamTourBoard(brief: TourBrief, opts: StreamOpts = {}): AsyncGenerator<GatewayEvent> {
  if (opts.sample) return sample(LUMEN_VALE_SAMPLE, opts);
  return stream("/api/qloo/tour-board", {
    method: "POST",
    headers: { "content-type": "application/json", "x-session-id": getSessionId() },
    body: JSON.stringify(brief),
  }, opts);
}

export function streamCityPlaybook(q: { artist: string; artistEntityId: string; city: string; country: string }, opts: StreamOpts = {}): AsyncGenerator<GatewayEvent> {
  const qs = new URLSearchParams(q).toString();
  return stream(`/api/qloo/city-playbook?${qs}`, { method: "GET", headers: { "x-session-id": getSessionId() } }, opts);
}

export async function callQlooTool(name: string, args: Record<string, unknown>, opts: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {}) {
  const res = await (opts.fetchImpl ?? fetch)(`/api/qloo/tools/${encodeURIComponent(name)}`, {
    method: "POST", signal: opts.signal,
    headers: { "content-type": "application/json", "x-session-id": getSessionId() },
    body: JSON.stringify(args),
  });
  const json = (await res.json()) as { envelope?: unknown; cached?: boolean; stale?: boolean; error?: string };
  if (!res.ok) throw new Error(json.error ?? `tool ${name} failed: ${res.status}`);
  return { envelope: json.envelope, cached: Boolean(json.cached), stale: Boolean(json.stale) };
}
```

- [ ] **Step 7: Provider test** — `src/lib/qloo/TourBoardProvider.test.tsx`

```tsx
// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SAMPLE_BRIEF } from "./fixtures/lumenVale";
import { TourBoardProvider, useTourBoard } from "./TourBoardProvider";
import * as client from "./client";

function Probe() {
  const { state, run, abort } = useTourBoard();
  return (<div>
    <span data-testid="status">{state.status}</span>
    <span data-testid="count">{state.cities.length}</span>
    <button onClick={() => run(SAMPLE_BRIEF, { sample: true })}>run</button>
    <button onClick={abort}>abort</button>
  </div>);
}

describe("TourBoardProvider", () => {
  it("runs a sample stream to done", async () => {
    render(<TourBoardProvider sampleDelayMs={0}><Probe /></TourBoardProvider>);
    act(() => screen.getByText("run").click());
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("done"));
    expect(screen.getByTestId("count").textContent).toBe("10");
  });
  it("a second run aborts the first (never two streams — Review Focus 5)", async () => {
    const spy = vi.spyOn(client, "streamTourBoard");
    render(<TourBoardProvider sampleDelayMs={5}><Probe /></TourBoardProvider>);
    act(() => { screen.getByText("run").click(); screen.getByText("run").click(); });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("done"));
    const signals = spy.mock.calls.map((c) => c[1]?.signal);
    expect(signals[0]?.aborted).toBe(true);
    expect(screen.getByTestId("count").textContent).toBe("10");
  });
  it("a stream that ends without done becomes interrupted (Review Focus 1)", async () => {
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () { yield { type: "resolve", entity: { entityId: "A", name: "X" } }; });
    render(<TourBoardProvider><Probe /></TourBoardProvider>);
    act(() => screen.getByText("run").click());
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("interrupted"));
  });
});
```

- [ ] **Step 8: Implement provider** — `src/lib/qloo/TourBoardProvider.tsx`

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { isSampleMode, streamTourBoard } from "./client";
import { boardReducer, initialBoard, type BoardState } from "./tourBoardReducer";
import type { TourBrief } from "./types";

type Ctx = { state: BoardState; run(brief: TourBrief, opts?: { sample?: boolean }): void; abort(): void; reset(): void };
const TourBoardContext = createContext<Ctx | null>(null);

export function TourBoardProvider({ children, sampleDelayMs }: { children: ReactNode; sampleDelayMs?: number }) {
  const [state, dispatch] = useReducer(boardReducer, initialBoard);
  const controllerRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => { controllerRef.current?.abort(); controllerRef.current = null; }, []);

  const run = useCallback((brief: TourBrief, opts: { sample?: boolean } = {}) => {
    abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const sample = opts.sample ?? isSampleMode();
    dispatch({ type: "start", brief, source: sample ? "sample" : "live" });
    void (async () => {
      let terminal = false;
      try {
        for await (const event of streamTourBoard(brief, { signal: controller.signal, sample, delayMs: sampleDelayMs })) {
          if (controller.signal.aborted) return;
          dispatch({ type: "event", event });
          if (event.type === "done" || event.type === "error" || event.type === "needs_input") terminal = true;
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      if (!terminal && !controller.signal.aborted) dispatch({ type: "interrupted" });
    })();
  }, [abort, sampleDelayMs]);

  const reset = useCallback(() => { abort(); dispatch({ type: "reset" }); }, [abort]);
  useEffect(() => abort, [abort]);

  const value = useMemo(() => ({ state, run, abort, reset }), [state, run, abort, reset]);
  return <TourBoardContext.Provider value={value}>{children}</TourBoardContext.Provider>;
}

export function useTourBoard(): Ctx {
  const ctx = useContext(TourBoardContext);
  if (!ctx) throw new Error("useTourBoard must be used inside TourBoardProvider");
  return ctx;
}
```

- [ ] **Step 9: Run tests, typecheck, commit**

Run: `npx vitest run src/lib/qloo && npx tsc -b && cd .. && ./run_tests.sh`
Expected: all PASS.

```bash
git add dashboard/src/lib/qloo
git commit -m "feat(dashboard): streaming Qloo client, labelled sample run, board reducer and provider"
```

---

### Task 5: BFF proxy to qloo_gateway (SSE passthrough)

**Files:**
- Create: `dashboard/server/qlooProxy.js`, `dashboard/server/qlooProxy.test.js`
- Modify: `dashboard/server/index.js` (token helper + mount, before the static/catch-all block)

**Interfaces:**
- Produces: `mountQlooProxy(app, { gatewayUrl: string | undefined, getToken: () => Promise<string>, fetchImpl?: typeof fetch })` registering `POST /api/qloo/tour-board`, `GET /api/qloo/city-playbook`, `POST /api/qloo/tools/:name`. Unconfigured → `503 { error: "Qloo gateway not configured" }`.
- In `index.js`: `getQlooGatewayToken()` copying the `getRendererToken()` pattern with audience `process.env.QLOO_GATEWAY_URL`.

- [ ] **Step 1: Write failing tests** — `server/qlooProxy.test.js`

```js
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountQlooProxy } from "./qlooProxy.js";

let server;
async function start(opts) {
  const app = express();
  app.use(express.json());
  mountQlooProxy(app, opts);
  await new Promise((r) => { server = app.listen(0, r); });
  return `http://127.0.0.1:${server.address().port}`;
}
afterEach(() => server?.close());

const sse = (chunks) => new Response(new ReadableStream({ start(c) { const e = new TextEncoder(); chunks.forEach((x) => c.enqueue(e.encode(x))); c.close(); } }), { status: 200, headers: { "content-type": "text/event-stream" } });

describe("qlooProxy", () => {
  it("503 when the gateway is not configured", async () => {
    const base = await start({ gatewayUrl: undefined, getToken: async () => "t" });
    const res = await fetch(`${base}/api/qloo/tour-board`, { method: "POST" });
    expect(res.status).toBe(503);
  });
  it("streams tour-board SSE through with auth and session headers", async () => {
    const fetchImpl = vi.fn(async () => sse(['event: done\ndata: {"type":"done"}\n\n']));
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "tok", fetchImpl });
    const res = await fetch(`${base}/api/qloo/tour-board`, { method: "POST", headers: { "content-type": "application/json", "x-session-id": "s1" }, body: JSON.stringify({ artist: "A", regions: ["Mexico"], maxStops: 3 }) });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(await res.text()).toContain("event: done");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://gw/v1/tour-board");
    expect(init.headers.authorization).toBe("Bearer tok");
    expect(init.headers["x-session-id"]).toBe("s1");
    expect(JSON.parse(init.body)).toEqual({ artist: "A", regions: ["Mexico"], maxStops: 3 });
  });
  it("passes upstream JSON errors through with their status", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "bad brief" }), { status: 400, headers: { "content-type": "application/json" } }));
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl });
    const res = await fetch(`${base}/api/qloo/tour-board`, { method: "POST", headers: { "content-type": "application/json", "x-session-id": "s" }, body: "{}" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad brief" });
  });
  it("forwards city-playbook query and tools calls", async () => {
    const fetchImpl = vi.fn(async (url) => String(url).includes("/v1/tools/") ? new Response(JSON.stringify({ envelope: { status: "ok" }, cached: false, stale: false }), { status: 200, headers: { "content-type": "application/json" } }) : sse(["event: done\ndata: {}\n\n"]));
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl });
    await (await fetch(`${base}/api/qloo/city-playbook?artist=A&artistEntityId=E&city=Lima&country=PE`, { headers: { "x-session-id": "s" } })).text();
    expect(fetchImpl.mock.calls[0][0]).toBe("https://gw/v1/city-playbook?artist=A&artistEntityId=E&city=Lima&country=PE");
    const tool = await fetch(`${base}/api/qloo/tools/qloo_describe`, { method: "POST", headers: { "content-type": "application/json", "x-session-id": "s" }, body: JSON.stringify({ entity: "A" }) });
    expect(await tool.json()).toMatchObject({ envelope: { status: "ok" } });
  });
  it("502 with a generic message when the gateway is unreachable", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("ECONNREFUSED 10.0.0.1"); });
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl });
    const res = await fetch(`${base}/api/qloo/tools/qloo_describe`, { method: "POST", headers: { "content-type": "application/json", "x-session-id": "s" }, body: "{}" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Qloo gateway unavailable" });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd dashboard && npx vitest run server/qlooProxy.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `server/qlooProxy.js`

```js
import { Readable } from "node:stream";

export function mountQlooProxy(app, { gatewayUrl, getToken, fetchImpl = fetch }) {
  const notConfigured = (res) => res.status(503).json({ error: "Qloo gateway not configured" });

  async function forward(req, res, { path, method, body, stream }) {
    if (!gatewayUrl) return notConfigured(res);
    const controller = new AbortController();
    res.on("close", () => controller.abort());
    let upstream;
    try {
      upstream = await fetchImpl(`${gatewayUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${await getToken()}`,
          "x-session-id": req.header("x-session-id") ?? "",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      if (!res.headersSent) res.status(502).json({ error: "Qloo gateway unavailable" });
      return;
    }
    const type = upstream.headers.get("content-type") ?? "";
    if (stream && upstream.ok && type.includes("text/event-stream") && upstream.body) {
      res.status(200).set({ "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" });
      res.flushHeaders();
      Readable.fromWeb(upstream.body).on("error", () => res.end()).pipe(res);
      return;
    }
    const text = await upstream.text();
    res.status(upstream.status).type(type.includes("json") ? "application/json" : "text/plain").send(text);
  }

  app.post("/api/qloo/tour-board", (req, res) => forward(req, res, { path: "/v1/tour-board", method: "POST", body: req.body ?? {}, stream: true }));
  app.get("/api/qloo/city-playbook", (req, res) => {
    const qs = new URLSearchParams(req.query).toString();
    return forward(req, res, { path: `/v1/city-playbook?${qs}`, method: "GET", stream: true });
  });
  app.post("/api/qloo/tools/:name", (req, res) => forward(req, res, { path: `/v1/tools/${encodeURIComponent(req.params.name)}`, method: "POST", body: req.body ?? {}, stream: false }));
}
```

- [ ] **Step 4: Wire into `server/index.js`**
  - Add `const QLOO_GATEWAY = process.env.QLOO_GATEWAY_URL;` next to the other service URL constants.
  - Add `getQlooGatewayToken()` by copying `getRendererToken()` and swapping the audience to `QLOO_GATEWAY` (same metadata-server-first, `gcloud` fallback, 10-minute cache).
  - `import { mountQlooProxy } from "./qlooProxy.js";` and, immediately before the static-serving block (after the last `/api/...` route), add `mountQlooProxy(app, { gatewayUrl: QLOO_GATEWAY, getToken: getQlooGatewayToken });`.
  - Confirm with `graft ask "static serving catch-all"` that the mount sits before `app.get(/(.*)/)`.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run server/qlooProxy.test.js && npm test && cd .. && ./run_tests.sh`
Expected: PASS.

```bash
git add dashboard/server/qlooProxy.js dashboard/server/qlooProxy.test.js dashboard/server/index.js
git commit -m "feat(dashboard): BFF proxy to qloo_gateway with SSE passthrough and abort on disconnect"
```

---

### Task 6: Plain-language agent log (spec §7.4)

**Files:**
- Create: `src/lib/qloo/narrate.ts`, `src/lib/qloo/narrate.test.ts`, `src/components/qloo/AgentLog.tsx`, `src/components/qloo/AgentLog.test.tsx`

**Interfaces:**
- Consumes: `GatewayEvent`.
- Produces:
  - `type LogStep = { id: string; sentence: string; tool?: string; status: "active" | "success" | "error" | "info"; detail?: string; cached?: boolean; stale?: boolean }`
  - `narrate(events: GatewayEvent[]): LogStep[]` — pairs each `tool_call` with the next unresolved `tool_result` of the same tool; non-tool events become `info`/`error` steps. Deterministic; no LLM.
  - `countQlooCalls(events): { total: number; cached: number }`
  - `<AgentLogChip events onOpen />` ("Agent · N Qloo calls"), `<AgentLog events />` (vertical timeline per DESIGN.md §4.7, reusing the `ThinkingTrace` step visuals where practical).

- [ ] **Step 1: Write failing tests** — `src/lib/qloo/narrate.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { LUMEN_VALE_SAMPLE } from "./fixtures/lumenVale";
import { countQlooCalls, narrate } from "./narrate";
import type { GatewayEvent } from "./types";

describe("narrate", () => {
  it("turns a where_popular call+result into one completed sentence", () => {
    const steps = narrate([
      { type: "tool_call", tool: "qloo_where_popular", args: { within: "Brazil" }, cached: false },
      { type: "tool_result", tool: "qloo_where_popular", status: "ok", resultCount: 14, cacheKey: "k", stale: false },
    ]);
    expect(steps).toEqual([{ id: "0", sentence: "Finding where fans concentrate in Brazil", tool: "qloo_where_popular", status: "success", detail: "14 hotspots", cached: false, stale: false }]);
  });
  it("labels cached and stale results", () => {
    const [s] = narrate([
      { type: "tool_call", tool: "qloo_recommend", args: { target_type: "brand", signal_location: "São Paulo, BR" }, cached: true },
      { type: "tool_result", tool: "qloo_recommend", status: "ok", resultCount: 10, cacheKey: "k", stale: true },
    ]);
    expect(s).toMatchObject({ sentence: "Checking sponsor fit in São Paulo, BR", detail: "10 brands", cached: true, stale: true });
  });
  it("an unanswered call stays active", () => {
    expect(narrate([{ type: "tool_call", tool: "qloo_trends", args: {}, cached: false }])[0]!.status).toBe("active");
  });
  it("error results and events are errors with honest text", () => {
    const steps = narrate([
      { type: "tool_call", tool: "qloo_rank", args: {}, cached: false },
      { type: "tool_result", tool: "qloo_rank", status: "error", resultCount: 0, cacheKey: "k", stale: false },
      { type: "error", code: "BUDGET", message: "Session limit reached — try the showcase tour." },
    ]);
    expect(steps.map((s) => s.status)).toEqual(["error", "error"]);
    expect(steps[1]!.sentence).toBe("Session limit reached — try the showcase tour.");
  });
  it("narrates resolve, empty regions and scored cities", () => {
    const steps = narrate([
      { type: "resolve", entity: { entityId: "e", name: "Lumen Vale" } },
      { type: "region_empty", region: "Atlantis" },
      { type: "city_scored", city: (LUMEN_VALE_SAMPLE.find((e) => e.type === "city_scored") as Extract<GatewayEvent, { type: "city_scored" }>).city },
    ]);
    expect(steps.map((s) => s.sentence)).toEqual(["Matched artist: Lumen Vale", "No Qloo signal in Atlantis", "Scored Mexico City — Play, winnability 84"]);
  });
  it("counts Qloo calls and cache hits", () => {
    expect(countQlooCalls(LUMEN_VALE_SAMPLE)).toEqual({ total: 17, cached: 17 });
  });
});
```

(Count check: describe 1 + profile 3 + regions 3 + brand recommends 10 = 17, all `cached: true` in the sample. The sample is deliberately smaller than the 47-call run shown in the Stitch references; the UI always shows the count derived from events.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/qloo/narrate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `src/lib/qloo/narrate.ts`

```ts
import type { GatewayEvent } from "./types";

export type LogStep = { id: string; sentence: string; tool?: string; status: "active" | "success" | "error" | "info"; detail?: string; cached?: boolean; stale?: boolean };

const VERDICT_LABEL: Record<string, string> = { play: "Play", hidden_goldmine: "Hidden goldmine", de_risk: "De-risk", consider: "Consider", skip: "Skip", insufficient_data: "Not enough data" };

const where = (a: Record<string, unknown>) => String(a.signal_location ?? a.filter_location ?? a.within ?? "");

function sentenceFor(tool: string, a: Record<string, unknown>): string {
  switch (tool) {
    case "qloo_describe": return `Looking up ${String(a.entity ?? "the artist")} in Qloo`;
    case "qloo_audience_demographics": return "Profiling the fan base";
    case "qloo_entity_tags": return "Finding the tastes that define the fan base";
    case "qloo_trends": return "Checking momentum over the last 90 days";
    case "qloo_where_popular": return `Finding where fans concentrate in ${String(a.within ?? "the region")}`;
    case "qloo_rank": return `Ranking venues${where(a) ? ` in ${where(a)}` : ""}`;
    case "qloo_compare_audiences": return "Comparing audience overlap with a possible support act";
    case "qloo_find_tags": return `Searching Qloo tags for "${String(a.query ?? "")}"`;
    case "qloo_recommend": {
      const t = String(a.target_type ?? "");
      const w = where(a);
      if (t === "brand") return `Checking sponsor fit in ${w}`;
      if (t === "place") return `Finding venues and places fans love in ${w}`;
      if (t === "artist") return `Finding artists fans in ${w} also love`;
      if (t === "movie" || t === "tv_show") return `Finding films and shows fans in ${w} also love`;
      return `Finding related tastes in ${w}`;
    }
    default: return `Calling ${tool}`;
  }
}

function unitFor(tool: string, a: Record<string, unknown>, n: number): string {
  if (tool === "qloo_where_popular") return `${n} hotspots`;
  if (tool === "qloo_recommend" && a.target_type === "brand") return `${n} brands`;
  return `${n} results`;
}

export function narrate(events: GatewayEvent[]): LogStep[] {
  const steps: LogStep[] = [];
  const open: Array<{ step: LogStep; tool: string; args: Record<string, unknown> }> = [];
  events.forEach((e, i) => {
    const id = String(i);
    switch (e.type) {
      case "tool_call": {
        const step: LogStep = { id, sentence: sentenceFor(e.tool, e.args), tool: e.tool, status: "active", cached: e.cached };
        steps.push(step);
        open.push({ step, tool: e.tool, args: e.args });
        return;
      }
      case "tool_result": {
        const idx = open.findIndex((o) => o.tool === e.tool);
        if (idx === -1) return;
        const [{ step, args }] = open.splice(idx, 1) as [{ step: LogStep; tool: string; args: Record<string, unknown> }];
        step.status = e.status === "error" ? "error" : "success";
        step.detail = e.status === "error" ? "Qloo returned an error" : e.status === "empty" ? "no results" : unitFor(e.tool, args, e.resultCount);
        step.stale = e.stale;
        return;
      }
      case "resolve": steps.push({ id, sentence: `Matched artist: ${e.entity.name}`, status: "info" }); return;
      case "region_empty": steps.push({ id, sentence: `No Qloo signal in ${e.region}`, status: "info" }); return;
      case "region_unavailable": steps.push({ id, sentence: `Qloo data unavailable for ${e.region}`, status: "error", detail: e.code }); return;
      case "city_scored": {
        const w = e.city.winnability.value;
        steps.push({ id, sentence: `Scored ${e.city.name} — ${VERDICT_LABEL[e.city.verdict]}${w === null ? "" : `, winnability ${Math.round(w)}`}`, status: "info" });
        return;
      }
      case "needs_input": steps.push({ id, sentence: "Several artists match — choose one to continue", status: "info" }); return;
      case "error": steps.push({ id, sentence: e.message, status: "error", detail: e.code }); return;
      default: return;
    }
  });
  return steps;
}

export function countQlooCalls(events: GatewayEvent[]): { total: number; cached: number } {
  const calls = events.filter((e): e is Extract<GatewayEvent, { type: "tool_call" }> => e.type === "tool_call");
  return { total: calls.length, cached: calls.filter((c) => c.cached).length };
}
```

- [ ] **Step 4: Component test** — `src/components/qloo/AgentLog.test.tsx`

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LUMEN_VALE_SAMPLE } from "@/lib/qloo/fixtures/lumenVale";
import { AgentLog, AgentLogChip } from "./AgentLog";

describe("AgentLog", () => {
  it("chip shows the Qloo call count and opens", () => {
    const onOpen = vi.fn();
    render(<AgentLogChip events={LUMEN_VALE_SAMPLE} onOpen={onOpen} />);
    screen.getByRole("button", { name: /Agent · 17 Qloo calls/ }).click();
    expect(onOpen).toHaveBeenCalled();
  });
  it("renders sentences, tool names and the from-cache tag", () => {
    render(<AgentLog events={LUMEN_VALE_SAMPLE} />);
    expect(screen.getByText("Finding where fans concentrate in Brazil")).toBeTruthy();
    expect(screen.getAllByText("qloo_where_popular").length).toBeGreaterThan(0);
    expect(screen.getAllByText("From cache").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 5: Implement components** — `src/components/qloo/AgentLog.tsx`. Visuals per DESIGN.md §4.7 and the Tour Board reference (`docs/design/stitch/tour_board_lumen_vale_desktop_1280_800/code.html` "Agent · 47 Qloo" chip): chip 32 px, `bg-canvas-raised`, radius 8, lucide `Radio` icon + label; timeline rows: status marker (pending ring, active gold, success teal `Check`, error coral `TriangleAlert`), sentence in Inter 13, then `tool · detail` in JetBrains Mono 11 stone, "From cache" / "Stale" tags in stone/`state-stale`. Use framer `motion.li` with `initial={{ opacity: 0, y: 4 }}` only when `!useReducedMotion()`.

```tsx
import { motion, useReducedMotion } from "framer-motion";
import { Check, Circle, Radio, TriangleAlert } from "lucide-react";
import { countQlooCalls, narrate, type LogStep } from "@/lib/qloo/narrate";
import type { GatewayEvent } from "@/lib/qloo/types";

export function AgentLogChip({ events, onOpen }: { events: GatewayEvent[]; onOpen: () => void }) {
  const { total } = countQlooCalls(events);
  return (
    <button type="button" onClick={onOpen} className="inline-flex h-11 items-center gap-2 rounded-md bg-canvas-raised px-3 text-[13px] text-canvas-text">
      <Radio size={16} aria-hidden />
      <span>Agent · {total} Qloo calls</span>
    </button>
  );
}

function Marker({ status }: { status: LogStep["status"] }) {
  if (status === "success") return <Check size={14} className="text-verdict-play-text" aria-label="done" />;
  if (status === "error") return <TriangleAlert size={14} className="text-verdict-derisk-text" aria-label="error" />;
  if (status === "active") return <Circle size={14} className="text-gold" aria-label="in progress" />;
  return <Circle size={10} className="text-canvas-muted" aria-hidden />;
}

export function AgentLog({ events }: { events: GatewayEvent[] }) {
  const reduce = useReducedMotion();
  const steps = narrate(events);
  return (
    <ol className="flex flex-col gap-3" aria-label="Agent reasoning log">
      {steps.map((s) => (
        <motion.li key={s.id} initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
          <span className="mt-1"><Marker status={s.status} /></span>
          <div className="min-w-0">
            <p className="text-[13px] text-canvas-text">{s.sentence}</p>
            {(s.tool || s.detail) && (
              <p className="font-mono text-[11px] text-canvas-muted">
                {s.tool && <span>{s.tool}</span>}{s.tool && s.detail && " · "}{s.detail}
                {s.cached && <span className="ml-2">From cache</span>}
                {s.stale && <span className="ml-2 text-state-stale">Stale</span>}
              </p>
            )}
          </div>
        </motion.li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 6: Run tests and commit**

Run: `npx vitest run src/lib/qloo/narrate.test.ts src/components/qloo/AgentLog.test.tsx && npm test`
Expected: PASS.

```bash
git add dashboard/src/lib/qloo/narrate.ts dashboard/src/lib/qloo/narrate.test.ts dashboard/src/components/qloo/AgentLog.tsx dashboard/src/components/qloo/AgentLog.test.tsx
git commit -m "feat(dashboard): deterministic plain-language agent log from gateway events"
```

---

### Task 7: Verdict & score primitives, sheets, sample banner, warnings

**Files:**
- Create in `src/components/qloo/`: `VerdictChip.tsx`, `DualBars.tsx`, `Sheet.tsx`, `WhyThisScore.tsx`, `SampleBanner.tsx`, `DataWarningBadge.tsx`, and `primitives.test.tsx`

**Interfaces:**
- Produces:
  - `<VerdictChip verdict size?: "sm" | "md" />` — icon + label (Play `Play` icon, Hidden goldmine `Gem` solid gold chip, De-risk `TriangleAlert`, Consider `Scale`, Skip `SkipForward`, Not enough data `CircleDashed`), radius 4.
  - `<DualBars fanHeat: Score activation: Score />` — two 6 px bars, bone and gold, threshold ticks (heat 45/70, activation 45/60/75), mono values; insufficient → empty track + "Not enough data".
  - `<Sheet open onClose title children side?: "bottom" | "right" />` — bottom sheet < lg (radius 18 top, grabber, focus trap, Esc closes), right drawer 400 px ≥ lg (uses `useIsDesktop`).
  - `<WhyThisScore city: ScoredCity />` — formula `winnability = 0.5 × fan heat + 0.5 × activation`, weights table (sponsor 0.30, local hooks 0.25, concentration 0.25, venue 0.20) with component values, evidence refs list (tool + cacheKey), warnings, and the integrity line.
  - `<SampleBanner />` — "Sample data — illustrative, not Qloo output".
  - `<DataWarningBadge warnings: DataWarning[] />` — nothing when empty; otherwise amber badge "Partial data"/"From cache"/"Qloo error" with the messages in a tooltip/`title`.

- [ ] **Step 1: Write failing tests** — `primitives.test.tsx`

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { DataWarningBadge } from "./DataWarningBadge";
import { DualBars } from "./DualBars";
import { SampleBanner } from "./SampleBanner";
import { Sheet } from "./Sheet";
import { VerdictChip } from "./VerdictChip";
import { WhyThisScore } from "./WhyThisScore";

vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
const gdl = SAMPLE_CITIES[2]!;

describe("primitives", () => {
  it.each([["play", "Play"], ["hidden_goldmine", "Hidden goldmine"], ["de_risk", "De-risk"], ["consider", "Consider"], ["skip", "Skip"], ["insufficient_data", "Not enough data"]] as const)(
    "VerdictChip %s shows label %s with an icon", (v, label) => {
      const { container } = render(<VerdictChip verdict={v} />);
      expect(screen.getByText(label)).toBeTruthy();
      expect(container.querySelector("svg")).toBeTruthy();
    });
  it("DualBars shows both values and widths", () => {
    render(<DualBars fanHeat={gdl.fanHeat} activation={gdl.activation} />);
    expect(screen.getByText("62")).toBeTruthy();
    expect(screen.getByText("82")).toBeTruthy();
    expect((screen.getByTestId("bar-activation") as HTMLElement).style.width).toBe("82%");
  });
  it("DualBars renders insufficient data honestly", () => {
    render(<DualBars fanHeat={{ value: null, reason: "insufficient_data", refs: [] }} activation={gdl.activation} />);
    expect(screen.getByText("Not enough data")).toBeTruthy();
  });
  it("WhyThisScore shows formula, weights, components, refs and integrity line", () => {
    render(<WhyThisScore city={gdl} />);
    expect(screen.getByText(/0\.5 × fan heat \+ 0\.5 × activation/)).toBeTruthy();
    expect(screen.getByText("0.84")).toBeTruthy();
    expect(screen.getByText(/Affinity signal from aggregate taste data — not a ticket forecast or a claim about individuals\./)).toBeTruthy();
  });
  it("Sheet closes on Escape", () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose} title="Why this score?"><p>body</p></Sheet>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
  it("SampleBanner text is exact", () => {
    render(<SampleBanner />);
    expect(screen.getByText("Sample data — illustrative, not Qloo output")).toBeTruthy();
  });
  it("DataWarningBadge hidden when empty, labelled otherwise", () => {
    const { container, rerender } = render(<DataWarningBadge warnings={[]} />);
    expect(container.textContent).toBe("");
    rerender(<DataWarningBadge warnings={[{ tool: "qloo_recommend", kind: "partial", message: "3 of 4" }]} />);
    expect(screen.getByText("Partial data")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/qloo/primitives.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the six components.** Port classes/markup from `docs/design/stitch/tour_board_lumen_vale/code.html` (city rows, chips, bars) and `DESIGN.md` §4.5–4.6. Key implementations:

`VerdictChip.tsx`

```tsx
import { CircleDashed, Gem, Play, Scale, SkipForward, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Verdict } from "@/lib/qloo/types";

const META: Record<Verdict, { label: string; Icon: LucideIcon; cls: string }> = {
  play: { label: "Play", Icon: Play, cls: "bg-[#243c35] text-verdict-play-text" },
  hidden_goldmine: { label: "Hidden goldmine", Icon: Gem, cls: "bg-verdict-goldmine text-on-gold" },
  de_risk: { label: "De-risk", Icon: TriangleAlert, cls: "bg-[#4b3130] text-verdict-derisk-text" },
  consider: { label: "Consider", Icon: Scale, cls: "bg-[#313846] text-verdict-consider-text" },
  skip: { label: "Skip", Icon: SkipForward, cls: "bg-[#3a3832] text-verdict-skip-text" },
  insufficient_data: { label: "Not enough data", Icon: CircleDashed, cls: "bg-canvas-raised text-canvas-muted" },
};

export function VerdictChip({ verdict, size = "sm" }: { verdict: Verdict; size?: "sm" | "md" }) {
  const { label, Icon, cls } = META[verdict];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-[4px] px-2 font-medium", size === "md" ? "h-7 text-[13px]" : "h-6 text-[12px]", cls)}>
      <Icon size={14} aria-hidden />{label}
    </span>
  );
}
```

`DualBars.tsx`

```tsx
import type { Score } from "@/lib/qloo/types";

const Tick = ({ at }: { at: number }) => <span className="absolute top-[-2px] h-[10px] w-px bg-canvas-muted" style={{ left: `${at}%` }} aria-hidden />;

function Bar({ label, score, color, ticks, testId }: { label: string; score: Score; color: string; ticks: number[]; testId: string }) {
  return (
    <div className="grid grid-cols-[84px_1fr_32px] items-center gap-2">
      <span className="whitespace-nowrap text-[13px] text-canvas-muted">{label}</span>
      <span className="relative h-[6px] rounded-[3px] bg-[rgba(240,238,230,0.08)]">
        {score.value !== null && <span data-testid={testId} className="absolute inset-y-0 left-0 rounded-[3px]" style={{ width: `${Math.round(score.value)}%`, background: color }} />}
        {ticks.map((t) => <Tick key={t} at={t} />)}
      </span>
      <span className="text-right font-mono text-[13px] font-bold text-canvas-text tabular">{score.value === null ? "—" : Math.round(score.value)}</span>
    </div>
  );
}

export function DualBars({ fanHeat, activation }: { fanHeat: Score; activation: Score }) {
  const insufficient = fanHeat.value === null || activation.value === null;
  return (
    <div className="flex flex-col gap-2">
      <Bar label="Fan heat" score={fanHeat} color="var(--color-bone)" ticks={[45, 70]} testId="bar-fanheat" />
      <Bar label="Activation" score={activation} color="var(--color-gold)" ticks={[45, 60, 75]} testId="bar-activation" />
      {insufficient && <span className="text-[12px] text-canvas-muted">Not enough data</span>}
    </div>
  );
}
```

`Sheet.tsx` — bottom sheet / right drawer using framer `AnimatePresence`; `role="dialog"`, `aria-modal="true"`, `aria-label={title}`; `useEffect` adding a `keydown` listener for Escape; focus the sheet on open and restore focus on close; overlay click closes; mobile: fixed bottom, `max-h-[85vh]`, `rounded-t-[18px]`, grabber 36×4; desktop (`useIsDesktop()`): fixed right, `w-[400px]`, full height.

`WhyThisScore.tsx` — sections: verdict chip + winnability (kpi mono), formula line `winnability = 0.5 × fan heat + 0.5 × activation`, a table of the four components (`sponsor_fit` "Sponsor fit" 0.30, `local_hooks` "Local hooks" 0.25, `fan_concentration` "Fan concentration" 0.25, `venue_fit` "Venue fit" 0.20) showing each value with 2 decimals or "—", a "Evidence" list of `refs` rendered as `tool · cacheKey(first 8)`, `<DataWarningBadge warnings={city.warnings} />`, and the integrity line verbatim.

`SampleBanner.tsx` — full-width strip `bg-canvas-raised text-canvas-muted text-[13px]` with lucide `FlaskConical` icon and the exact text.

`DataWarningBadge.tsx` — priority error > partial/degraded > stale; labels "Qloo error", "Partial data", "From cache"; `title` = messages joined by " · ".

- [ ] **Step 4: Run tests and commit**

Run: `npx vitest run src/components/qloo/primitives.test.tsx && npm test && npx tsc -b`
Expected: PASS.

```bash
git add dashboard/src/components/qloo
git commit -m "feat(dashboard): verdict chip, dual bars, sheets, why-this-score, sample banner, warning badge"
```

---

### Task 8: Responsive app shell and routes

**Files:**
- Modify: `src/components/AppShell.tsx`, `src/App.tsx`, `src/main.tsx` (wrap with `TourBoardProvider`), any internal links to `/` that mean the campaign dashboard (find with `graft grep 'to="/"'` and `navigate("/")`)
- Create: `src/components/AppShell.test.tsx`

**Interfaces:**
- Routes: `/` → `Landing` (Task 11; until then a placeholder component rendering the `<h1>` "Win their city."), `/tours/board` → `TourBoard` (lazy), `/insights` → `TasteInsights` (lazy), `/campaign` → existing `Dashboard`, existing `/city/:cityId`, `/compare`, `/campaigns/new`, `/cities/add` unchanged.
- Nav: desktop (≥ lg) top bar 56 px — wordmark "Tour Intelligence" (Fraunces 18/600) + "× Qloo" (Inter 13 stone); links Discover (`/`), Tours (`/tours/board`), Insights (`/insights`), Campaigns (`/campaign`); active = bone + 2 px gold underline. Mobile (< lg) bottom tab bar 64 px — Discover · Tours · Insights · Campaigns with lucide `Compass`, `Route`, `ChartColumn`, `Clapperboard`, labels 11 px; active = bone + 3×20 px gold bar. Main content padding `px-4 lg:px-8`, bottom padding on mobile to clear the tab bar. `CampaignSwitcher` moves into the Campaigns pages' header area (render it inside `Dashboard` / existing pages' top section, or in the desktop top bar right side only when the route starts with `/campaign`, `/city`, `/compare`, `/cities`).
- `TourGuide` auto-launch condition changes from `/` to `/campaign`.

- [ ] **Step 1: Write failing tests** — `src/components/AppShell.test.tsx`

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

vi.mock("@/lib/campaignContext", () => ({ useCampaignContext: () => ({ campaigns: [], activeCampaignId: "x", activeCampaign: undefined, setActiveCampaignId() {}, refresh() {} }) }));

const mm = (desktop: boolean) => vi.stubGlobal("matchMedia", () => ({ matches: desktop, addEventListener() {}, removeEventListener() {} }));

describe("AppShell", () => {
  it("mobile renders a bottom tab bar with four tabs and no sidebar", () => {
    mm(false);
    render(<MemoryRouter initialEntries={["/tours/board"]}><AppShell><p>child</p></AppShell></MemoryRouter>);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav.querySelectorAll("a")).toHaveLength(4);
    expect(screen.getByRole("link", { name: /Tours/ }).getAttribute("aria-current")).toBe("page");
    expect(document.querySelector("aside")).toBeNull();
  });
  it("desktop renders the top bar wordmark and links", () => {
    mm(true);
    render(<MemoryRouter initialEntries={["/"]}><AppShell><p>child</p></AppShell></MemoryRouter>);
    expect(screen.getByText("Tour Intelligence")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Insights" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/AppShell.test.tsx`
Expected: FAIL (sidebar still present / wrong nav).

- [ ] **Step 3: Implement** the shell per the interface block above (use `NavLink` so `aria-current="page"` is set; `<nav aria-label="Primary">` for whichever bar renders). Remove the fixed `<aside className="w-60 …">`. Keep `TourGuide` rendering with the new route condition. Update `App.tsx` routes and wrap the app in `TourBoardProvider` in `main.tsx` (inside `BrowserRouter`). Fix links that pointed to `/` for the campaign dashboard to `/campaign`.

- [ ] **Step 4: Run tests, build, smoke-check, commit**

Run: `npm test && npx tsc -b && npm run build`
Expected: PASS. Then `npm run dev`, open `/campaign` at 375 px and 1280 px: existing campaign dashboard renders without horizontal scroll and with the new nav.

```bash
git add dashboard/src
git commit -m "feat(dashboard): responsive app shell (bottom tabs / top bar) and Qloo routes"
```

---

### Task 9: Tour map (MapLibre, warm-tinted dark tiles)

**Files:**
- Create: `src/lib/qloo/geometry.ts` (map part), `src/lib/qloo/geometry.test.ts`, `src/components/qloo/TourMap.tsx`

**Interfaces:**
- Produces:
  - `cityMarkers(cities: ScoredCity[]): Array<{ id: string; lngLat: [number, number]; verdict: Verdict; label: string | null }>` — label only for `play` and `hidden_goldmine`.
  - `boundsFor(cities: ScoredCity[]): [[number, number], [number, number]] | null` — padded bbox of finite coordinates, null when none.
  - `MAP_STYLE: maplibregl.StyleSpecification` — single raster source CARTO dark (`https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png` plus b/c/d subdomains), paint `raster-saturation: -0.6`, `raster-brightness-max: 0.75`, `raster-hue-rotate: 15`; attribution "© OpenStreetMap contributors © CARTO".
  - `<TourMap cities selectedId? onSelect(id) zones? />` default export, lazy-loaded with `React.lazy`; HTML markers with verdict shapes (filled circle, diamond, triangle, ring, small x, hollow square) and a 2 px canvas ring; labels in Fraunces 13 beside play/goldmine markers; zones (when given) as bone circles sized by `share`.

- [ ] **Step 1: Write failing tests** — `src/lib/qloo/geometry.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { SAMPLE_CITIES } from "./fixtures/lumenVale";
import { boundsFor, cityMarkers } from "./geometry";

describe("map geometry", () => {
  it("markers use lon,lat and label only play/goldmine", () => {
    const m = cityMarkers(SAMPLE_CITIES);
    expect(m[0]).toEqual({ id: SAMPLE_CITIES[0]!.id, lngLat: [-99.1332, 19.4326], verdict: "play", label: "Mexico City" });
    expect(m.find((x) => x.verdict === "de_risk")!.label).toBeNull();
    expect(m.filter((x) => x.label).map((x) => x.label)).toEqual(["Mexico City", "São Paulo", "Guadalajara", "Curitiba"]);
  });
  it("bounds pad the extent and ignore non-finite coordinates", () => {
    const b = boundsFor([...SAMPLE_CITIES, { ...SAMPLE_CITIES[0]!, id: "bad", lat: Number.NaN }])!;
    expect(b[0][0]).toBeLessThan(-118.2437);
    expect(b[1][1]).toBeGreaterThan(41.8781);
  });
  it("bounds is null with no cities (Review Focus 3)", () => {
    expect(boundsFor([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/qloo/geometry.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `geometry.ts` map helpers:

```ts
import type { StyleSpecification } from "maplibre-gl";
import type { ScoredCity, Verdict } from "./types";

export function cityMarkers(cities: ScoredCity[]) {
  return cities
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon))
    .map((c) => ({
      id: c.id,
      lngLat: [c.lon, c.lat] as [number, number],
      verdict: c.verdict as Verdict,
      label: c.verdict === "play" || c.verdict === "hidden_goldmine" ? c.name : null,
    }));
}

export function boundsFor(cities: ScoredCity[]): [[number, number], [number, number]] | null {
  const pts = cities.filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon));
  if (pts.length === 0) return null;
  const lons = pts.map((c) => c.lon), lats = pts.map((c) => c.lat);
  const pad = 2;
  return [[Math.min(...lons) - pad, Math.min(...lats) - pad], [Math.max(...lons) + pad, Math.max(...lats) + pad]];
}

export const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: ["a", "b", "c", "d"].map((s) => `https://${s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png`),
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#151410" } },
    { id: "carto", type: "raster", source: "carto", paint: { "raster-saturation": -0.6, "raster-brightness-max": 0.75, "raster-hue-rotate": 15 } },
  ],
};
```

Then `TourMap.tsx`: create the map in a `useEffect` (`new maplibregl.Map({ container, style: MAP_STYLE, attributionControl: { compact: true }, cooperativeGestures: !isDesktop })` — cooperative gestures prevent the map hijacking page scroll on phones), fit `boundsFor` with padding 48, add `maplibregl.Marker({ element })` per `cityMarkers` entry (element built from a small `markerElement(verdict, label, selected)` DOM helper; `onclick` → `onSelect(id)`, `aria-label` = "<city>, <verdict label>"), re-sync markers when `cities`/`selectedId` change, remove the map on unmount. Import `maplibre-gl/dist/maplibre-gl.css`. Do not unit-test the map instance (jsdom has no WebGL); mock it where pages are tested.

- [ ] **Step 4: Run tests, build, commit**

Run: `npx vitest run src/lib/qloo/geometry.test.ts && npx tsc -b && npm run build`
Expected: PASS; build chunk for TourMap is separate (lazy).

```bash
git add dashboard/src/lib/qloo/geometry.ts dashboard/src/lib/qloo/geometry.test.ts dashboard/src/components/qloo/TourMap.tsx
git commit -m "feat(dashboard): warm-tinted MapLibre tour map with verdict-shaped markers"
```

---

### Task 10: Tour Board page

**Files:**
- Create: `src/components/qloo/CityRow.tsx`, `src/components/qloo/BriefForm.tsx`, `src/components/qloo/NeedsInputPicker.tsx`, `src/pages/TourBoard.tsx`, `src/pages/TourBoard.test.tsx`, `src/lib/qloo/ranking.ts`, `src/lib/qloo/ranking.test.ts`

**Interfaces:**
- Consumes: `useTourBoard` (T4), primitives (T7), `AgentLog` (T6), `TourMap` (T9), `useIsDesktop` (T1).
- Produces:
  - `sortCities(cities: ScoredCity[], mode: "winnability" | "density"): ScoredCity[]` — winnability desc (null last, ties by activation desc, then name); density by fan heat desc (then name).
  - `summarize(cities): { play: number; hidden_goldmine: number; de_risk: number; consider: number; skip: number; insufficient_data: number }`
  - `<BriefForm onSubmit(brief) defaultBrief? />` — artist (required, trimmed), regions (chips: Mexico, Brazil, United States, Colombia, Argentina, United Kingdom, Spain, Japan, India + free-text add; 1–6), max stops (1–20, default 6); submits `TourBrief`.
  - `<NeedsInputPicker candidates onPick(id, name) />`
  - `TourBoard` page reading `?sample=1` to start the sample run, otherwise showing `BriefForm` until a run exists.

Page behaviour (port layout from `docs/design/stitch/tour_board_lumen_vale/code.html` (mobile) and `tour_board_lumen_vale_desktop_1280_800/code.html` (desktop)):
- Header: artist name (Fraunces), regions line; `AgentLogChip` opens the log in a `Sheet`. `SampleBanner` when `state.source === "sample"`.
- Mobile: map top (~45vh, lazy) + content sheet below with the segmented control (Winnability / Density-only), summary line ("10 markets scored · 2 Play · 2 Hidden goldmine · 1 De-risk"); a city with `insufficient_data` renders its row with "Not enough data" and sorts last, list of `CityRow`s, sticky "Build tour" primary button + inline Strategist-free "Why this score?" text action. Desktop: map 7 cols / list 5 cols, legend chips on the map.
- `CityRow`: city name (Fraunces) + country code, `DualBars`, `VerdictChip`, winnability number (kpi mono), `DataWarningBadge`; tapping opens a `Sheet` with `WhyThisScore`; rows animate re-order with framer `layout` (disabled under reduced motion). No index numbers.
- Switching to Density-only re-sorts (signature moment: Guadalajara moves 3rd → 6th; Curitiba 4th → 9th).
- States: streaming (skeleton rows + live log), needs_input (`NeedsInputPicker` → `run({ ...brief, artistEntityId: id })`), interrupted ("Connection lost — results so far shown" + Retry), error BUDGET ("Session limit reached — try the showcase tour." + showcase button), other errors (message + Retry), empty (no cities: designed empty state listing `regionsEmpty` and `regionsUnavailable`), done.
- "Build tour" opens a `Sheet` titled "Shortlist" listing cities with verdict play/hidden_goldmine (checkboxes, default checked) and a secondary link "Compare in Taste Insights" (`/insights`). Campaign creation is Plan 3; no placeholder or "coming soon" copy — in Plan 2 the sheet's only action is "Compare in Taste Insights".
- Integrity line at the bottom of the list.

- [ ] **Step 1: Write failing tests** — `src/lib/qloo/ranking.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { SAMPLE_CITIES } from "./fixtures/lumenVale";
import { sortCities, summarize } from "./ranking";

describe("ranking", () => {
  it("winnability order matches the sample", () => {
    expect(sortCities(SAMPLE_CITIES, "winnability").map((c) => c.name).slice(0, 4)).toEqual(["Mexico City", "São Paulo", "Guadalajara", "Curitiba"]);
  });
  it("density-only moves Guadalajara 3rd → 6th and Curitiba 4th → 9th (signature moment)", () => {
    const names = sortCities(SAMPLE_CITIES, "density").map((c) => c.name);
    expect(names.indexOf("Guadalajara")).toBe(5);
    expect(names.indexOf("Curitiba")).toBe(8);
  });
  it("null winnability sorts last", () => {
    const broken = { ...SAMPLE_CITIES[0]!, id: "x", name: "Zed", winnability: { value: null, reason: "insufficient_data" as const, refs: [] } };
    expect(sortCities([broken, ...SAMPLE_CITIES], "winnability").at(-1)!.id).toBe("x");
  });
  it("summarize counts verdicts", () => {
    expect(summarize(SAMPLE_CITIES)).toEqual({ play: 2, hidden_goldmine: 2, de_risk: 1, consider: 3, skip: 1, insufficient_data: 1 });
  });
  it("winnability ties break by activation (Curitiba before Los Angeles)", () => {
    const names = sortCities(SAMPLE_CITIES, "winnability").map((c) => c.name);
    expect(names.indexOf("Curitiba")).toBe(3);
    expect(names.indexOf("Los Angeles")).toBe(4);
    expect(names.at(-1)).toBe("Belo Horizonte");
  });
});
```

(Density check against the fixture, matching `docs/design/screen-briefs.md`: fan heat order MX 91, LA 88, SP 84, Rio 72, Austin 66, GDL 62, Monterrey 57, Belo Horizonte 55, Curitiba 51, Chicago 47 → Guadalajara index 5, Curitiba index 8. Winnability: Curitiba and Los Angeles tie at 64; the tie is broken by activation, so Curitiba is 4th and LA 5th; Belo Horizonte (null) is last.)

`src/pages/TourBoard.test.tsx`

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { TourBoardProvider } from "@/lib/qloo/TourBoardProvider";
import * as client from "@/lib/qloo/client";
import TourBoard from "./TourBoard";

vi.mock("@/components/qloo/TourMap", () => ({ default: () => <div data-testid="map" /> }));
vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));

const renderPage = (url = "/tours/board?sample=1") =>
  render(<MemoryRouter initialEntries={[url]}><TourBoardProvider sampleDelayMs={0}><TourBoard /></TourBoardProvider></MemoryRouter>);

describe("TourBoard", () => {
  it("sample run renders 10 rows, the sample banner and verdict summary", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    expect(screen.getByText("Sample data — illustrative, not Qloo output")).toBeTruthy();
    expect(screen.getByText(/10 markets scored/)).toBeTruthy();
  });
  it("density-only re-sorts the list", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    fireEvent.click(screen.getByRole("tab", { name: "Density-only" }));
    const rows = screen.getAllByTestId("city-row");
    expect(within(rows[5]!).getByText("Guadalajara")).toBeTruthy();
  });
  it("opens Why this score? for a row", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("city-row")).toHaveLength(10));
    fireEvent.click(within(screen.getAllByTestId("city-row")[2]!).getByText("Guadalajara"));
    expect(await screen.findByRole("dialog", { name: /Guadalajara/ })).toBeTruthy();
  });
  it("shows the needs_input picker and re-runs with the chosen id", async () => {
    const spy = vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () {
      yield { type: "needs_input", field: "entity", summary: "Choose", candidates: [{ id: "P1", name: "Pedro Infante" }, { id: "P2", name: "Pedro Capó" }] };
    });
    renderPage("/tours/board");
    fireEvent.change(screen.getByLabelText("Artist"), { target: { value: "Pedro" } });
    fireEvent.click(screen.getByRole("button", { name: "Score markets" }));
    fireEvent.click(await screen.findByRole("button", { name: "Pedro Capó" }));
    await waitFor(() => expect(spy.mock.calls.at(-1)![0]).toMatchObject({ artist: "Pedro", artistEntityId: "P2" }));
  });
  it("zero cities shows the empty state naming the regions (Review Focus 3)", async () => {
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () {
      yield { type: "region_empty", region: "Atlantis" };
      yield { type: "done", summary: {} };
    });
    renderPage("/tours/board");
    fireEvent.change(screen.getByLabelText("Artist"), { target: { value: "Beyoncé" } });
    fireEvent.click(screen.getByRole("button", { name: "Score markets" }));
    expect(await screen.findByText(/No Qloo signal in Atlantis/)).toBeTruthy();
  });
  it("budget error offers the showcase tour", async () => {
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () {
      yield { type: "error", code: "BUDGET", message: "Session limit reached — try the showcase tour." };
    });
    renderPage("/tours/board");
    fireEvent.change(screen.getByLabelText("Artist"), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: "Score markets" }));
    expect(await screen.findByRole("button", { name: "Try the showcase tour" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/qloo/ranking.test.ts src/pages/TourBoard.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `ranking.ts`**

```ts
import type { ScoredCity, Verdict } from "./types";

const v = (x: { value: number | null }) => (x.value === null ? Number.NEGATIVE_INFINITY : x.value);

export function sortCities(cities: ScoredCity[], mode: "winnability" | "density"): ScoredCity[] {
  return [...cities].sort((a, b) =>
    mode === "density"
      ? v(b.fanHeat) - v(a.fanHeat) || a.name.localeCompare(b.name)
      : v(b.winnability) - v(a.winnability) || v(b.activation) - v(a.activation) || a.name.localeCompare(b.name));
}

export function summarize(cities: ScoredCity[]): Record<Verdict, number> {
  const out: Record<Verdict, number> = { play: 0, hidden_goldmine: 0, de_risk: 0, consider: 0, skip: 0, insufficient_data: 0 };
  for (const c of cities) out[c.verdict] += 1;
  return out;
}
```

- [ ] **Step 4: Implement `BriefForm`, `NeedsInputPicker`, `CityRow`, `TourBoard`** per the behaviour list. Required accessible names used by tests: input label "Artist"; submit button "Score markets"; segmented control as `role="tablist"` with tabs "Winnability" and "Density-only"; each row `data-testid="city-row"`; row sheet `Sheet title={city.name + " — why this score?"}`; budget action button "Try the showcase tour" (calls `run(SAMPLE_BRIEF, { sample: true })`); picker buttons named by candidate name. Use `sortCities`/`summarize`. Lazy-load the map: `const TourMap = lazy(() => import("@/components/qloo/TourMap"))` inside `<Suspense fallback={<div className="h-[45vh] bg-canvas-raised" />}>`.

- [ ] **Step 5: Run tests, build, visual check, commit**

Run: `npx vitest run src/lib/qloo/ranking.test.ts src/pages/TourBoard.test.tsx && npm test && npx tsc -b && npm run build`
Expected: PASS. Then `VITE_QLOO_FIXTURES=1 npm run dev`, open `/tours/board?sample=1` at 375 and 1280; compare against `docs/design/stitch/tour_board_lumen_vale*/screen.png`; record differences in the report.

```bash
git add dashboard/src
git commit -m "feat(dashboard): Tour Board — streamed winnability board with map, agent log and honest states"
```

---

### Task 11: Landing page

**Files:**
- Create: `src/pages/Landing.tsx`, `src/pages/Landing.test.tsx`; Modify: `src/App.tsx` (replace the Task 8 placeholder)

**Interfaces:**
- Port `docs/design/stitch/tour_intelligence_landing_desktop_1280_800_2/code.html` (desktop) and `tour_intelligence_landing_mobile_375px/code.html` (mobile): headline "Win their city." (Fraunces, display-hero), subhead copied verbatim from the reference `code.html`, primary "Try the showcase tour" → `/tours/board?sample=1`, secondary "Plan your own" → `/tours/board`, integrity line (short form "Affinity signal from aggregate taste data — not a ticket forecast."), a static map preview card and the Guadalajara proof card (from `SAMPLE_CITIES[2]`, labelled "Sample" in label-mono). No "LIVE" badges, no eyebrow labels. The "See the backtest" link is omitted until Plan 5 ships `/proof`.

- [ ] **Step 1: Write failing test** — `src/pages/Landing.test.tsx`

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Landing from "./Landing";

vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));

describe("Landing", () => {
  it("has the headline and both entry points", () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1, name: "Win their city." })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Try the showcase tour" }).getAttribute("href")).toBe("/tours/board?sample=1");
    expect(screen.getByRole("link", { name: "Plan your own" }).getAttribute("href")).toBe("/tours/board");
  });
  it("labels the proof card as sample data and shows no LIVE badge", () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.getByText("Sample")).toBeTruthy();
    expect(screen.queryByText(/live/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: implement**, then **Step 4: run tests and commit**

Run: `npx vitest run src/pages/Landing.test.tsx` (FAIL first, then PASS after implementing) and `npm test && npx tsc -b`.

```bash
git add dashboard/src/pages/Landing.tsx dashboard/src/pages/Landing.test.tsx dashboard/src/App.tsx
git commit -m "feat(dashboard): Landing — 'Win their city.' with showcase and plan-your-own entry points"
```

---

### Task 12: Taste Insights — filters, winnability matrix, market map, activation boxscore

**Files:**
- Create: `src/lib/qloo/geometry.ts` (chart part, extend), `src/lib/qloo/insightsFilters.ts`, tests `insightsFilters.test.ts` and extend `geometry.test.ts`; components `src/components/insights/FiltersPanel.tsx`, `WinnabilityMatrix.tsx`, `ActivationBoxscore.tsx`, `DataQualityTiles.tsx`; page `src/pages/TasteInsights.tsx` and `src/pages/TasteInsights.test.tsx`

**Interfaces:**
- Consumes: `useTourBoard` state (cities, log, profile, source), primitives, `TourMap`.
- Produces:
  - `type InsightsFilters = { countries: string[]; verdicts: Verdict[]; minActivation: number; source: "all" | "live" | "cached" }` and `applyFilters(cities, f): ScoredCity[]`; `defaultFilters(cities): InsightsFilters` (all countries/verdicts selected, minActivation 0, source all).
  - `linear(domain: [number, number], range: [number, number]): (x: number) => number`
  - `matrixPoints(cities, size: { w: number; h: number; pad: number }): Array<{ id: string; x: number; y: number; verdict: Verdict; name: string }>` — x = fan heat, y = activation (0–100, y inverted), skipping null scores.
  - `QUADRANTS` — thresholds for shading: heat 45/70, activation 45/60/75.
  - `dataQuality(log): { calls: number; cached: number; partial: number; empty: number; errors: number }`
  - Components: `FiltersPanel` (bottom sheet on mobile with a "Filters (n)" button; left rail 3/12 cols on desktop), `WinnabilityMatrix` (SVG scatter with quadrant shading/labels in corners, verdict-shaped points, direct labels for play/goldmine, click → select city; "Table" toggle shows the same data as a table), `ActivationBoxscore` (columns City, Sponsor 0.30, Hooks 0.25, Concentration 0.25, Venue 0.20, Activation, Verdict; right-aligned mono numbers with tiny bars; sticky first column on mobile; sorted by activation desc), `DataQualityTiles` (Qloo calls, From cache, Partial, Empty, Errors as StatTiles — values from `dataQuality(log)`, no invented metrics).
  - Page layout ports `docs/design/stitch/taste_insights_lumen_vale_desktop_1280px/code.html` (desktop) and `taste_insights_lumen_vale_mobile_375px/code.html` (mobile). Header "Taste Insights" + artist + regions + "Export CSV" (exports the boxscore rows as CSV via a Blob download). `SampleBanner` in sample mode. When no run exists: empty state "Run a Tour Board to see insights" with buttons "Try the showcase tour" and "Plan your own".

- [ ] **Step 1: Write failing tests** — `insightsFilters.test.ts` + `geometry.test.ts` additions + `TasteInsights.test.tsx`

```ts
// insightsFilters.test.ts
import { describe, expect, it } from "vitest";
import { LUMEN_VALE_SAMPLE, SAMPLE_CITIES } from "./fixtures/lumenVale";
import { dataQuality } from "./geometry";
import { applyFilters, defaultFilters } from "./insightsFilters";

describe("insights filters", () => {
  it("defaults include everything", () => {
    expect(applyFilters(SAMPLE_CITIES, defaultFilters(SAMPLE_CITIES))).toHaveLength(10);
  });
  it("filters by verdict, country and min activation", () => {
    const f = { ...defaultFilters(SAMPLE_CITIES), verdicts: ["hidden_goldmine" as const], countries: ["MX"], minActivation: 80 };
    expect(applyFilters(SAMPLE_CITIES, f).map((c) => c.name)).toEqual(["Guadalajara"]);
  });
  it("data quality counts come only from the log", () => {
    expect(dataQuality(LUMEN_VALE_SAMPLE)).toEqual({ calls: 17, cached: 17, partial: 0, empty: 0, errors: 0 });
  });
});
```

```ts
// geometry.test.ts — add
import { linear, matrixPoints } from "./geometry";
it("linear maps domain to range", () => { expect(linear([0, 100], [0, 200])(50)).toBe(100); });
it("matrix points invert y and skip nulls", () => {
  const pts = matrixPoints([SAMPLE_CITIES[2]!, { ...SAMPLE_CITIES[0]!, id: "n", activation: { value: null, reason: "insufficient_data", refs: [], components: {} } }], { w: 220, h: 220, pad: 10 });
  expect(pts).toHaveLength(1);
  expect(pts[0]).toMatchObject({ name: "Guadalajara", verdict: "hidden_goldmine" });
  expect(pts[0]!.x).toBeCloseTo(134);
  expect(pts[0]!.y).toBeCloseTo(46);
});
```

```tsx
// TasteInsights.test.tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { TourBoardProvider, useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { SAMPLE_BRIEF } from "@/lib/qloo/fixtures/lumenVale";
import TasteInsights from "./TasteInsights";

vi.mock("@/components/qloo/TourMap", () => ({ default: () => <div data-testid="map" /> }));
vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));

function Seed() { const { run } = useTourBoard(); return <button onClick={() => run(SAMPLE_BRIEF, { sample: true })}>seed</button>; }
const renderPage = () => render(<MemoryRouter><TourBoardProvider sampleDelayMs={0}><Seed /><TasteInsights /></TourBoardProvider></MemoryRouter>);

describe("TasteInsights", () => {
  it("empty state before any run (Review Focus 3)", () => {
    renderPage();
    expect(screen.getByText("Run a Tour Board to see insights")).toBeTruthy();
  });
  it("renders matrix points, boxscore rows and data-quality tiles from the run", async () => {
    renderPage();
    fireEvent.click(screen.getByText("seed"));
    await waitFor(() => expect(screen.getAllByTestId("boxscore-row")).toHaveLength(10));
    expect(screen.getAllByTestId("matrix-point")).toHaveLength(9); // Belo Horizonte has no activation → not plotted
    expect(screen.getByText("Qloo calls").parentElement?.textContent).toContain("17");
  });
  it("verdict filter narrows every panel", async () => {
    renderPage();
    fireEvent.click(screen.getByText("seed"));
    await waitFor(() => expect(screen.getAllByTestId("boxscore-row")).toHaveLength(10));
    fireEvent.click(screen.getByRole("checkbox", { name: "Play" }));
    await waitFor(() => expect(screen.getAllByTestId("boxscore-row")).toHaveLength(8));
    expect(screen.getAllByTestId("matrix-point")).toHaveLength(7);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/qloo/insightsFilters.test.ts src/lib/qloo/geometry.test.ts src/pages/TasteInsights.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** helpers:

```ts
// geometry.ts — add
import type { GatewayEvent } from "./types";

export const linear = ([d0, d1]: [number, number], [r0, r1]: [number, number]) => (x: number) => r0 + ((x - d0) / (d1 - d0)) * (r1 - r0);

export function matrixPoints(cities: ScoredCity[], size: { w: number; h: number; pad: number }) {
  const sx = linear([0, 100], [size.pad, size.w - size.pad]);
  const sy = linear([0, 100], [size.h - size.pad, size.pad]);
  return cities.flatMap((c) => c.fanHeat.value === null || c.activation.value === null ? [] : [{
    id: c.id, name: c.name, verdict: c.verdict, x: sx(c.fanHeat.value), y: sy(c.activation.value),
  }]);
}

export const QUADRANTS = { heat: [45, 70], activation: [45, 60, 75] } as const;

export function dataQuality(log: GatewayEvent[]) {
  const calls = log.filter((e) => e.type === "tool_call") as Extract<GatewayEvent, { type: "tool_call" }>[];
  const results = log.filter((e) => e.type === "tool_result") as Extract<GatewayEvent, { type: "tool_result" }>[];
  return {
    calls: calls.length,
    cached: calls.filter((c) => c.cached).length,
    partial: results.filter((r) => r.status === "partial" || r.status === "degraded").length,
    empty: results.filter((r) => r.status === "empty").length,
    errors: results.filter((r) => r.status === "error").length,
  };
}
```

(Matrix test arithmetic: `w=220,pad=10` → x = 10 + 62/100·200 = 134 = 10 + 62·2 ✓; y = 210 − 82·2 = 46 = 10 + 18·2 ✓.)

```ts
// insightsFilters.ts
import type { ScoredCity, Verdict } from "./types";

export type InsightsFilters = { countries: string[]; verdicts: Verdict[]; minActivation: number; source: "all" | "live" | "cached" };

export const defaultFilters = (cities: ScoredCity[]): InsightsFilters => ({
  countries: [...new Set(cities.map((c) => c.country))],
  verdicts: ["play", "hidden_goldmine", "de_risk", "consider", "skip", "insufficient_data"],
  minActivation: 0,
  source: "all",
});

export function applyFilters(cities: ScoredCity[], f: InsightsFilters): ScoredCity[] {
  return cities.filter((c) =>
    f.countries.includes(c.country) &&
    f.verdicts.includes(c.verdict) &&
    (f.minActivation === 0 || (c.activation.value ?? -1) >= f.minActivation) &&
    (f.source === "all" || (f.source === "cached") === c.warnings.some((w) => w.kind === "stale")));
}
```

Then the components and page per the interface block. Required test hooks: `data-testid="boxscore-row"`, `data-testid="matrix-point"`, verdict filter checkboxes labelled by verdict label, the "Qloo calls" StatTile label. Filters state is page-local (`useState(defaultFilters(cities))`, re-initialised when the run's brief changes).

- [ ] **Step 4: Run tests, build, visual check, commit**

Run: `npx vitest run src/lib/qloo src/pages/TasteInsights.test.tsx && npm test && npx tsc -b && npm run build`
Expected: PASS. Visual check `/insights` after a sample run at 375/1280 vs the reference PNGs.

```bash
git add dashboard/src
git commit -m "feat(dashboard): Taste Insights — filters, winnability matrix, market map, activation boxscore, data quality"
```

---

### Task 13: Taste Insights — audience, momentum, promo zones, cross-domain taste, artist compare

**Files:**
- Create: `src/lib/qloo/adapters.ts`, `src/lib/qloo/adapters.test.ts`; components `src/components/insights/AudienceProfile.tsx`, `MomentumChart.tsx`, `PromoZones.tsx`, `CrossDomainTaste.tsx`, `ArtistCompare.tsx`; tests `src/components/insights/panels.test.tsx`; Modify: `src/pages/TasteInsights.tsx`

**Interfaces:**
- Produces:
  - `toDemographicBars(d: unknown[]): Array<{ label: string; index: number }>` — accepts `{label|name|age|bucket, index|value|affinity}` objects; drops non-finite; returns [] otherwise.
  - `toTrendSeries(t: unknown): Array<{ date: string; value: number }>` — accepts `{ series: [...] }`, an array of `{date|time|day, value|popularity|score}`, or an array of `{ entity, series }` (first entity); sorted by date; [] otherwise.
  - `playbookCrossDomain(cards: PlaybookCard[]): Array<{ category: "artist" | "movie" | "tv_show" | "place" | "brand"; name: string; affinity: number | null }>` — from `local_moment` items (type inferred from `type`/`subtype` containing artist/movie/tv_show/place) and `sponsors` items (brand).
  - Components: `AudienceProfile({ profile })` diverging bars (bone over-index, stone under-index) + tag chips with affinity; `MomentumChart({ profile })` SVG line (gold) — when `toTrendSeries` returns [], an honest note "Qloo returned no trend series for this artist"; `PromoZones({ city })` list of zones with share bars + in-city mini map reuse (optional) ; `CrossDomainTaste({ artist, city })` — button "Load taste for <city>" runs `streamCityPlaybook` (via a small hook `useCityPlaybook`) and lists top items per category with an entity-type filter; `ArtistCompare({ artist })` — up to 2 comparison artist inputs, "Compare" calls `callQlooTool("qloo_compare_audiences", { group_a: [artistEntityId], group_b: [name] })` per comparison, shows overlap if the envelope exposes a numeric `overlap|similarity|score`, else "Overlap unavailable" (honest), and a note "Each comparison uses 1 Qloo call". Disabled in sample mode with the note "Live comparisons need a live run".

- [ ] **Step 1: Write failing tests** — `adapters.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { playbookCrossDomain, toDemographicBars, toTrendSeries } from "./adapters";

describe("adapters", () => {
  it("demographic bars accept common shapes and drop junk", () => {
    expect(toDemographicBars([{ label: "≤24", index: 0.41 }, { age: "25–29", value: 0.2 }, { name: "x", affinity: "nope" }, null])).toEqual([{ label: "≤24", index: 0.41 }, { label: "25–29", index: 0.2 }]);
  });
  it("trend series from {series}, flat arrays and per-entity arrays, sorted", () => {
    expect(toTrendSeries({ series: [{ date: "2026-09-01", value: 2 }, { date: "2026-08-01", value: 1 }] })).toEqual([{ date: "2026-08-01", value: 1 }, { date: "2026-09-01", value: 2 }]);
    expect(toTrendSeries([{ time: "2026-08-01", popularity: 0.3 }])).toEqual([{ date: "2026-08-01", value: 0.3 }]);
    expect(toTrendSeries([{ entity: "A", series: [{ day: "2026-08-01", score: 5 }] }])).toEqual([{ date: "2026-08-01", value: 5 }]);
    expect(toTrendSeries("garbage")).toEqual([]);
  });
  it("cross-domain items come from local_moment and sponsors cards", () => {
    const out = playbookCrossDomain([
      { kind: "local_moment", status: "ok", refs: [], warnings: [], items: [{ name: "Bruma Nocturna", type: "urn:entity:artist", affinity: 0.9 }, { name: "Cine Foro", subtype: "urn:entity:place", affinity: 0.7 }] },
      { kind: "sponsors", status: "ok", refs: [], warnings: [], items: [{ name: "Cerro Alto Mezcal", affinity: 0.91 }] },
    ]);
    expect(out).toEqual([
      { category: "artist", name: "Bruma Nocturna", affinity: 0.9 },
      { category: "place", name: "Cine Foro", affinity: 0.7 },
      { category: "brand", name: "Cerro Alto Mezcal", affinity: 0.91 },
    ]);
  });
});
```

`panels.test.tsx` (jsdom): AudienceProfile renders 6 bars from the sample profile and the "dream pop" chip; MomentumChart renders an SVG `path` for the sample trends and the honest note for `trends: null`; PromoZones lists 3 zones with share "38%"; ArtistCompare is disabled with "Live comparisons need a live run" when `source="sample"`; CrossDomainTaste with a mocked `streamCityPlaybook` yielding a `playbook` event renders category headings and items.

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LUMEN_VALE_SAMPLE, SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import * as client from "@/lib/qloo/client";
import type { ArtistProfile, GatewayEvent } from "@/lib/qloo/types";
import { ArtistCompare } from "./ArtistCompare";
import { AudienceProfile } from "./AudienceProfile";
import { CrossDomainTaste } from "./CrossDomainTaste";
import { MomentumChart } from "./MomentumChart";
import { PromoZones } from "./PromoZones";

const profileEvt = LUMEN_VALE_SAMPLE.find((e) => e.type === "artist_profile") as Extract<GatewayEvent, { type: "artist_profile" }>;
const { type: _t, ...profile } = profileEvt;

describe("insight panels", () => {
  it("audience bars and tags", () => {
    render(<AudienceProfile profile={profile as ArtistProfile} />);
    expect(screen.getAllByTestId("demo-bar")).toHaveLength(6);
    expect(screen.getByText("dream pop")).toBeTruthy();
  });
  it("momentum line or honest note", () => {
    const { container, rerender } = render(<MomentumChart profile={profile as ArtistProfile} />);
    expect(container.querySelector("path")).toBeTruthy();
    rerender(<MomentumChart profile={{ ...(profile as ArtistProfile), trends: null }} />);
    expect(screen.getByText("Qloo returned no trend series for this artist")).toBeTruthy();
  });
  it("promo zones with shares", () => {
    render(<PromoZones city={SAMPLE_CITIES[2]!} />);
    expect(screen.getAllByTestId("zone-row")).toHaveLength(3);
    expect(screen.getByText("38%")).toBeTruthy();
  });
  it("artist compare disabled in sample mode", () => {
    render(<ArtistCompare artist={{ entityId: "sample-lumen-vale", name: "Lumen Vale" }} source="sample" />);
    expect(screen.getByText("Live comparisons need a live run")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Compare" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("cross-domain taste loads a city playbook", async () => {
    vi.spyOn(client, "streamCityPlaybook").mockImplementation(async function* () {
      yield { type: "playbook", playbook: { city: { name: "Guadalajara", country: "MX" }, cards: [
        { kind: "local_moment", status: "ok", refs: [], warnings: [], items: [{ name: "Bruma Nocturna", type: "urn:entity:artist", affinity: 0.9 }] },
        { kind: "sponsors", status: "ok", refs: [], warnings: [], items: [{ name: "Cerro Alto Mezcal", affinity: 0.91 }] },
      ] } };
      yield { type: "done", summary: {} };
    });
    render(<CrossDomainTaste artist={{ entityId: "E", name: "Lumen Vale" }} city={SAMPLE_CITIES[2]!} />);
    fireEvent.click(screen.getByRole("button", { name: "Load taste for Guadalajara" }));
    expect(await screen.findByText("Bruma Nocturna")).toBeTruthy();
    expect(screen.getByText("Cerro Alto Mezcal")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**, **Step 3: implement adapters and panels**, **Step 4: add the panels to `TasteInsights.tsx`** (grid order per the reference: audience + momentum row; promo zones + cross-domain row for the selected city — default the highest-winnability filtered city; artist compare last), **Step 5: run tests, build and commit**

Run: `npx vitest run src/lib/qloo/adapters.test.ts src/components/insights/panels.test.tsx && npm test && npx tsc -b && npm run build`
Expected: FAIL before implementing, PASS after.

```bash
git add dashboard/src
git commit -m "feat(dashboard): Taste Insights — audience, momentum, promo zones, cross-domain taste, artist compare"
```

---

### Task 14: End-to-end judge path, layout guards and the anti-AI-look gate

**Files:**
- Create: `dashboard/e2e/judge-path.spec.ts`, `dashboard/e2e/layout.spec.ts`; Modify: `dashboard/src/lib/qloo/fixtures/lumenVale.ts` (export a `LONG_NAMES_SAMPLE` variant), `dashboard/src/lib/qloo/client.ts` (sample selection by `?sample=long`), `dashboard/CLAUDE.md` (how to run e2e)

**Interfaces:**
- Consumes: everything above. Sample mode via `VITE_QLOO_FIXTURES=1` (Playwright webServer env from Task 1).
- `LONG_NAMES_SAMPLE` = `LUMEN_VALE_SAMPLE` with artist "Lumen Vale & The Extraordinarily Long Orchestra" and cities renamed "Santiago de Querétaro", "Los Angeles–Long Beach", "San Juan de los Lagos" (keep coordinates/scores). `TourBoard` passes `sampleSet: "long"` when the URL has `sample=long`.

- [ ] **Step 1: Install the browser**

Run: `cd dashboard && npx playwright install chromium`
Expected: Chromium downloaded.

- [ ] **Step 2: Write the specs**

`e2e/judge-path.spec.ts`

```ts
import { expect, test } from "@playwright/test";

test("judge path: landing → showcase → board → why → insights", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Win their city." })).toBeVisible();
  await page.getByRole("link", { name: "Try the showcase tour" }).click();
  await expect(page.getByText("Sample data — illustrative, not Qloo output")).toBeVisible();
  await expect(page.getByTestId("city-row")).toHaveCount(10, { timeout: 15_000 });
  await expect(page.getByTestId("city-row").nth(2)).toContainText("Guadalajara");
  await expect(page.getByTestId("city-row").nth(2)).toContainText("Hidden goldmine");
  await page.getByRole("tab", { name: "Density-only" }).click();
  await expect(page.getByTestId("city-row").nth(5)).toContainText("Guadalajara");
  await page.getByRole("tab", { name: "Winnability" }).click();
  await page.getByTestId("city-row").nth(2).getByText("Guadalajara").click();
  await expect(page.getByRole("dialog", { name: /Guadalajara/ })).toContainText("0.5 × fan heat + 0.5 × activation");
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: /Insights/ }).first().click();
  await expect(page.getByTestId("boxscore-row")).toHaveCount(10);
  await page.screenshot({ path: `test-results/judge-path-${test.info().project.name}.png`, fullPage: true });
});
```

`e2e/layout.spec.ts`

```ts
import { expect, test } from "@playwright/test";

const noHorizontalScroll = async (page: import("@playwright/test").Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

for (const path of ["/", "/tours/board?sample=1", "/tours/board?sample=long", "/insights", "/campaign"]) {
  test(`no horizontal scroll at this viewport: ${path}`, async ({ page }) => {
    await page.goto(path);
    if (path.includes("sample")) await expect(page.getByTestId("city-row").first()).toBeVisible({ timeout: 15_000 });
    await noHorizontalScroll(page);
  });
}

test("no horizontal scroll at 360px with long names (Review Focus 4)", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/tours/board?sample=long");
  await expect(page.getByTestId("city-row").first()).toBeVisible({ timeout: 15_000 });
  await noHorizontalScroll(page);
});

test("touch targets are at least 44px on mobile", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile");
  await page.goto("/tours/board?sample=1");
  await expect(page.getByTestId("city-row").first()).toBeVisible({ timeout: 15_000 });
  const small = await page.evaluate(() => [...document.querySelectorAll("button, a, [role=tab]")]
    .map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && (r.height < 44 && r.width < 44)).length);
  expect(small).toBe(0);
});
```

- [ ] **Step 3: Run e2e** — `cd dashboard && npm run e2e`
Expected: all specs pass on both projects. If a spec fails, fix the component (never weaken the assertion), re-run.

- [ ] **Step 4: Anti-AI-look gate.** Inspect `~/.claude/design-refs/taste-skill/skills/taste-skill/scripts/lint.mjs` (read its usage header) and run it against the rendered pages: save HTML snapshots with Playwright (`page.content()` written to `test-results/html/<route>.html` in a tiny extra spec or script) and lint them as the script expects. Fix every hard finding that applies (banned patterns). Record the lint output and any accepted exceptions (e.g. Fraunces/Inter, required by the spec) in `docs/design/lint-report.md`.

- [ ] **Step 5: Visual review against references.** Put the Playwright screenshots next to `docs/design/stitch/*/screen.png` and list remaining differences in `docs/design/lint-report.md` under "Visual diffs" (structure, spacing, colour). Fix structural differences; minor pixel differences are acceptable.

- [ ] **Step 6: Run everything and commit**

Run: `npm test && npx tsc -b && npm run build && npm run e2e && cd .. && ./run_tests.sh`
Expected: all green.

```bash
git add dashboard/e2e dashboard/src dashboard/CLAUDE.md docs/design/lint-report.md
git commit -m "test(dashboard): e2e judge path at 375/1280, layout guards, anti-AI-look lint report"
```

---

## Execution notes for the controller

- Order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 (sequential per SDD; Task 5 is independent of the client code and may run any time after Task 1).
- Every UI implementer dispatch includes: read `docs/design/DESIGN.md`, the named reference `code.html` + `screen.png`, `dashboard/CLAUDE.md`, and the skill files `~/.claude/plugins/cache/claude-plugins-official/frontend-design/*/skills/frontend-design/SKILL.md` (locate with `find`), `~/.claude/plugins/cache/ui-ux-pro-max-skill/ui-ux-pro-max/2.13.0/` (README + `.claude/skills`), `~/.claude/design-refs/taste-skill/skills/redesign-skill/SKILL.md`, `.../soft-skill/SKILL.md`, `.../output-skill/SKILL.md`; and the `dataviz` skill for Tasks 12–13.
- Use Graft (`graft_find_code`, `graft_file_api`, `graft_trace_calls`) before editing existing files (AppShell, App, server/index.js, MorphingLoader, CityDetail links).
- When the Qloo key arrives, Plan 1 Task 13 (data spike) may change payload shapes; `adapters.ts` and `extract.ts` absorb those changes — re-run Tasks 12–13 tests then.
