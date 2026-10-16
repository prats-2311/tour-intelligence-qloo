# Plan 4b — Live Qloo data alignment + recorded real-artist showcase

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make every Qloo reader match the real hackathon API responses captured in the live data check. After that, replace the demo's "illustrative" showcase with a recorded real run for a real artist.

**Architecture:**
- **Live fixtures:** real responses captured on 2026-10-16 through the deployed gateway are trimmed and committed as test fixtures. Every reader gets a test against them.
- **Gateway:** extract/pipeline fixes cover shared-taste overlap from `compare_audiences`, the talent proxy via a location signal, venue rank by entity ids, category from `subtype`, music-tag filtering, and the trends `series` reader. The strategist and MCP readers are aligned to the same shapes (Plan 4 ruling R15).
- **Dashboard:** adapters and charts handle baseline-relative demographics, trends series, `subtype` categories and shared taste.
- **Showcase:** a recorder script captures a real Tour Board run plus playbooks from the deployed gateway into a JSON fixture. The dashboard replays it at `?showcase=1`, labelled "Recorded Qloo run · <date>". `?sample=1` keeps the Lumen Vale fixture for tests.

**Tech Stack:** as in Plans 1–4 (gateway Node/TS/vitest, dashboard React/vitest/Playwright, MCP Python/pytest).

**Spec:** `docs/superpowers/specs/2026-10-16-tour-intelligence-qloo-design.md` §3, §5.4 (co-bill lift), §5.5 integrity, §7.4 honesty, §9.1. **Evidence:** `docs/qloo/api-notes.md` and the live responses in `.superpowers/sdd/2026-10-17-plan-4-strategist-mcp/datacheck/*.json`.

## Live findings (binding facts)

| # | Tool | Real shape / behaviour (2026-10-16) |
|---|---|---|
| F1 | `qloo_compare_audiences` | `results = { a: Tag[], b: Tag[], matchEntities: [], tags: Tag[] }`. Each shared tag is `{ tag_id, name, type:"urn:tag", subtype, entity_id, popularity, query: { score: 0..1, … } }`. There is no scalar overlap. |
| F2 | `qloo_recommend` target artist with only `filter_location` | Returns `needs_input` "Provide at least one entity, tag, location, or demographic taste signal." With `signal_location: "<city>, <country>"` alone it returns real local artists. A `demographic` must be a phrase like "men 25-34", not "25_to_29". |
| F3 | `qloo_trends` | `envelope.series = [{ entity: {…}, points: [] }]` and `envelope.results` is null. Both test artists returned 0 points over 90 days, so this must be treated as normal. |
| F4 | `qloo_audience_demographics` | `results = [{ entity_id, query: { age: { "24_and_younger": 0.18, "25_to_29": -0.08, "30_to_34": -0.76, "35_to_44": 0.27, "45_to_54": -0.59, "55_and_older": -0.6 }, gender: { male: -0.2, female: 0.2 } } }]`. Values are baseline-relative and range from -1 to 1. |
| F5 | `qloo_recommend` brand with `signal_location` | Works: the request carries `signal.location.query`, and lists differ by city. No change needed. |
| F6 | `qloo_rank` with names | Returns `needs_input` with `resolution.issues[0].candidates[]` of `{ id, name, type, popularity, description, address }`. Options must be entity ids. |
| F7 | Entities | `type` is `"urn:entity"`. The category is in `subtype` (`urn:entity:artist`, `urn:entity:brand`, `urn:entity:place`, …). From `describe`, `type`/`subtype` may be null. |
| F8 | `qloo_entity_tags` | Items are `{ id: "urn:tag:…", name, affinity }` and noisy (e.g. `urn:tag:credit_card:place:discover`). Music/taste tags have prefixes `urn:tag:genre:music`, `urn:tag:subgenre:`, `urn:tag:artist:qloo`. |
| F9 | `qloo_where_popular`, place `filter_location`, `describe` | They match the current readers. |

