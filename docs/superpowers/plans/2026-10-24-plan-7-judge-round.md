# Plan 7: judge round (venue fit, one thread, cities that move, proof v3, sponsor lift, ask-about-this-tour)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the live app one coherent, honest promoter journey that judges can use in five minutes. The journey is Markets → Decide → Playbook → Tour Book. It needs believable geography, a visible "where you can win" decision, a fair proof against an LLM-only ranking, and an agent that works the screen.

**Architecture:** The gateway (`cloud_run/qloo_gateway`) changes what it asks Qloo for: venue categories, the largest market per region and a sponsor baseline. The dashboard (`dashboard/`) reshapes the routes into four steps and adds the movers and agent surfaces. Proof v3 is a new backtest method in `src/backtest/`. Recordings stay private (`private-data/`) and are served by the BFF; tests use synthetic fixtures.

**Tech stack:** Node 22 TS gateway (Express 5, `qloo mcp` harness), React/Vite/Tailwind dashboard, Vitest, Playwright, Vertex Gemini.

**Spec:** `docs/superpowers/specs/2026-10-16-tour-intelligence-qloo-design.md`. **Decisions:** the brain note `hackathons/qloo/decisions-2026-10-24.md` (D1–D21), as relayed by the hub session and confirmed by Prateek on 2026-10-24. **Code map:** `.superpowers/sdd/plan-7-notes/code-map.md` (git-ignored; file:line map at 70997c5).

## Global Constraints
- Free tiers only, with no paid fallback. Gemini on Vertex is approved within the existing caps: 20 per session and `GEMINI_DAILY_CEILING` 300 per day. Tavily caps are unchanged: basic search, 25 per day, 600 per month.
- Qloo session budget `SESSION_QLOO_BUDGET` 160. A cold board plus 4 playbooks must fit; `test/sessionBudget.test.ts` enforces it.
- Never commit Qloo response data. `scripts/check-public-data.sh` must pass. Fixtures are synthetic, and fake ids use the `00000000-` prefix.
- Agents never deploy, push, change visibility or write to Devpost. Prateek runs those with `!`.
- Every number shown comes from a Qloo response, a recording or a committed calibration. No invented customers, dollar amounts or capacities. An assumption is labelled as one.
- Copy rules (`dashboard/src/test/copyRules.test.ts`): no "AI-powered", "insights", "audience overlap", "% overlap", "leverage", "unlock" or "seamless".
- Mobile-first: works at 375 px with no horizontal scroll, and passes the axe and overflow checks in `dashboard/e2e/promoter-path.spec.ts`.
- TDD for every behaviour change. Implementers are Sonnet; reviews are fresh agents.
- After each item: a fresh cold-judge walkthrough agent (no context) on the live or local app, then fix every confusion it reports. Report to the hub session (understanding-0c): what changed, the cold-judge result, and the calls used.
- Freeze is 2026-10-28; submit 2026-10-29.

## Review Focus
1. **A city where Qloo returns venues in other cities or countries:** only venues in that city and country are shown or scored (El Paso → no Ciudad Juárez or Sunland Park venues).
2. **A city with 0–2 qualifying venues** (Reynosa had 1): `venue_fit` is thin or absent and stated as such, never padded with non-venues.
3. **A major-market seed that is also a heat candidate:** it appears once, labelled as a Qloo heat candidate.
4. **A seed that Qloo can't place** (location check fails): `insufficient_data` with the existing copy; it is never presented as found by Qloo.
5. **The showcase and replays with no live gateway:** zero Qloo POSTs on the judge path.

---

### Task 1 (item 1): venue categories, same-city venues, the largest market per region, recalibration and a single re-record

**Live probe (controller, 2026-10-24, about 12 Qloo calls, results not committed):**
- `qloo_find_tags` gave the category ids `urn:tag:category:place:live_music_venue`, `urn:tag:category:place:concert_hall`, `urn:tag:category:place:amphitheater` and `urn:tag:category:place:performing_arts_theater`. There is also `urn:tag:category:place:night_club`, but it is NOT used: it returns strip clubs, and the adult `exclude_tags` had no effect.
- `qloo_recommend {target_type:"place", signals:[artist], filter_location:"El Paso, US", include_tags:[the 4 ids], include_tags_operator:"union", limit:20}` returns real venues: Abraham Chavez Theatre, The Reagan, The Plaza Theatre.
- Results also include other places. The probe showed Sunland Park and Canutillo (same country, other towns) and, with night_club, a Ciudad Juárez club.
- Each place result has `properties.geocode {city, country_code, admin1_region, ...}`.
- Rio returned 20 venues; Reynosa returned 1.

**Files:** `cloud_run/qloo_gateway/src/pipeline/tourBoard.ts` (`activationInputs` about L109–153, `pickCandidates` L33–43, board loop about L209–260), `src/extract.ts` (`extractEntities` keeps a `geocode {city, countryCode}` when present), `src/pipeline/cityPlaybook.ts` (venue card), `src/geo/cities.ts` (helpers), `src/types.ts`, tests under `test/`; `dashboard/src/lib/qloo/types.ts`, `components/qloo/CityRow` (or wherever the verdict chip renders), `WhyThisScore.tsx`, `dashboard/scripts/record-showcase.mjs` (prints the candidate source).

