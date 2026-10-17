# Plan 6: Polish and Submission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Tour Intelligence × Qloo submittable. That means:
- The judge path works end to end on the recorded showcase, including the "Without Qloo" tab.
- No Qloo response data is in the public repo or its history.
- The landing, the Tour Book and the copy tell the promoter story (spec §1.2b).
- The README and Devpost text lead with who, the decision and the proof.
- The live path never dead-ends.
- The brain preflight says GO before the Oct 29 submission.

**Architecture:** Recordings (the showcase and the backtest results) move out of git into a private GCS bucket. The dashboard's Express server serves them at `GET /api/recordings/:name`, reading GCS with its own service-account token, or a local `private-data/` folder in development. The SPA loads them once at boot. If loading fails it falls back to the Lumen Vale sample placeholder that already exists. Tests and CI use synthetic fixtures with the same shape. The public repo is a filtered clone of the private one: same commits, with the data paths stripped from every commit. The private repo is not touched.

**Tech Stack:** Node 22, TypeScript, Express 5 (gateway and dashboard server), React 19 + Vite + Tailwind, Vitest, Playwright, Python 3 / pytest (legacy services and the public MCP), GitHub Actions (free for public repos), GCS JSON API over `fetch`, with no new SDK dependency.

**Spec:** `docs/superpowers/specs/2026-10-16-tour-intelligence-qloo-design.md`. The Plan 6 items are in §1.2b; also see §1.3, §7.1 and §10. The brain preflight is at `~/Documents/hackathon-brain/hackathons/qloo/preflight.md` (blockers A1–A4, should-fix S1–S9), and the tech-plan risks R1–R7 are in `.../qloo/tech-plan.md`. The Plan 5 deferred minors are in `.superpowers/sdd/2026-10-17-plan-5-proof-calibration/progress.md`.

## Decisions already made (do not reopen)
- **D1 (Prateek, 2026-10-17): Qloo data leaves the public repo.** The showcase and backtest data move to private storage and the dashboard serves them. Tests use fake data with the same shape. The public repo is a new filtered clone with those files removed from history. The private repo stays untouched.
- Judging wants a complete product, not a SaaS. No accounts, billing or tenancy.
- Free tiers only, with no paid fallback. No new min-instances. The gateway keeps its existing `--min-instances 1`. The dashboard (cold start 0.93 s) and the public MCP stay scale-to-zero.
- The taste-lift metric is out of scope (kept as an option only). Generated key art (spec line 306) is out of scope; the typographic poster stays.
- The calibration and backtest are final (Plan 5). Nothing here re-tunes thresholds.

## Decisions for Prateek at plan review (defaults used if he says "go")
- **D2, product name:** "Tour Intelligence × Qloo" with the tagline "Win their city." This name goes in the page title, README H1, Devpost title and MCP instructions.
- **D3, public repo:** rename the private repo to `prats-2311/tour-intelligence-qloo-private`, then push the filtered clone to a new public `prats-2311/tour-intelligence-qloo`. Prateek runs both steps.

## Global Constraints
- Agents never run deploy scripts, `gcloud` mutations, `gh repo create/edit`, `git push`, or Devpost writes. Prateek runs these himself with `!`. Every Devpost write needs his explicit go-ahead.
- Never delete files. Legacy files move with `git mv` into `archive/`. Never touch the `tour-dashboard` service or the `google_promotions` repo.
- Never echo or read secret values. Never put the user's email in any external request.
- No Qloo response payload (entity names or ids returned by Qloo, affinity or popularity values, tags, demographics) may be committed after Task 3. `scripts/check-public-data.sh` enforces this, from Task 4 onward.
- Story rules (spec §1.2b):
  - Every number shown comes from the loaded showcase recording or the backtest results.
  - No invented customers, quotes or dollar figures.
  - Use promoter language (holds, avails, market heat, routing, the bill, advance).
  - Never write "AI-powered" or "insights" as a selling word.
  - Never call shared taste "audience overlap", and never show it as a percent.
- Mobile-first: every new screen works at 375 px with no horizontal scroll. Don't make it look AI-generated: no gradients-as-decoration, no emoji, and keep the existing tokens (`gold`, `state-*`, existing type scale).
- Imports in the gateway use `.js` suffixes (NodeNext). Dashboard path alias `@/` = `dashboard/src/`.
- Test commands:
  - Gateway: `cd cloud_run/qloo_gateway && npm test && npm run typecheck`.
  - Dashboard: `cd dashboard && npm test && npm run build`.
  - E2E: `cd dashboard && E2E_PORT=5199 npm run e2e`.
  - Python: `.venv/bin/pytest`.
  - Everything: `./run_tests.sh`.
- Known flake: `dashboard/server/qlooProxy.test.js` "400 for missing x-session-id" can return 404 under full-suite load. It passes on its own. Task 10 fixes it.
- Commit trailer, on every commit:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Mr2yb8AQrKtjuLqifj37Dn
  ```

## Review Focus
1. **The recordings endpoint is down, slow or returns 403/404**, for example when the bucket is missing, IAM isn't set, or the dev server has no `private-data/`. Expected:
   - The landing still renders, using the sample placeholder card.
   - `?showcase=1` shows a clear "The showcase recording is unavailable right now" notice with a link to the sample tour, never a blank board.
   - `/proof` shows a plain error with Retry.
   - Boot waits at most 4 s. Pinned in Task 3.
2. **A recording without `withoutQloo`** (an older file, or Gemini was unavailable when recording). Expected: the tab explains "This recording has no generic ranking", with no dead "Try again" button. Pinned in Task 1.
3. **A typed artist hits `NOT_FOUND`, `QLOO_AUTH`, `HTTP_502`, a network error or `BUDGET`.** Expected: every error notice on the board and the playbook offers "Try the showcase tour" next to Retry. `NOT_FOUND` also suggests checking the spelling. Pinned in Task 8.
4. **The judge path at 375 px, with long city names.** Expected: board → hidden goldmine → playbook → Tour Book → proof completes in under 120 s, with no horizontal scroll at any step. Pinned in Task 11.
5. **History leak in the public clone.** A forbidden blob could survive under an old path, a rename, or another branch's commit. Expected: the verify step scans every blob of every ref in the clone for the forbidden paths and for Qloo id patterns, and fails loudly. Pinned in Task 5.

---

## Phase A: judge-path correctness

### Task C0 (controller): build guard
- [ ] Run the `hack-guard` skill for slug `qloo` against the worktree, read-only. It creates or updates `~/Documents/hackathon-brain/hackathons/qloo/guard.md`: the claims ledger, product bar, architecture bar and calendar. Use it as the checklist for Tasks 6–12. Run `tools/secrets_scan.sh` before any brain commit, and never edit the brain's `core/`.

### Task 1: Record and replay the "Without Qloo" ranking

**Files:**
- Modify: `dashboard/scripts/record-showcase.mjs` (calls `/v1/without-qloo` after the board; writes `withoutQloo`)
- Modify: `dashboard/server/recordShowcase.test.js`
- Modify: `dashboard/src/lib/qloo/showcase.ts` (`Showcase.withoutQloo`, `parseShowcase`, `showcaseWithoutQloo()`)
- Modify: `dashboard/src/lib/qloo/client.ts` (replace `WITHOUT_SHOWCASE` with `WITHOUT_SHOWCASE_MISSING`; `fetchWithoutQloo` returns the recorded value in showcase mode)
- Modify: `dashboard/src/pages/TourBoard.tsx:171-180, 288-309` (showcase uses the recorded value; hide "Try again" when not live)
- Test: `dashboard/src/lib/qloo/showcase.test.ts`, `dashboard/src/pages/TourBoard.test.tsx`

**Interfaces:**
- Produces:
  - `Showcase.withoutQloo: WithoutQloo | null`
  - `showcaseWithoutQloo(): WithoutQloo` (returns `WITHOUT_SHOWCASE_MISSING` when null)
  - `WITHOUT_SHOWCASE_MISSING: WithoutQloo = { status: "unavailable", reason: "disabled", message: "This recording has no generic ranking" }`
  - `parseWithoutQloo` exported from `client.ts`
  - Recorder output gains a top-level key `withoutQloo`.

- [ ] **Step 1: Recorder test (failing).** In `recordShowcase.test.js`, the fake `fetchImpl` answers `POST /v1/without-qloo`. Assert that:
  - the recorder calls it once after the board, with body `{ artist, regions, cities }`, where `cities` holds the `city_scored` cities as `{name, country}` in board order;
  - the output has `withoutQloo` equal to the parsed JSON;
  - a non-2xx response gives `withoutQloo: { status: "unavailable", reason: "error", message: "Generic ranking unavailable" }`, logs a warning, and does not throw.

```js
it("records the generic ranking after the board", async () => {
  const calls = [];
  const fetchImpl = fakeGateway({ onWithoutQloo: (body) => { calls.push(body); return { status: "ok", ranked: body.cities.slice().reverse(), model: "gemini-x", cached: false }; } });
  const out = await record({ artist: "A", regions: ["Mexico"], gatewayUrl: "https://gw", token: "t", fetchImpl, now: new Date("2026-10-18T00:00:00Z"), sessionId: "s" });
  expect(calls).toHaveLength(1);
  expect(calls[0].cities.map((c) => c.name)).toEqual(boardCityNames);
  expect(out.withoutQloo.status).toBe("ok");
});
it("keeps recording when the generic ranking fails", async () => {
  const fetchImpl = fakeGateway({ withoutQlooStatus: 503 });
  const out = await record({ artist: "A", regions: ["Mexico"], gatewayUrl: "https://gw", token: "t", fetchImpl, now: new Date(), sessionId: "s" });
  expect(out.withoutQloo).toEqual({ status: "unavailable", reason: "error", message: "Generic ranking unavailable" });
});
```
  Extend the file's existing fake-gateway helper rather than writing a new one. `boardCityNames` is the helper's city list.
- [ ] **Step 2:** Run `cd dashboard && npx vitest run server/recordShowcase.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement it in `record()`.** After the board events are collected, and before the playbooks, call:

```js
let withoutQloo;
try {
  const cities = boardEvents.filter((e) => e.type === "city_scored").map((e) => ({ name: e.city.name, country: e.city.country }));
  const res = await call("/v1/without-qloo", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ artist, regions, cities }) });
  withoutQloo = await res.json();
} catch (err) {
  warn(`generic ranking not recorded (${err.message})`);
  withoutQloo = { status: "unavailable", reason: "error", message: "Generic ranking unavailable" };
}
```
  Add `withoutQloo` to the written object.
- [ ] **Step 4: Dashboard tests (failing).**
  - `showcase.test.ts`:
    - `parseShowcase({...withoutQloo: {status:"ok", ranked:[{name:"X",country:"MX"}], model:"m", cached:false}})` keeps it.
    - A malformed value (`{status:"ok", ranked:"x"}`) becomes `null`.
    - A missing key becomes `null`.
  - `TourBoard.test.tsx`, in showcase mode with a recording that has `withoutQloo.status === "ok"`: clicking the "Without Qloo" tab renders the ranked list, makes no `/api/qloo/without-qloo` request, and shows no "Try again" button.
  - With `withoutQloo: null`: the text "This recording has no generic ranking" shows, and no "Try again" button.
- [ ] **Step 5: Implement the dashboard side.**
  - Export `parseWithoutQloo` from `client.ts`.
  - In `parseShowcase`, set `withoutQloo: parseWithoutQloo(o.withoutQloo)`.
  - Add `showcaseWithoutQloo = () => SHOWCASE.withoutQloo ?? WITHOUT_SHOWCASE_MISSING`.
  - In `fetchWithoutQloo`, showcase mode returns `showcaseWithoutQloo()`. Import it lazily in the function, or pass it in through `opts`, to avoid a circular import between `client.ts` and `showcase.ts`. Pick the one that keeps the cycle out and note it in the report.
  - In `TourBoard.tsx`, use `showcaseWithoutQloo()` for `state.source === "showcase"`, and render the "Try again" button only when `state.source === "live"`.
- [ ] **Step 6:** Run `cd dashboard && npm test`. Expected: PASS.
- [ ] **Step 7:** Commit: `feat(showcase): record and replay the generic-LLM ranking for the Without Qloo tab`.

### Task 2: Metro anchoring and capital-city coverage

The Natalia Lafourcade showcase (Mexico, Brazil, US) scores El Paso, San Diego, Reynosa, Rio, Cabo Frio, Curitiba, Ciudad Juárez and Salvador. It has no Mexico City, Guadalajara or São Paulo. The calibration recordings also anchored suburbs (Ecatepec de Morelos, Osasco) instead of their metro. A promoter judge will read a Mexican star's board without Mexico City as a bug. Use superpowers:systematic-debugging. Find the root cause before changing anything.

**Files:**
- Investigate: `cloud_run/qloo_gateway/src/geo/cities.ts` (`METRO_CORES` lines 40-45, `metroAnchor` 48-66), `src/geo/heat.ts`, the candidate selection in `src/pipeline/tourBoard.ts`
- Modify: whichever of those holds the root cause
- Test: `cloud_run/qloo_gateway/test/geo.test.ts` (or the existing geo test file), `test/tourBoard.test.ts`

- [ ] **Step 1: Reproduce offline.**
  - Write a failing test that feeds `metroAnchor` the coordinates of Ecatepec de Morelos (19.6018, -99.0507) and Osasco (-23.5325, -46.7917), using the real cities table the gateway loads.
  - Expected after the fix: Mexico City (GeoNames 3530597) and São Paulo (3448439).
  - Also trace candidate selection with a heat list where Mexico City-area points are split across several suburbs. Does the split push the metro below the cut, or does a per-country or per-region cap drop it? Write down what you find in the report.
- [ ] **Step 2:** Run `cd cloud_run/qloo_gateway && npx vitest run test/geo.test.ts`. Expected: FAIL (it anchors to the suburb, or the metro is missing).
- [ ] **Step 3: Fix the root cause.**
  - At minimum, add these cores to `METRO_CORES`, with one comment each in the existing style:
    - Mexico City 3530597
    - São Paulo 3448439
    - Rio de Janeiro 3451190
    - Monterrey 3995465
    - Buenos Aires 3435910
    - Santiago 3871336
    - Bogotá 3688689
    - Lima 3936456
  - If Step 1 shows that heat from several suburbs is split before anchoring, merge points that anchor to the same city before ranking. Keep the largest value, or the sum capped at 100: pick whichever matches how `fanHeat` is defined in `heat.ts` and say why in the report.
  - Keep the set small and curated (per the code comment).
- [ ] **Step 4: Pin it with a test.** A `tourBoard.test.ts` case with a fake heat list where three Mexico City suburbs each have mid heat must score "Mexico City" once, and none of the suburbs.
- [ ] **Step 5:** Run `npm test && npm run typecheck` in `cloud_run/qloo_gateway`. Expected: PASS. Note: calibration is a fixed config, so `calibrate.test.ts` still reproduces `SCORING`. If it fails, stop and report; don't re-derive.
- [ ] **Step 6:** Commit: `fix(geo): anchor suburbs to their metro; capital cores for MX/BR/LatAm`.

### Task C1 (controller + Prateek): redeploy the gateway, re-record the showcase into private-data
- [ ] Ask Prateek to run `! cloud_run/qloo_gateway/scripts/deploy.sh`. Verify `/health` 200 with an identity token.
- [ ] Re-record with the scoped run Prateek approved for showcase work. Write it into the git-ignored `private-data/`, NOT into `dashboard/src/...`:
  `QLOO_GATEWAY_URL=… node dashboard/scripts/record-showcase.mjs --artist "Natalia Lafourcade" --regions "Mexico,Brazil,United States" --out private-data/showcase.json --window <next 7 days>`
- [ ] Check before accepting:
  - Mexico City is present;
  - the board has a `hidden_goldmine`;
  - `withoutQloo.status === "ok"`;
  - the playbooks narrate.
- [ ] If the board loses its hidden goldmine, show Prateek the verdict table and let him choose: keep the board, or record another artist from the four calibration artists. Ledger his choice.
- [ ] Copy `backtest/results.json` and `results-run2.json` into `private-data/backtest.json` as `{runs:[run1, run2]}`, the same shape as the current `dashboard/src/lib/qloo/fixtures/backtest.json`.
- [ ] Copy the 4 calibration recordings to `private-data/calibration/`.
- [ ] Ledger it.