## Global Constraints
- Same as Plan 4's `global-constraints.md`: gateway conventions, honesty, cost, security, dashboard rules, tests and commits.
- **Shared taste, not "overlap".** `sharedTaste` = mean of the top-5 `tags[].query.score` (0..1), rounded to 2 dp for display. It is `null` when fewer than 1 tag is returned. The UI labels it "shared taste", never "audience overlap". Co-bill lift = `sharedTaste × localAffinity`, and the formula caption is "lift = shared taste × local affinity". The top 3 shared tag names are shown as evidence.
- Demographics display as "over/under-index vs average" with signed values. Never call them percentages or shares.
- An empty trends series shows the honest state "No trend data from Qloo for this window". Never draw a flat line.
- The recorded showcase is labelled "Recorded Qloo run · <ISO date> — not live" wherever the Lumen Vale sample label appears. It makes zero gateway calls.

## Review Focus
1. A compare result with 0 or 1 shared tags must not produce NaN, an empty card or a crash: `null` shared taste and an honest "Not enough shared taste data". Tests in Task 1 and Task 3.
2. Rank with venue ids where some id doesn't resolve must not empty the venue card silently: show the resolved ones plus a partial warning. Test in Task 1.
3. Demographics with missing age or gender maps must render the parts present and never "NaN%". Test in Task 3.
4. A replayed showcase JSON with an unexpected event type must skip that event, never crash. Test in Task 5.
5. Recording an artist whose board has no Hidden goldmine must still produce a valid showcase. The Landing proof copy must derive from data and never claim a rank shift that didn't happen. Test in Task 5.

---

### Task 1: Gateway readers match live Qloo

**Files:** `cloud_run/qloo_gateway/src/extract.ts`, `src/pipeline/cityPlaybook.ts`, `src/pipeline/tourBoard.ts`, `src/types.ts` (PlaybookCard summary), `test/fixtures/live/*.json` (NEW, trimmed from the datacheck files), `test/liveShapes.test.ts` (NEW), and updates to `test/cityPlaybook.test.ts` and `test/tourBoard.test.ts`.

**Interfaces (produced):**
```ts
// extract.ts
export function extractEntities(env)  // now also returns `category?: string` = subtype minus "urn:entity:" (e.g. "artist"), falling back to `type` when type ≠ "urn:entity"
export function extractSharedTaste(env): { value: number | null; tags: Array<{ name: string; score: number }> }  // F1; mean of top-5 query.score; tags sorted desc, top 5
export function extractTrendPoints(env): Array<{ date: string; value: number }>  // F3; reads env.series[0].points; point date from `date`|`day`|`timestamp`, value from `value`|`population_percentile`|`velocity_fold_change` (first finite); [] when absent
export function extractMusicTags(env): Array<{ id: string; name: string; affinity: number }>  // F8; keeps ids starting urn:tag:genre:music | urn:tag:subgenre: | urn:tag:artist:qloo
export function extractCandidates(env): Array<{ id: string; name: string }>  // F6; from env.issues or env.resolution.issues (existing extractIssues covers both — reuse)
```
- **Co-billing (cityPlaybook.ts):** reads `extractSharedTaste` instead of `overlapOf`. Items are `{ name, entityId, sharedTaste, localAffinity, lift, sharedTags: string[] (top 3) }`. Drop candidates with `null` shared taste, with a partial warning "shared taste unavailable for <name>".
- **Talent:** the proxy request is `{ target_type: "artist", signal_location: "<city>, <country>", limit: 5 }` (F2). The talent `summary` becomes `{ sharedTaste }` plus `sharedTags`, and the old `overlap` key is renamed.
- **Venue rank (tourBoard.ts `activationInputs`):** options are the place **entity ids** (top 10). If the rank returns `needs_input`, fall back to the place recs' own affinity order for the top 3, and add a partial warning "venue ranking unresolved — showing place recommendations". Never return an empty venue card when places exist.
- **Merch:** card items come from `extractMusicTags`.
- **`artist_profile.trends`:** `extractTrendPoints` output (an array) instead of raw `results`.
- **Strategist `answerCheck`/evidence:** `narrative/evidence.ts` uses the new co-billing fields (`sharedTaste`, `localAffinity`, `lift`). Rename `overlap` there too. Update the narrative tests.