- [ ] **Venue query.** Use a constant `VENUE_CATEGORY_TAGS` with the 4 ids above, in this order. The place recommend becomes `{target_type:"place", signals:[artist], filter_location: where, include_tags: VENUE_CATEGORY_TAGS, include_tags_operator:"union", limit:20}`.
- [ ] **Same-city filter.** Keep a place only if `geocode.country_code` equals the city's ISO-2 country and the normalised `geocode.city` equals the normalised city name. Use `normaliseName`-style comparison: accent- and case-insensitive. Also accept the resolved `locationQuery` city name.
  - Places with no geocode are dropped.
  - The filtered list (at most 10, in Qloo's order) goes to `qloo_rank` as today.
  - With 0 qualifying venues, `venue_fit` is absent and the venue card is empty with copy "Qloo lists no music venues in <city> for this artist". It is never padded.
  - With 1–2 venues, the score uses what exists.
  - Tests:
    - a mixed list (same city, same country/other town, other country, no geocode) → only same-city survive;
    - 0 survivors → no rank call and `venue_fit` absent;
    - accent and case variants match.
- [ ] **Largest market per region ("major markets we always check").**
  - **Which cities:** for each brief region that is a country (ISO-2 resolvable via the existing country map or `Intl.DisplayNames`), seed the most populous city of that country from `cities5000` (US → New York City, MX → Mexico City, BR → São Paulo). This is generic, never per-artist. At most one seed per region, and at most 3 seeds per board.
  - **Overlap:** a seed already in the heat pool is not duplicated. It keeps `candidateSource:"heat"`.
  - **Fan heat when absent from Qloo's regional heat list:** fan heat is set to the minimum fan heat of the scored heat candidates, flagged `fanHeatFloor: true`. Activation, location check and verdict use the normal path.
  - **Event fields:** `ScoredCity.candidateSource: "heat" | "major_market"`.
  - **UI:** a "Major market" tag with tooltip or explainer text "Largest market in <country>. We always check it; it isn't in Qloo's top fan hotspots for this artist, so fan heat is shown at the board's floor." Never the word "found".
  - **Budget:** `sessionBudget.test.ts` covers a cold board with 3 seeds plus 4 playbooks ≤ 160. If it doesn't fit, cap seeds at 2 and report.
- [ ] **Docs:** add a "Venues" and "Major markets" section to `cloud_run/qloo_gateway/CLAUDE.md`. Add the probe findings to `docs/qloo/api-notes.md` (tag ids are vocabulary, not response data).
- [ ] **Commit:** `feat(gateway): music-venue categories, same-city venues, largest market per region`.
- [ ] **Prateek deploys the gateway.** The controller records 4 board-only calibration runs (`--max-playbooks 0`, regions "Mexico,Brazil,United States": Japanese Breakfast, Khruangbin, Mac DeMarco, Natalia Lafourcade) into `private-data/calibration/`, keeping the old files as `*.2026-10-17.json`. Then it runs the calibration CLI (command in `docs/qloo/calibration.md`, version `calibrated-2026-10-24`) to regenerate `src/scoring/calibration.ts`, `docs/qloo/calibration.md` and the trimmed fixtures (a subagent commits them).
- [ ] **Prateek redeploys the gateway.** The controller re-records the Natalia showcase (window 2026-10-25:2026-10-31), checks the board and shows Prateek: which cities, the verdicts, whether the goldmine changed, and the major markets. Synthetic fixtures are regenerated if the shape changed. Prateek uploads and deploys the dashboard.
- [ ] **Cold-judge walkthrough** on the live app. Fix its findings, then report to the hub.

### Task 2 (item 0): one thread: Markets → Decide → Playbook → Tour Book
- Four-step nav, the same on mobile and desktop. Each screen has one primary action leading to the next, and choices carry forward: the shortlist and the selected city.
- Opens with the showcase loaded (`?showcase=1` behaviour by default on the first visit). "Try your own artist" is one click away.
- Taste Insights (`/insights`), the legacy campaign routes and the separate strategist launcher come off the main path. Routes keep working, with no nav entry. Proof is linked from the score ("How we tested this").
- No dead ends, no empty cards, no unexplained disabled buttons, no layout jumps. The same names are used everywhere, and every number is explained where it appears. Works at 375 px.
- The e2e promoter path is updated to the four steps.
- **Instant next step** (added 2026-10-24, Prateek via hub):
  - **Why not Speculation Rules:** the dashboard is a client-routed SPA, so step changes are not document navigations, and Speculation Rules would not fire for them. Prerendering a document could also start a live board stream.
  - **What we do instead:** when the primary "next step" control mounts or becomes visible, preload the next route's lazy chunk and its *static* data only (the recording via the existing `/api/recordings/*` and the client store). Never a Qloo, Gemini or Tavily call: playbook, this-week and without-qloo requests stay on navigation, apart from showcase replays from the loaded recording.
  - **Document navigations:** add a `<script type="speculationrules">` with `prefetch` (never `prerender`), same-origin, `eagerness: "moderate"`, for document navigations to `/proof` and the landing → board entry only.
  - **Test:** preloading makes zero `/api/qloo` requests.

### Task 3 (item 3): the cities that move
On Decide, the first thing a judge sees is fan-heat rank and winnability rank side by side for each city, with movers highlighted. Each move gets one line of reason built only from its activation components: the biggest component difference versus the board median, named in promoter words, with numbers from the scores. Major markets appear in the same list with their tag: "the markets you'd always check, next to where Qloo says you can win."

### Task 4 (item 2): Proof v3
- **Protocol** committed before any call: `docs/qloo/proof-v3-protocol.md`. It covers:
  - the 27 reviewed cases (`backtest/cases.json` + `backtest/cases-run2.json`);
  - per case, 10 candidates: the real pick plus 9 decoys drawn with a fixed seed from the city popularity list for the case's target type;
  - three rankers: Qloo `rank` with `{options: 10 ids, signals:[artist], signal_location}`, Gemini (names only, same 10, temperature 0.2, fixed prompt), and popularity order;
  - metrics: mean reciprocal rank per method and a two-sided sign test, Qloo vs Gemini and Qloo vs popularity;
  - a commitment to publish whatever comes out.
- **Claim-checker catch rate:** 30 claims built from the recorded playbooks, a third planted false by changing a number or entity. Run them through `verifyClaims` and report the catch and false-alarm rates.
- **/proof page:** shows v3 first, the earlier runs below, the "Without Qloo" ranking recorded and shown on the board.
- **Budget:** Qloo about 60–90 calls; Gemini about 30–60.

### Task 5 (items 8 and 7): story, promoter language, README
- **Landing:** open on the promoter's moment: "It's Thursday. Holds expire Friday. Confirm two of five secondary markets." Add the line "Same engine for film press tours."
- **Promoter vocabulary:** holds, capacity band (from venue category: club / theatre / hall, labelled as a band, not a number), on-sale date, and "a sponsor can offset the guarantee", labelled as an assumption with no amounts.
- **Verdict clocks:** dates derived from the brief window, e.g. "Hidden goldmine · on-sale in N days · posters by <date>". The rule is stated once.
- **Tour Book appendix:** "Qloo calls behind this book" (per city: calls, tools, what each decided), built from the playbook logs.
- **README in kit order** (Plan 6 Task 12 content, plus):
  - a "who pays and why" line: promoters and agencies pay per tour, and the return comes from sponsor deals; no invented numbers;
  - a problem section from the pain-evidence note, every number linked.

### Task 6 (item 5): sponsor lift
- Per city, add one `cityPopularityArgs("brand", where, 20)` call as a baseline.
- Lift for a brand = the artist-signal affinity minus the city-baseline affinity (missing from the baseline → baseline treated as the baseline list's minimum, stated).
- The sponsor card sorts by lift and shows "fans over-index by …". The merch card uses the top-lift brands.
- `sponsor_fit` stays on raw affinity unless recalibrated in a later run (no silent scoring change).
- Budget test updated.

### Task 7 (item 4): "Ask about this tour"
- An ask box on Decide and Playbook, replacing the strategist launcher.
- **Work log:** "Model reasoning summary" (Gemini thought summary, labelled), each Qloo call with its result count, and the decision.
- **UI tools** that can't change data: `highlight_cities`, `open_city`, `open_card`, `compare_cities`. The answer cites the cards it opened.
- **Showcase:** replays 1–2 recorded questions, stored in the private showcase recording under a `strategist` key. Zero live calls.
- **Cut order:** live typing first, then the UI moves. The replayed log stays.
- **WebMCP:** the same UI tools on `document.modelContext`, with the origin-trial tokens from Prateek for the Cloud Run and web.app origins via `VITE_WEBMCP_OT_TOKEN`.

### Uptime checks (at C3; added 2026-10-24, Prateek via hub)
- **What:** Cloud Monitoring uptime checks, every 5 minutes from at least 3 regions, alerting after 2 failed checks, kept through 2026-11-17. They cover:
  - the dashboard (`https://tour-intel-qloo.web.app/` and its Cloud Run URL);
  - gateway `/health` (private service, so use OIDC service-agent auth and grant the Monitoring service agent `run.invoker`);
  - the public MCP endpoint (POST `initialize`, or a reachability check if a POST body isn't supported).
- **Cost:** within the free tier (4–5 checks × 288/day × 3 regions ≈ 130k executions a month).
- **Alerts:** email notification channel. Prateek creates it himself with his own address; agents never handle the email.
- **Who runs it:** the controller writes the `gcloud` commands, Prateek runs them, and the controller verifies them with `gcloud monitoring uptime list-configs`.

### Closing (controller and Prateek)
Then come Plan 6's remaining steps, in order:
1. C3 screenshots;
2. C4 whole-branch Opus review;
3. C5 public clone;
4. C6 pitch, review and preflight until GO;
5. C7 Devpost, with Prateek's go-ahead on every write.