## Phase B: Qloo data out of the public repo (D1)

### Task 3: Recordings served at runtime; synthetic fixtures for tests

**Files:**
- Create: `dashboard/server/recordings.js` (mount `GET /api/recordings/:name`)
- Create: `dashboard/server/recordings.test.js`
- Modify: `dashboard/server/index.js` (mount it before the SPA catch-all)
- Create: `dashboard/src/lib/qloo/recordings.ts` (`loadRecordings`, boot loader)
- Modify: `dashboard/src/lib/qloo/showcase.ts` (no JSON import; `SHOWCASE` becomes a live binding set by `setShowcase`)
- Modify: `dashboard/src/lib/qloo/backtest.ts` (no JSON import; `getBacktest()` / `setBacktest()`)
- Modify: `dashboard/src/main.tsx` (await `loadRecordings()` with a 4 s cap before render)
- Modify: `dashboard/src/pages/Proof.tsx`, `dashboard/src/pages/TourBoard.tsx` (the unavailable notice)
- Create: `dashboard/scripts/make-synthetic-recording.mjs` and the committed outputs `dashboard/src/test/fixtures/showcase.synthetic.json`, `dashboard/src/test/fixtures/backtest.synthetic.json`
- Modify: every test that imports `fixtures/showcase.json` or `fixtures/backtest.json` (`showcase.test.ts`, `Showcase.test.tsx`, `TourBoard.test.tsx`, `Landing*.test.tsx`, `backtest.test.ts`, `e2e/*.spec.ts`)
- Move (git mv, then git rm --cached after copying to private-data): `dashboard/src/lib/qloo/fixtures/showcase.json`, `dashboard/src/lib/qloo/fixtures/backtest.json`. Their contents already live in `private-data/` (C1). After this task they are untracked and git-ignored.
- Modify: `.gitignore` (add `private-data/`, `dashboard/src/lib/qloo/fixtures/showcase.json`, `dashboard/src/lib/qloo/fixtures/backtest.json`)
- Modify: `dashboard/vite.config.ts` (dev proxy: `/api/recordings` → the local Express server, the same way `/api` is proxied today; check the existing config)

**Interfaces:**
- Produces:
  - HTTP `GET /api/recordings/showcase` and `GET /api/recordings/backtest` → `200 application/json` (cache-control `public, max-age=300`), `404 {error}` for an unknown name, `503 {error:"recording unavailable"}` on a storage failure.
  - `loadRecordings({ fetchImpl?, timeoutMs? }): Promise<{ showcase: "ok"|"unavailable"; backtest: "ok"|"unavailable" }>`
  - `showcaseAvailable(): boolean` (false while `SHOWCASE.recordedAt === null`)
  - `setShowcase(s: Showcase)`
  - `setBacktest(b: unknown)`
  - `getBacktest(): BacktestRuns | null`

- [ ] **Step 1: Server test (failing), `recordings.test.js`.** Mount on a bare express app with injected deps `{ bucket, localDir, fetchImpl, getAccessToken }`. Cases:
  1. `localDir` set and the file exists: 200 with the file JSON.
  2. `localDir` unset and `bucket` set: fetches `https://storage.googleapis.com/storage/v1/b/<bucket>/o/<name>.json?alt=media` with `authorization: Bearer <token>`, returns 200 with the body.
  3. GCS answers 403: the response is 503 `{error:"recording unavailable"}`, and the log line has no token.
  4. `/api/recordings/../etc` and `/api/recordings/other`: 404.
  5. A second request within 5 minutes reuses the in-memory copy (the fake fetch is called once).
- [ ] **Step 2:** Run `cd dashboard && npx vitest run server/recordings.test.js`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `recordings.js`.**