- [ ] Copy and trim the live files into `test/fixtures/live/` (keep only `envelope.status`, `results`/`series`/`resolution`). Name them `compare.json`, `artist-signal-location.json`, `trends-empty.json`, `demographics.json`, `rank-needs-input.json`, `entity-tags.json`, `brand-gdl.json`, `place-gdl.json`, `heat-gdl.json`, `describe.json`.
- [ ] Write the failing tests in `test/liveShapes.test.ts`:
  - `extractSharedTaste(compare)` gives a value in [0,1] equal to the mean of the top-5 scores, with tag names present.
  - With 0 tags it gives `{ value: null, tags: [] }`.
  - `extractTrendPoints(trends-empty)` gives `[]`, and a synthetic point gives one entry.
  - `extractMusicTags(entity-tags)` drops `urn:tag:credit_card:*`.
  - `extractEntities(brand-gdl)[0].category === "brand"`.
  - `extractCandidates(rank-needs-input)[0].id` is a UUID.
- [ ] Update the playbook and tour-board tests to the new behaviour:
  - the proxy uses `signal_location`;
  - rank options are ids;
  - the rank `needs_input` fallback keeps venues with a partial warning;
  - co-billing uses shared taste with sharedTags;
  - a compare with no tags drops the candidate with a warning.
- [ ] Implement, run `npm test && npm run typecheck`, commit `fix(gateway): readers match live Qloo shapes (shared taste, location proxy, rank ids, subtype, music tags, trends series)`.

### Task 2: Strategist and MCP readers (Plan 4 R15)

**Files:** `cloud_run/qloo_gateway/src/strategist/tools.ts` (`compactResults`, `playbook()`, the `qloo_compare_audiences` declaration description), `test/strategistTools.test.ts`; `cloud_run/agent_mcp_server/taste_tools.py`, `tests/test_taste_tools.py`; `dashboard/src/lib/qloo/fixtures/strategistSample.ts`.

**Required:**
- `compactResults` handles three special shapes:
  - compare: `{ sharedTaste, sharedTags: top 5 {name, score} }`;
  - trends: `{ points: n, latest }` or `"no trend data"`;
  - demographics: `{ age: {...}, gender: {...} }`, passed through with 2-dp rounding.
- Tags keep their `id`. The `qloo_compare_audiences` description says "compare the shared taste (common tags) of two groups".
- MCP:
  - `_resolve_artist` reads `issues` or `resolution.issues`.
  - `rank_venues` resolves the venue names to ids first via `qloo_describe` (type place, with the city in the query), then ranks by ids and reads `affinity`. Unresolved names are listed in `"unresolved": [...]`.
  - `suggest_support_acts` returns `{name, shared_taste, local_affinity, lift, shared_tags}` with formula "lift = shared taste × local affinity".
  - `get_local_moment` uses `category` from the gateway card items (subtype-derived).
- Sample strategist fixture: the compare call args become `{ group_a: [...], group_b: [...] }` with the summary "shared taste 0.28". Rewrite the answer text accordingly ("0.28 shared taste"), keeping the sample number test green.
- Tests use the Task 1 live fixtures where shapes matter. Commit `fix: strategist and MCP read live Qloo shapes`.

### Task 3: Dashboard adapters and charts

**Files:** `dashboard/src/lib/qloo/types.ts` (co-billing and talent fields), `adapters.ts`, `components/insights/AudienceProfile.tsx`, `components/insights/MomentumChart.tsx`, `components/playbook/cards/{CoBilling,Talent,LocalMoment}.tsx`, `components/playbook/format.ts` (`liftLine`), `fixtures/lumenVale.ts` and `fixtures/lumenValePlaybooks.ts` (shape-only updates: rename `overlap` to `sharedTaste`, add `sharedTags`; numbers unchanged), plus tests.

**Required:**
- `toDemographicBars(results)` reads `query.age` and `query.gender` maps and gives `{ group: "age"|"gender", label, index }`. The labels are "24 and under", "25–29", "30–34", "35–44", "45–54", "55+", "Men", "Women".
- AudienceProfile draws diverging bars around 0 with the caption "Over/under-index vs average (Qloo)". A missing map shows only the parts present.
- `toTrendSeries` accepts the gateway's points array. Empty gives the "No trend data from Qloo for this window" state.
- Co-billing card shows `liftLine(sharedTaste, localAffinity, lift)` with the caption "lift = shared taste × local affinity", plus the shared tag names as small chips.
- Talent card: "Shared taste with <city>'s mainstream: 0.xx" plus tags, or "Not enough shared taste data".
- Local moment type labels come from `category`.
- The Insights cross-domain categorisation uses `category`.
- Update the Lumen Vale fixtures' field names. Sample numbers stay, so the e2e strings stay.
- Commit `fix(dashboard): live Qloo shapes — over/under-index demographics, trends series, shared taste`.