```js
const NAMES = new Set(["showcase", "backtest"]);
const TTL_MS = 5 * 60_000;

export function mountRecordings(app, { bucket = process.env.RECORDINGS_BUCKET, localDir = process.env.RECORDINGS_DIR, fetchImpl = fetch, getAccessToken, readFile, now = Date.now } = {}) {
  const memo = new Map();
  app.get("/api/recordings/:name", async (req, res) => {
    const name = req.params.name;
    if (!NAMES.has(name)) return res.status(404).json({ error: "unknown recording" });
    const hit = memo.get(name);
    if (hit && now() - hit.at < TTL_MS) return res.set("cache-control", "public, max-age=300").type("application/json").send(hit.body);
    try {
      let body;
      if (localDir) body = await readFile(`${localDir}/${name}.json`, "utf8");
      else if (bucket) {
        const r = await fetchImpl(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(`${name}.json`)}?alt=media`, { headers: { authorization: `Bearer ${await getAccessToken()}` }, signal: AbortSignal.timeout(5000) });
        if (!r.ok) throw new Error(`storage returned ${r.status}`);
        body = await r.text();
      } else throw new Error("no recordings source configured");
      JSON.parse(body); // never serve a corrupt file
      memo.set(name, { at: now(), body });
      res.set("cache-control", "public, max-age=300").type("application/json").send(body);
    } catch (err) {
      console.error("[recordings]", name, err?.message ?? String(err));
      res.status(503).json({ error: "recording unavailable" });
    }
  });
}
```
  - In `index.js`, add `getRecordingsAccessToken()`. It mirrors `getQlooGatewayToken` (`index.js:85-97`), but uses the metadata path `/computeMetadata/v1/instance/service-accounts/default/token` (JSON `{access_token}`) with the fallback `gcloud auth print-access-token`, and is cached for 50 minutes.
  - Mount with `readFile` from `node:fs/promises`, before the static and catch-all routes.
- [ ] **Step 4: Synthetic generator.** `make-synthetic-recording.mjs <in> <out> --kind showcase|backtest`. It is deterministic (a seeded PRNG, seed 6) and keeps every key and array length. It replaces:
  - every Qloo entity `name` that is not a city or country → `Synthetic <Type> NN` (Type from the entity's `subtype` / `type` tail, e.g. `Synthetic Brand 03`);
  - every `entityId` / `entity_id` / `id` matching a UUID, or a 32-plus character hex string → a fake UUID derived from a hash of the original;
  - every `affinity`, `popularity` and demographic index → a seeded value of the same magnitude (±0.05 for 0–1 values);
  - tags → `synthetic-tag-NN`;
  - the artist → `Sample Artist`;
  - narrative `text` → a one-sentence placeholder that still contains each declared entity name and number, so claim checks hold;
  - `recordedAt` → kept.
  
  It keeps city names, countries, GeoNames ids, coordinates, our computed `fanHeat` / `activation` / `winnability` / `verdict` / `closeCall` / `scoring`, and the `withoutQloo` order with city names. For `--kind backtest` it keeps the case ids, types, cities, metrics and hit flags, and replaces the `top` lists with synthetic names, keeping each hit's rank by putting the case's expected name at the same index.
  
  Run it on `private-data/showcase.json` and `private-data/backtest.json`, and commit both outputs under `dashboard/src/test/fixtures/`. Add a generator test (`server/makeSynthetic.test.js`) on a tiny inline input: no original entity name or UUID survives (assert with a regex over the stringified output), and our score fields are byte-identical.
- [ ] **Step 5: Client loader test (failing), `recordings.test.ts`.** Cases:
  - Both endpoints 200: `setShowcase` and `setBacktest` are applied, and `showcaseAvailable()` becomes true.
  - The showcase endpoint returns 503: the result is `{showcase:"unavailable"}`, `SHOWCASE.recordedAt` stays `null` (the placeholder), and no throw.
  - A fetch that never resolves: it resolves within `timeoutMs` (use fake timers, 4000) with both `unavailable`.
- [ ] **Step 6: Implement the client.**
  - `showcase.ts`: drop `import raw`. Use `export let SHOWCASE: Showcase = placeholderShowcase()`, built from the existing Lumen Vale placeholder that `src/test/placeholderShowcase.ts` already builds. Move that builder into `src/lib/qloo/placeholderShowcase.ts` and re-export it from the test path. Add `export function setShowcase(s: Showcase) { SHOWCASE = s; }`. ES live bindings keep every `SHOWCASE.*` reader correct as long as nothing reads it before boot finishes.
  - `backtest.ts`: same idea, with `let BACKTEST: BacktestRuns | null = null`.
  - `recordings.ts`:

```ts
export async function loadRecordings({ fetchImpl = fetch, timeoutMs = 4000 }: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {
  const get = async (name: "showcase" | "backtest") => {
    try {
      const r = await fetchImpl(`/api/recordings/${name}`, { signal: AbortSignal.timeout(timeoutMs) });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  };
  const timeout = new Promise<[null, null]>((resolve) => setTimeout(() => resolve([null, null]), timeoutMs));
  const [show, bt] = await Promise.race([Promise.all([get("showcase"), get("backtest")]), timeout]);
  const parsed = show ? parseShowcase(show) : null;
  if (parsed && parsed.recordedAt) setShowcase(parsed);
  if (bt) setBacktest(bt);
  return { showcase: parsed?.recordedAt ? "ok" : "unavailable", backtest: bt ? "ok" : "unavailable" } as const;
}
```
  - `main.tsx`: `await loadRecordings()` before `createRoot(...).render(...)`. Wrap it in an async IIFE. Leave index.html's `#root` empty; boot is at most 4 s and usually one same-origin round trip.
  - `TourBoard.tsx`: when `state.source === "showcase"` and `!showcaseAvailable()`, render a `<Notice>`: "The showcase recording is unavailable right now." with a Link "Open the sample tour" → `/tours/board?sample=1`. Don't replay the placeholder as if it were the showcase.
  - `Proof.tsx`: when `getBacktest()` is null, render "Proof results are unavailable right now." with a Retry button that calls `loadRecordings()` and re-renders.
  - Update every test that imported the JSON so it calls `setShowcase(parseShowcase(synthetic))` / `setBacktest(synthetic)` in `beforeEach`, or keeps mocking with the placeholder as `Landing.test.tsx` does today. Assertions on real names or numbers (e.g. "Ciudad Juarez", "Natalia") become assertions on values read from the synthetic fixture. Never hard-code the synthetic values twice.
  - In e2e, `page.route("**/api/recordings/showcase", r => r.fulfill({ path: "src/test/fixtures/showcase.synthetic.json" }))`, and the same for backtest. Add a shared `e2e/fixtures.ts` helper `useSyntheticRecordings(page)` and call it in each spec's `beforeEach`.
- [ ] **Step 7: Review Focus 1 tests.**
  - `Showcase.test.tsx`: when the loader returns unavailable, `/tours/board?showcase=1` shows the unavailable notice and the sample link; the landing still shows the sample proof card.
  - `Proof.test.tsx`: no backtest gives the unavailable text plus Retry.
- [ ] **Step 8:** Run `cd dashboard && npm test && npm run build && E2E_PORT=5199 npm run e2e`. Expected: PASS. Then run `git ls-files | grep -E 'fixtures/(showcase|backtest)\.json$'`. Expected: no output.
- [ ] **Step 9:** Commit: `feat(dashboard): serve recordings from private storage; synthetic fixtures for tests`.

### Task 4: Gateway fixtures, backtest output, public-data guard

**Files:**
- Modify: `cloud_run/qloo_gateway/test/fixtures/live/*.json` (10 files → synthetic, same shape)
- Modify: `cloud_run/qloo_gateway/test/liveShapes.test.ts`, `cityPlaybook.test.ts`, `strategistTools.test.ts`, `tourBoard.test.ts` (assert on fixture-derived values)
- Modify: `cloud_run/qloo_gateway/test/calibrate.test.ts` (read `CALIBRATION_FIXTURES_DIR`, default `../../private-data/calibration`; explicit skip)
- Move: `cloud_run/qloo_gateway/test/fixtures/calibration/*.json` → untracked (`git rm --cached`; already copied to `private-data/calibration/` in C1)
- Modify: `cloud_run/qloo_gateway/src/backtest/cli.ts` (default `--out` → `../../private-data/backtest/results-<run>.json`; refuses a path inside a git-tracked dir unless `--allow-tracked`)
- Move: `backtest/results.json`, `backtest/results-run2.json` → untracked (`git rm --cached`; copies are in `private-data/`)
- Modify: `docs/qloo/api-notes.md` (replace example entity names, ids and values with `<entity>`, `<uuid>`, `0.xx`)
- Create: `scripts/check-public-data.sh` and add it to `run_tests.sh`
- Modify: `.gitignore` (`backtest/results*.json`, `cloud_run/qloo_gateway/test/fixtures/calibration/`)

**Interfaces:**
- Produces: `scripts/check-public-data.sh [--history <repo-path>]`. Exit 0 means clean; exit 1 lists the offending paths or blobs. The Task 5 verify step calls it with `--history`.

- [ ] **Step 1: Guard test first.** Write `scripts/check-public-data.sh`:

```bash
#!/usr/bin/env bash
# Fails if Qloo response data is tracked (Qloo dev guide: "Do not store Qloo response data in a public repository").
set -euo pipefail
FORBIDDEN_PATHS='(^|/)(fixtures/showcase\.json|fixtures/backtest\.json|backtest/results[^/]*\.json|test/fixtures/calibration/|private-data/)'
repo="${2:-.}"
if [[ "${1:-}" == "--history" ]]; then
  bad=$(git -C "$repo" rev-list --objects --all | awk '{print $2}' | grep -E "$FORBIDDEN_PATHS" | sort -u || true)
else
  bad=$(git -C "$repo" ls-files | grep -E "$FORBIDDEN_PATHS" || true)
fi
# Real Qloo entity ids are uppercase-hex UUIDs; synthetic fixtures use the 00000000- prefix.
ids=$(git -C "$repo" grep -I -l -E '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' -- ':!*package-lock.json' ':!*.png' | grep -v -E '00000000-' || true)
if [[ -n "$bad$ids" ]]; then echo "Qloo data found:"; printf '%s\n' $bad $ids; exit 1; fi
echo "public-data check: clean"
```
  Before finalising the id regex, check the real Qloo id format in `test/fixtures/live/describe.json`. Qloo ids may be lowercase or a different shape; adjust the regex to match the real format and report what it is. The `--history` mode must also scan blob contents for real ids, using `git -C "$repo" grep -I -E '<regex>' $(git -C "$repo" rev-list --all)`, bounded by `| head`.

  Run it now. Expected: exit 1, listing the current offenders.
- [ ] **Step 2: Replace the live fixtures.** Use the same generator idea as Task 3 (write `cloud_run/qloo_gateway/scripts/synthesize-fixture.mjs`, or reuse the dashboard script through a relative path). Fake ids start with `00000000-`. Update the tests that assert exact names or values so they read the expected value from the fixture.
- [ ] **Step 3: Calibration test.**

```ts
const dir = process.env.CALIBRATION_FIXTURES_DIR ?? fileURLToPath(new URL("../../../private-data/calibration", import.meta.url));
const present = existsSync(dir) && readdirSync(dir).some((f) => f.endsWith(".json"));
describe.skipIf(!present)("calibration reproduces SCORING from the private recordings (needs private-data/calibration)", () => { /* existing assertions, reading from dir */ });
it("calibration rule runs on synthetic recordings", () => { /* deriveCalibration on a small in-file synthetic set: gates evaluated, output shape valid */ });
```
  Keep the default-config `scoreCity` parity test, which runs on synthetic data. Then run `CALIBRATION_FIXTURES_DIR=$PWD/../../private-data/calibration npx vitest run test/calibrate.test.ts`. Expected: the reproduction test runs and passes, not skipped.
- [ ] **Step 4: Backtest CLI.** Test in `test/backtestCli.test.ts`:
  - `parseArgs([])` gives the default out under `private-data/backtest/`;
  - `--out backtest/results.json` without `--allow-tracked` throws "results contain Qloo data; write them under private-data/".
- [ ] **Step 5:** `git rm --cached` the calibration fixtures and backtest results, update `.gitignore`, redact `api-notes.md`, add `bash scripts/check-public-data.sh` as a step in `run_tests.sh`, and point the docs that link to `backtest/results*.json` (backtest/README.md, root README) at "served by the app at /proof; raw results kept private (Qloo data policy)".
- [ ] **Step 6:** Run `./run_tests.sh`. Expected: all suites pass and "public-data check: clean".
- [ ] **Step 7:** Commit: `chore(data): Qloo responses out of git — synthetic fixtures, private calibration and backtest results, public-data guard`.

### Task 5: Public-clone script

**Files:**
- Create: `scripts/make-public-clone.sh`
- Create: `scripts/README-public-clone.md` (what it does, what Prateek runs after)

**Interfaces:**
- Consumes: `scripts/check-public-data.sh --history <path>` (Task 4)
- Produces: a local clone at `$1` (default `../tour-intelligence-qloo-public`), with `master` = the tip of `worktree-plan-1-qloo-gateway`, the forbidden paths stripped from every commit, no remotes, and all checks passed.

- [ ] **Step 1: Write the script.** It is safe by construction: it only writes the target directory, and refuses if that exists.

```bash
#!/usr/bin/env bash
# Builds the public repo locally: same commits, with Qloo response data stripped from every commit. Never pushes.
set -euo pipefail
SRC="$(git rev-parse --show-toplevel)"
DEST="${1:-$SRC/../tour-intelligence-qloo-public}"
BRANCH="${BRANCH:-worktree-plan-1-qloo-gateway}"
[[ -e "$DEST" ]] && { echo "refusing: $DEST exists"; exit 1; }
git clone --no-local --single-branch --branch "$BRANCH" "$SRC" "$DEST"
cd "$DEST"
git checkout -B master
git branch -D "$BRANCH"
git remote remove origin
STRIP='dashboard/src/lib/qloo/fixtures/showcase.json dashboard/src/lib/qloo/fixtures/backtest.json backtest/results.json backtest/results-run2.json cloud_run/qloo_gateway/test/fixtures/calibration cloud_run/qloo_gateway/test/fixtures/live'
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --force --index-filter "git rm -r --cached --ignore-unmatch -q $STRIP" --prune-empty -- master
# Re-add today's synthetic live fixtures (stripped above with their history).
git -C "$SRC" archive "$BRANCH" cloud_run/qloo_gateway/test/fixtures/live | tar -x
git add cloud_run/qloo_gateway/test/fixtures/live
git commit -q -m "test: synthetic Qloo response fixtures (same shape, fake values)" -m "$TRAILER"
rm -rf .git/refs/original && git reflog expire --expire=now --all && git gc --prune=now --aggressive -q
bash "$SRC/scripts/check-public-data.sh" --history "$DEST"
SCAN="$HOME/Documents/hackathon-brain/tools/secrets_scan.sh"
if [[ -f "$SCAN" ]]; then bash "$SCAN" "$DEST"; else echo "secrets scan skipped: $SCAN not found"; fi
echo "Public clone ready at $DEST (master, no remote). Next (Prateek): see scripts/README-public-clone.md"
```
  Define `TRAILER` near the top of the script as the two trailer lines from Global Constraints. The fixture re-add takes the CURRENT synthetic files from the source branch tip through `git archive`, because those blobs are gone from the clone after the filter. Check `secrets_scan.sh`'s real arguments with `head -30` on it first, and adapt the call.

  The commit message must carry the trailer from Global Constraints.
- [ ] **Step 2: Dry-run test.** Run `bash scripts/make-public-clone.sh "$SCRATCH/public-test"`, with `$SCRATCH` = the session scratchpad. Expected:
  - "public-data check: clean";
  - `git -C "$SCRATCH/public-test" log --oneline | wc -l` is within 5 of the source count;
  - `git -C … log --format=%ad --date=short | tail -1` is unchanged (dates kept);
  - `ls` shows the synthetic live fixtures present.
- [ ] **Step 3: Review Focus 5 test.** In a throwaway repo (`git init` in scratch), commit a file at `backtest/results.json`, rename it to `old/results.json` in a later commit, then run the `--history` check. Expected: exit 1, listing the blob. Then extend `STRIP` handling: the check covers renamed blobs because it scans the paths of every object in `rev-list --objects --all`, and blob contents for real ids. Script this as `scripts/test-check-public-data.sh` and add it to `run_tests.sh`.
- [ ] **Step 4:** Write `scripts/README-public-clone.md` with Prateek's steps, all run by him:
  1. `gh repo rename tour-intelligence-qloo-private -R prats-2311/tour-intelligence-qloo` (D3).
  2. `gh repo create prats-2311/tour-intelligence-qloo --public --source <DEST> --push --description "Tour Intelligence × Qloo — Win their city"`.
  3. Check that `gh api repos/prats-2311/tour-intelligence-qloo --jq .license.spdx_id` prints `MIT`.
  4. Open the repo logged out.
- [ ] **Step 5:** Commit: `chore: public-clone script — strips Qloo data from history, verifies, never pushes`.

### Task C2 (Prateek): private bucket, IAM, dashboard redeploy
- [ ] Prateek runs:
  - `! gcloud storage buckets create gs://liifecalling-academy-tour-intel-private --project liifecalling-academy --location us-central1 --uniform-bucket-level-access --public-access-prevention`
  - `! gcloud storage cp private-data/showcase.json private-data/backtest.json gs://liifecalling-academy-tour-intel-private/`
  - `! gcloud storage buckets add-iam-policy-binding gs://liifecalling-academy-tour-intel-private --member serviceAccount:dashboard-sa@liifecalling-academy.iam.gserviceaccount.com --role roles/storage.objectViewer`. Confirm the SA email with `gcloud run services describe tour-intel-qloo --region us-central1 --format='value(spec.template.spec.serviceAccountName)'` first.
- [ ] Before this, a subagent adds `RECORDINGS_BUCKET=liifecalling-academy-tour-intel-private` to `--set-env-vars` in `dashboard/scripts/deploy.sh`, as part of Task 3's commit or a one-line follow-up.
- [ ] Prateek runs `! dashboard/scripts/deploy.sh`.
- [ ] The controller verifies:
  - `curl -s https://tour-intel-qloo.web.app/api/recordings/showcase | head -c 200` returns JSON;
  - `/tours/board?showcase=1` replays, and the Without Qloo tab lists cities;
  - `/proof` renders both runs.

## Phase C: story, polish, resilience

### Task 6: Name, title, nav, MCP strings, WebMCP token, legacy archive

**Files:**
- Modify: `dashboard/index.html:7-17` (title `Win their city · Tour Intelligence × Qloo`; the origin-trial meta comes from a build-time env)
- Modify: `dashboard/vite.config.ts` (HTML transform: inject `<meta http-equiv="origin-trial" content="%VITE_WEBMCP_OT_TOKEN%">` only when `VITE_WEBMCP_OT_TOKEN` is set)
- Modify: `dashboard/src/components/WebMcpTools.tsx` (copy: works in Chrome with WebMCP enabled; no claim of an origin trial when there's no token; drop the Dialogflow mention)
- Modify: `dashboard/src/components/AppShell.tsx:8-21` (remove "Campaigns" from `NAV_ITEMS`; keep the routes reachable by URL; `CAMPAIGN_PREFIXES` unchanged)
- Modify: `cloud_run/agent_mcp_server/main.py:65-71` (when `MCP_PUBLIC`, server name `tour-intelligence-qloo` with instructions "Taste tools from Tour Intelligence × Qloo: find tour markets a mid-tier artist can win, and the per-city playbook (sponsor, co-bill, venue, local moment). Backed by Qloo taste data; rate-limited public demo." The non-public mode keeps the legacy string.)
- Modify: `cloud_run/delight_card_renderer/templates/tour_book.html:295` only if the Qloo Tour Book uses that template. Check with `git grep -n tour_book.html dashboard cloud_run/qloo_gateway`; if it doesn't, leave it (legacy, still deployed).
- Move (`git mv` into `archive/google-hackathon-2026/`): `parallel_partner.md`, `ibm_partner.md`, `devpost_google_hackathon_overview.md`, `devpost_submission.md`, `demo_video_script.md`, `agentic-tour-promo-intelligence.md`. Add `archive/README.md` with two lines: "Material from the earlier Agentic Cinema (Google Cloud × Devpost) entry this project was forked from. Not part of the Qloo submission."
- Test: `dashboard/src/components/AppShell.test.tsx`, `cloud_run/agent_mcp_server/tests/test_public_mode.py`, `dashboard/src/test/indexHtml.test.ts` (new)

- [ ] **Step 1: Failing tests.**
  - `AppShell.test.tsx`: the nav has exactly the labels `["Discover","Tours","Insights"]`, and `/campaign` still renders when visited directly.
  - `indexHtml.test.ts`: read `index.html`. The `<title>` equals `Win their city · Tour Intelligence × Qloo`. It does not contain "Nova Horizon", and it has no `origin-trial` meta literal.
  - `test_public_mode.py`: the public server's `instructions` contain "Tour Intelligence × Qloo" and not "Agentic Tour".
- [ ] **Step 2:** Run the three tests. Expected: FAIL.
- [ ] **Step 3:** Implement the changes listed under Files. The Vite transform:

```ts
{ name: "webmcp-origin-trial", transformIndexHtml(html) {
    const token = process.env.VITE_WEBMCP_OT_TOKEN;
    return token ? html.replace("</head>", `  <meta http-equiv="origin-trial" content="${token.replace(/"/g, "")}">\n</head>`) : html;
} }
```
  In `dashboard/scripts/deploy.sh`, pass `VITE_WEBMCP_OT_TOKEN` through `--set-build-env-vars` only when it's set in Prateek's shell. Keep the existing `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`.
- [ ] **Step 4: Old-term sweep of the Qloo product path only.** Run `git grep -n -i -E 'nova horizon|agentic cinema|blockbuster|parallel partner|ibm' -- dashboard/src dashboard/index.html cloud_run/qloo_gateway/src cloud_run/agent_mcp_server/main.py cloud_run/agent_mcp_server/taste_tools.py`. Expected after the fix: no user-facing hits. Test fixtures that use "Nova Horizon" as a sample campaign name in legacy tests stay as they are.
- [ ] **Step 5:** Run the dashboard tests, `.venv/bin/pytest cloud_run/agent_mcp_server`, and `npm run build`. Expected: PASS.
- [ ] **Step 6:** Commit: `chore: product name and title, hide legacy Campaigns nav, public MCP instructions, WebMCP token from env, archive legacy docs`.

### Task 7: Landing three-beat story, with numbers from the recording

**Files:**
- Create: `dashboard/src/lib/qloo/story.ts` (`storyBeats(show: Showcase): StoryBeats | null`)
- Test: `dashboard/src/lib/qloo/story.test.ts`
- Modify: `dashboard/src/pages/Landing.tsx` (the three beats under the hero; "Try the showcase tour" stays the primary action)
- Test: `dashboard/src/pages/Landing.test.tsx`

**Interfaces:**
- Produces:

```ts
export interface StoryBeats {
  decision: { artist: string; regions: string[]; markets: number };           // beat 1: "Natalia Lafourcade, 8 markets across Mexico, Brazil and the US. Where do you hold dates?"
  missed: { city: string; densityRank: number; winnabilityRank: number; verdictLabel: string }; // beat 2: the city density misses
  plan: { city: string; sponsor: string | null; coBill: string | null; localAct: string | null }; // beat 3: what its playbook says
}
export function storyBeats(show: Showcase): StoryBeats | null;
```
  - `missed` is the city with the largest positive `densityRank − winnabilityRank` among `hidden_goldmine` cities; if there's none, among `play` cities. Use the same rank functions `proofFor` uses in `showcase.ts`, and do not re-implement ranking.
  - `plan` reads that city's playbook events: the first sponsor card's top item name, the first co-bill, and the first local act. Read the card types from `types.ts` (`PlaybookCard` kinds), and return null fields when missing.
  - If `show.recordedAt === null`, it returns null.

- [ ] **Step 1: Failing test, `story.test.ts`.** Using the synthetic showcase fixture (`setShowcase` not needed; pass it in):
  - `missed.city` equals the fixture's hidden goldmine city name. Compute the expected value in the test from the fixture's `city_scored` events, so nothing is hard-coded.
  - `densityRank > winnabilityRank`.
  - `markets` equals the count of `city_scored` events.
  - The placeholder (`recordedAt: null`) gives `null`.
- [ ] **Step 2: Story-number test (spec §1.2b rule 1), in `Landing.test.tsx`.** With the synthetic recording set via `setShowcase`, the rendered landing contains `beats.decision.markets`, `beats.missed.city`, `ordinal(beats.missed.densityRank)` and `ordinal(beats.missed.winnabilityRank)`, and `beats.plan.sponsor` when it's non-null. Every value comes from `storyBeats(SHOWCASE)` in the test, never typed by hand. With the placeholder, the beats section is not rendered and the existing sample card shows.
- [ ] **Step 3:** Run `cd dashboard && npx vitest run src/lib/qloo/story.test.ts src/pages/Landing.test.tsx`. Expected: FAIL.
- [ ] **Step 4: Implement it.** The section sits below the hero copy and above the proof card. It is an ordered list of three short beats, each a small label plus one sentence:
  1. **The hold.** "{artist}: {markets} markets across {regions}. Which ones get dates?"
  2. **The city density misses.** "{city} ranks {ordinal(densityRank)} on fan density and {ordinal(winnabilityRank)} on winnability — {verdictLabel}."
  3. **How you win it.** "Its playbook: pitch {sponsor}, put {localAct ?? coBill} on the bill." Drop a clause whose value is null; if both are null, say "Its playbook: sponsor, venue and promo plan."
  
  Use `VERDICT_LABELS` from `labels.ts` for `verdictLabel`. Use the existing type scale and tokens, with no new colors. At 375 px it's one column; at md and up it's three columns.
- [ ] **Step 5:** Run `cd dashboard && npm test`. Expected: PASS. Then check 375 px manually with `E2E_PORT=5199 npm run e2e -- layout.spec.ts`.
- [ ] **Step 6:** Commit: `feat(landing): three-beat promoter story with numbers from the showcase recording`.

### Task 8: Tour Book framing, microcopy pass, live-path resilience

**Files:**
- Modify: `dashboard/src/components/book/BookCover.tsx` (cover reads as the advance / sponsor-pitch document)
- Modify: `dashboard/src/pages/TourBoard.tsx:239-247` (error notice: showcase action for every code)
- Modify: `dashboard/src/pages/CityPlaybook.tsx:109-131` (same for playbook errors)
- Modify: strings in `TasteInsights.tsx`, `AppShell.tsx` (the nav label "Insights" becomes "Taste"; route unchanged), `strategist/*`, `TourBoard.tsx:407` ("Compare in Taste Insights" becomes "Compare taste")
- Create: `dashboard/src/test/copyRules.test.ts`
- Test: `dashboard/src/pages/TourBoard.test.tsx`, `CityPlaybook.test.tsx`, `components/book/BookCover.test.tsx`

- [ ] **Step 1: Failing copy-rules test.** It scans the user-facing strings in `dashboard/src/**/*.tsx` and `dashboard/src/lib/qloo/labels.ts`. Read the files, take JSX text and string literals, and skip `*.test.*`, `pages/Dashboard.tsx`, `pages/CityDetail.tsx`, `pages/NewCampaign.tsx`, `pages/CompareCities.tsx` and `pages/AddCities.tsx` (legacy, off the nav). Fail on: `/\bAI[- ]powered\b/i`, `/\binsights?\b/i` in visible copy, `/audience overlap/i`, `/\b\d+\s?%\s*(overlap|shared)/i`, `/\bleverage\b/i`, `/\bunlock\b/i`, `/\bseamless/i`. Print `file:line` for each hit.
- [ ] **Step 2:** Run `cd dashboard && npx vitest run src/test/copyRules.test.ts`. Expected: FAIL, listing the "Insights" hits.
- [ ] **Step 3: Microcopy pass.** Fix every hit. While in those files, swap product language for promoter language where it reads naturally: "markets" for cities in headings, "hold dates" for "build tour" on the Tour Board CTA ("Build tour" → "Hold these dates"). Keep the "Open Tour Book" label. Keep test ids stable; update tests that match on old text.
- [ ] **Step 4: Tour Book cover test (failing).**
  - The cover shows the label "Advance & sponsor pitch", `{artist}`, `{regions} · {season}`, the line "{n} markets held — why each one, and how to win it", and the existing tagline.
  - In sample or showcase mode, the `SampleBanner` still shows.
  
  Then implement it in `BookCover.tsx`, taking `n` from the props the page already passes (count of chapters). Check `TourBook.tsx:272` for what's available, and add a prop if needed.
- [ ] **Step 5: Live-path resilience tests (Review Focus 3), failing.** For `TourBoard.test.tsx`, for each error code in `["NOT_FOUND","QLOO_AUTH","HTTP_502","NETWORK","BUDGET","INTERNAL"]`:
  - the notice shows a "Try the showcase tour" button;
  - for every code except BUDGET, a "Retry" button too;
  - for NOT_FOUND, the extra line "Check the spelling, or pick from the suggestions." appears.
  
  Do the same for `CityPlaybook.test.tsx` with `BUDGET` and `HTTP_502`. Use the existing reducer-driven test setup in those files.
- [ ] **Step 6:** Implement the error-notice change: always render the showcase action, with Retry alongside for non-budget errors. Run `cd dashboard && npm test`. Expected: PASS.
- [ ] **Step 7:** Commit: `feat(copy): Tour Book as the advance document, promoter microcopy, showcase route from every error`.

### Task 9: Gateway keep-alive: cache TTL, trends key, persisted daily count

**Files:**
- Modify: `cloud_run/qloo_gateway/src/cache.ts:4-21, 73` (`QLOO_CACHE_TTL_DAYS`, default 45, for non-trends tools; trends stays 1 day; grace unchanged at 7 days)
- Modify: `cloud_run/qloo_gateway/src/pipeline/tourBoard.ts:179` (trends `end_date` rounded down to the Monday of the week, `start_date` = that − 90 days, so a cached board costs at most 1 trends call per week)
- Modify: `cloud_run/qloo_gateway/src/budget.ts` + `server.ts:29` (the global daily Qloo count persisted in Firestore doc `qloo_usage/<YYYY-MM-DD>` when `QLOO_USAGE_BACKEND=firestore`, the same pattern as `gemini_usage`)
- Modify: `cloud_run/qloo_gateway/scripts/deploy.sh` (`QLOO_CACHE_TTL_DAYS=45`)
- Test: `test/cache.test.ts`, `test/tourBoard.test.ts`, `test/budget.test.ts`

- [ ] **Step 1: Failing tests.**
  - `ttlMs("qloo_recommend")` with env 45 gives `45*DAY`; with the env unset it also gives `45*DAY`; with an invalid env (`"abc"`, `"0"`, `"-3"`) it falls back to 45. `ttlMs("qloo_trends")` gives `DAY`.
  - With a board on `today = 2026-10-22` (Thursday), the trends call has `end_date "2026-10-19"` and `start_date "2026-07-21"`.
  - A Firestore-backed daily count: two `BudgetGuard` instances sharing one fake Firestore together stop at the ceiling. Reuse the fake used by the Gemini usage tests.
- [ ] **Step 2:** Run `npx vitest run test/cache.test.ts test/tourBoard.test.ts test/budget.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement it, following the existing Gemini persistence code (`gemini_usage/<YYYY-MM>`) for the Firestore transaction shape. The per-session counts stay in memory.
- [ ] **Step 4:** Run `npm test && npm run typecheck`. Expected: PASS. Update `cloud_run/qloo_gateway/CLAUDE.md`: the Cache and Budget lines.
- [ ] **Step 5:** Commit: `feat(gateway): 45-day cache for the judging window, weekly trends key, shared daily Qloo count`.

### Task 10: Plan 5 deferred minors (batch)

**Files:** listed per item. One implementer, one review.

- [ ] **(a) Why-sheet floors.** In `WhyThisScore.tsx:12`, show the actual floor values from `cfg.affinityFloors` (e.g. "sponsor 0.92 · hooks 0.95 · venue 0.88") in the floored paragraph. Test: render with the calibrated config and expect "0.92" in the sheet.
- [ ] **(b) Close-call band.** `labels.ts:46` `CLOSE_CALL_NOTE` becomes `closeCallNote(band: number)`, with band read from the stream's `scoring` event (add `closeCallBand` to the gateway `scoring` event if it isn't already there; `CLOSE_CALL_BAND` lives in `scoring/winnability.ts`). Test: band 3 renders "Within 3 points".
- [ ] **(c) Proof accent.** In `Proof.tsx:81-82`, the gold accent goes to the method with the highest hit@10 in each run, not always `qloo_playbook`. Test: with the synthetic backtest where `llm_only` leads, the `llm_only` column has `border-gold` and the playbook column does not.
- [ ] **(d) Talent "not found" overcount.** `cityPlaybook.ts` adds `suggestionsSkipped` (past `LOCAL_DESCRIBE_CAP`) next to `suggestionsUnresolved` (looked up, no match). `Talent.tsx` renders "N weren't found in Qloo" only for unresolved, and "M more weren't checked (lookup limit)" for skipped. Tests: in the gateway, 8 non-pool suggestions give unresolved ≤ 5 and skipped 3; also the dashboard copy.
- [ ] **(e) README:114 wording.** Superseded by Task 12's README rewrite. Just make sure the new README says the test "re-derives the calibration from the recordings and compares it with `SCORING`".
- [ ] **(f) qlooProxy flake.** In `dashboard/server/qlooProxy.test.js`, reproduce with `npx vitest run server --sequence.concurrent` or the full suite several times. The 404 most likely comes from a shared app or port between tests: give each test its own `express()` instance and an ephemeral port (`listen(0)`). Run the full dashboard suite 5 times in a row; expected: 5 passes.
- [ ] **(g) Lede wording.** In `Talent.tsx`, the suggested-lead warning keys on "resolved and not a duplicate of a pool act". Test: all resolved suggestions duplicate pool acts, so no "suggested" lead warning.
- [ ] Run all suites. Expected: PASS. Commit: `fix: Plan 5 deferred minors — floors shown, close-call band from stream, proof accent on leader, unchecked suggestions, proxy test isolation`.