### Task 4: Deploy checkpoint (Prateek, not an agent)
- [ ] Prateek redeploys the gateway: `! bash cloud_run/qloo_gateway/scripts/deploy.sh`.
- [ ] The controller verifies with one live `qloo_compare_audiences` and one `city-playbook` stream for a real artist: co-billing has sharedTaste, the talent proxy returns artists, and the venue card is non-empty.

### Task 5: Recorded real-artist showcase

**Files:** `dashboard/scripts/record-showcase.mjs` (NEW), `dashboard/src/lib/qloo/fixtures/showcase.json` (generated), `dashboard/src/lib/qloo/showcase.ts` (NEW, a typed loader and replay), `client.ts` (a `showcase` source), `TourBoardProvider` and the pages (a `?showcase=1` guard, like `?sample=1`), `components/qloo/SampleBanner.tsx` (recorded variant), `pages/Landing.tsx` (CTA to `?showcase=1`), tests, and `e2e/judge-path.spec.ts` (a showcase smoke).

**Recorder (run by the controller; Node, no deps):**
- `node dashboard/scripts/record-showcase.mjs --artist "<name>" --regions "Mexico,Brazil,United States" --out <path>` gets a token with `gcloud auth print-identity-token` and the gateway URL from `QLOO_GATEWAY_URL`.
- It streams `POST /v1/tour-board` (session `showcase-<date>`), then `GET /v1/city-playbook` (with narrative) for each Play/Hidden-goldmine city, max 4. It also calls `GET /v1/this-week` for those cities when `dateWindow` is passed. It writes `{ recordedAt, artist, brief, boardEvents: GatewayEvent[], playbooks: { [cityId]: GatewayEvent[] }, thisWeek: { [cityId]: ThisWeek } }`.
- It never writes secrets: tokens stay in memory only. It strips the `args` of tool_call events down to the tool name and the visible keys already shown in the UI.
- It prints a summary: the cities, verdicts, and each city's density rank vs winnability rank.

**Dashboard:**
- `?showcase=1` replays the recorded board, playbooks and this-week through the existing sample replay path, with `source: "showcase"`, zero fetches and `delayMs` pacing.
- The banner reads "Recorded Qloo run · <date> — not live". It shows everywhere the sample banner shows, including Book print.
- Strategist in showcase mode: the suggestion chips are built from the recorded board with the Task 9 templates. Asking shows the honest note "The live strategist needs a live run" (no scripted answers for real data).
- Landing:
  - "Try the showcase tour" goes to `/tours/board?showcase=1`.
  - The proof card shows the recorded city with the biggest density→winnability climb, computed from data.
  - If no city climbs, show the top winnability city with no shift claim.
- Unknown event types in the JSON are skipped.
- `?sample=1` and all existing Lumen Vale tests stay unchanged.

**Steps:**
- [ ] Recorder unit tests with a mocked fetch: it writes the expected shape, strips args, and never writes the token.
- [ ] Replay tests:
  - showcase source replays with zero fetches;
  - the banner text;
  - an unknown event is skipped;
  - the Landing proof card copy for climb and no-climb cases, with tiny hand-made showcase fixtures.
- [ ] Implement and commit. The committed `showcase.json` placeholder comes from the Lumen Vale events, labelled with `recordedAt: null`, so the app builds before the real recording. The banner then reads "Sample data — illustrative, not Qloo output".
- [ ] Controller step (after Task 4):
  - run the recorder for 2–3 real candidate artists and pick the one with a Hidden goldmine and a density→winnability climb;
  - commit the real `showcase.json`;
  - run the e2e showcase smoke and the layout checks against it (long real names included).

### Task 6: Docs and verification
- `docs/qloo/api-notes.md`: add a "Live check 2026-10-16" section with F1–F9.
- `dashboard/CLAUDE.md` and root `CLAUDE.md`: `?showcase=1` vs `?sample=1`, how to re-record, and shared-taste wording.
- Spec §5.4 note: overlap is measured as shared taste.
- Full suite plus e2e. Commit.