### Task 11: Judge-path e2e, screenshots, CI

**Files:**
- Create: `dashboard/e2e/promoter-path.spec.ts`
- Modify: `dashboard/e2e/snapshots.mjs` (a showcase run that writes captioned PNGs to `docs/screens/`, using the REAL recording only when run against the deployed URL; see Step 4)
- Create: `.github/workflows/test.yml` (gateway, dashboard, pytest, public-data check, on push and PR)
- Create: `.github/workflows/live-judge-path.yml` (daily 06:00 UTC plus manual: Playwright against `https://tour-intel-qloo.web.app`, the promoter path on the real showcase)
- Modify: `dashboard/playwright.config.ts` (`E2E_BASE_URL` env: when set, no webServer and use that base URL)

- [ ] **Step 1: Write `promoter-path.spec.ts`** (Review Focus 4). It runs in both projects (mobile 375×812, desktop 1280×800), with synthetic recordings via `useSyntheticRecordings(page)` unless `E2E_BASE_URL` is set. Steps:
  1. Landing: the three beats are visible; click "Try the showcase tour".
  2. Board: the hidden-goldmine city card is visible. Read its name from the page, not hard-coded. The "Without Qloo" tab lists the same number of cities as the board.
  3. Open that city's playbook: the sponsor card is visible, and "Checked against real tours" links to `/proof`.
  4. Back to the board, "Hold these dates", "Open Tour Book": "Advance & sponsor pitch" is visible.
  5. Go to `/proof`: both runs are visible.
  
  At each step, assert `await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)`. The whole test takes under 120 s (`test.setTimeout(120_000)`, plus an elapsed-time assertion as `judge-path.spec.ts` does). With synthetic data and no `E2E_BASE_URL`, it also asserts zero requests to `/api/qloo/`.
- [ ] **Step 2:** Run `cd dashboard && E2E_PORT=5199 npm run e2e -- promoter-path.spec.ts`. Expected: PASS in both projects. If a step fails because of a real bug, fix it in this task and say so in the report.
- [ ] **Step 3: CI.** `test.yml`:
  - `actions/checkout@v4`, `actions/setup-node@v4` (node 22, npm cache), `actions/setup-python@v5` (3.12);
  - `pip install -r requirements-dev.txt`, `pytest`;
  - `cd cloud_run/qloo_gateway && npm ci && npm test && npm run typecheck`;
  - `cd dashboard && npm ci && npm test && npm run build`;
  - `bash scripts/check-public-data.sh`.
  
  No secrets are needed; the calibration reproduction skips with its visible name. `live-judge-path.yml`: `cd dashboard && npm ci && npx playwright install --with-deps chromium && E2E_BASE_URL=https://tour-intel-qloo.web.app npx playwright test promoter-path.spec.ts`, plus `schedule: - cron: "0 6 * * *"` and `workflow_dispatch`. It hits the live site about once a day, which also keeps the caches warm. Validate both files with `npx --yes action-validator` if available, or else a YAML parse with `node -e "require('yaml')"`, and report which one you used.
- [ ] **Step 4: Screenshots for Devpost/README.** `snapshots.mjs --base https://tour-intel-qloo.web.app --out docs/screens/` captures, at 1280×800 and 390×844:
  - landing;
  - board (Winnability);
  - board (Without Qloo);
  - the hidden-goldmine playbook;
  - the Tour Book cover;
  - /proof.
  
  These are screenshots of our own product UI, which shows Qloo-derived names. That is a rendered product view, not response data, and Devpost requires showing the product. The controller runs this in C3 after deploy, not the implementer. The implementer only adds the `--base` flag and the shot list, and tests it against the local dev server with synthetic data, writing into the scratchpad, not `docs/`.
- [ ] **Step 5:** Commit: `test(e2e): promoter judge path at 375px and desktop; CI and daily live judge-path workflows`.

### Task 12: README, ADRs, spec and CLAUDE.md

**Files:**
- Rewrite: `README.md` (in kit order; see below)
- Create: `docs/adr/0001-qloo-through-harness-gateway.md`, `docs/adr/0002-winnability-not-density.md`, `docs/adr/0003-recordings-private-synthetic-tests.md`
- Modify: `docs/superpowers/specs/2026-10-16-tour-intelligence-qloo-design.md` (§1.2b rule 1 "the loaded showcase recording (private storage; synthetic fixture in tests)"; §10 the data-hygiene row; D2 name)
- Modify: `CLAUDE.md` (root), `dashboard/CLAUDE.md`, `cloud_run/qloo_gateway/CLAUDE.md` (recordings endpoint, private-data, public-data check, public clone)
- Modify: `backtest/README.md` (results private; how to regenerate)

- [ ] **Step 1: README in this order.** Every number in it must come from `private-data/showcase.json`, `docs/qloo/calibration.md` or the backtest results. Write `scripts/readme-numbers.mjs`, which prints the values; paste from its output and say so in the report.
  1. H1 "Tour Intelligence × Qloo", the tagline "Win their city.", and a 3-line pitch in promoter language: who, the decision, proof.
  2. Links: the live app `https://tour-intel-qloo.web.app` (and `?showcase=1`), `/proof`, the public MCP URL, the MIT licence, and the CI badge.
  3. **The 2-minute judge path:** 5 numbered steps with the screenshots from `docs/screens/`, added in C3.
  4. **How it uses Qloo:** a table of all 10 harness tools: tool, its product job, the screen where it shows. Then a redacted request → result example for one `qloo_recommend` call with shape only (`<entity>`, `0.xx`).
  5. **Proof, honestly:** both runs, hit@10 for the playbook vs city popularity vs LLM-only, what we learned, and the link to `/proof`.
  6. **How scores work:** winnability = 0.5 × fan heat + 0.5 × activation; the calibration summary; the close-call flag.
  7. **Architecture:** a Mermaid diagram covering dashboard SPA → dashboard server (BFF, recordings) → qloo_gateway → `qloo mcp` harness → Qloo; plus Gemini (Vertex), Tavily, Firestore cache, public MCP; links to the ADRs.
  8. **Run it from a clean machine:** Node 22, `npm i -g @qloo/qloo-harness@^0.1.26`, `qloo setup --qloo`, env vars by name only, the test commands, and the dev server with `RECORDINGS_DIR` (synthetic fixtures work as a stand-in).
  9. **Limitations:**
     - affinity is not a ticket forecast;
     - the local-act hybrid is untested;
     - the backtest sample size;
     - the public MCP is a rate-limited demo on the author's Qloo key (S9 disclosure);
     - WebMCP needs Chrome with the feature enabled.
  10. **Data policy:** no Qloo response data in this repo; recordings are served from private storage; tests use synthetic fixtures.
  11. **New vs existing project:** forked from the author's Agentic Cinema (Google Cloud) entry, which supplies the legacy tour_data_api, Dialogflow agents and renderer (see `archive/`). The Qloo work began 2026-10-16: the gateway, scoring, Tour Board, playbooks, Tour Book, strategist, MCP tools, proof and calibration. Give the commit count since 2026-10-16 using `git rev-list --count --since=2026-10-16 HEAD`.
  12. Licence.
- [ ] **Step 2: ADRs**, Nygard format, each ≤ 40 lines: context, decision, consequences.
- [ ] **Step 3: Checks.**
  - Run `npx --yes markdown-link-check README.md -q` (or a local link check) to confirm relative links resolve.
  - Grep that the README contains none of "Agentic Tour & Promo", "Parallel partner", "Nova Horizon", "AI-powered".
  - Run `bash scripts/check-public-data.sh`.
- [ ] **Step 4:** Commit: `docs: README in kit order, ADRs, spec and CLAUDE.md for private recordings and the public clone`.

## Phase D: ship (controller + Prateek)

### Task C3: Deploy, verify, screenshots
- [ ] Prateek runs the gateway deploy (Task 9 env) and the dashboard deploy (Tasks 3, 6–8, 10), plus `deploy_public.sh` (Task 6 MCP strings).
- [ ] The controller verifies:
  - `/health`;
  - the recordings endpoint;
  - the showcase path on a phone-size viewport;
  - the MCP `initialize` instructions.
- [ ] The controller runs `node dashboard/e2e/snapshots.mjs --base https://tour-intel-qloo.web.app --out docs/screens/`, commits the PNGs, and fills README §3.
- [ ] Run `E2E_BASE_URL=https://tour-intel-qloo.web.app npx playwright test promoter-path.spec.ts` from `dashboard/`. Expected: PASS.

### Task C4: Final review
- [ ] Do a whole-branch Opus review from Plan 6's first commit, per subagent-driven-development, with one fix wave.

### Task C5: Public repo (Prateek)
- [ ] The controller runs `bash scripts/make-public-clone.sh` into `../tour-intelligence-qloo-public` and shows Prateek its output (commit count, check results).
- [ ] Prateek runs the D3 steps in `scripts/README-public-clone.md`.
- [ ] The controller verifies logged out:
  - the repo page loads;
  - the licence shows MIT;
  - the CI run is green.
- [ ] Ledger it. Merging the private repo's master is optional and Prateek's call.

### Task C6: Pitch, review, preflight
- [ ] `hack-pitch` drafts the Devpost text (story first, then tech) and the 28701 answer with numbers, saving it to the brain, not the repo.
- [ ] `hack-review` does a cold-judge read of the live app, README and draft.
- [ ] Fix whatever it finds (dispatched to Sonnet).
- [ ] `hack-preflight` runs until GO.
- [ ] Prateek asks the quota question in Qloo's Discord (R1).

### Task C7: Devpost and submit (Prateek go-ahead required for every write)
- [ ] With Prateek's explicit go-ahead: create the Devpost project with the D2 name, fill fields 28597, 28598 (`https://tour-intel-qloo.web.app`), 28599 (the public repo) and 28701, and upload the gallery images from `docs/screens/`.
- [ ] Use `hack-submit` and submit by Oct 29. After the deadline, make no changes.
- [ ] Keep-alive through 2026-11-23: the daily live workflow stays on, and nobody redeploys during judging unless something breaks.
