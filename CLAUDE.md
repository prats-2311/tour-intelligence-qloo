# tour-intelligence-qloo — Qloo Agentic Hackathon Submission

## What this is
Tour Intelligence × Qloo: "Route with anything. Win every city with this." (README headline; routing tools or an LLM are fine at choosing cities, this tool wins each one) A taste-powered planning system for live music tours (film press tours secondary) that scores where an artist can **win** (fan heat + activation potential) and produces a per-city activation playbook and a Tour & Activation Book. Upgraded from the Google "Agentic Cinema" submission (`prats-2311/google_promotions`, left untouched).

## Source of truth
- Spec: `docs/superpowers/specs/2026-10-16-tour-intelligence-qloo-design.md`
- Plans: `docs/superpowers/plans/`
- Hackathon: qloo.devpost.com — deadline 2026-10-30 23:45 ET (2026-10-31 09:15 IST). Criteria (equal weight, tie-break order): Technological Implementation, Design, Potential Impact, Quality of the Idea.

## Decisions (don't relitigate without new info)
- Qloo access only via `cloud_run/qloo_gateway` (Node, because the Qloo harness / `qloo mcp` is Node-only). The old "no Node stack" rule is superseded for this service only.
- Scores are deterministic code, never LLM output; missing data ⇒ `insufficient_data`.
- LLM narrative claims pass grounding verification; failing claims are removed, never rewritten.
- Mobile-first responsive UI in the existing Premiere Noir system.
- Process: Superpowers workflow (TDD, subagent-driven development with Sonnet subagents, verification before completion); Graft for code navigation; UI tasks read frontend-design, ui-ux-pro-max, taste-skill.

## Qloo tour routes (Plan 3)
- `/tours/board` (Tour Board) → tap a row → `/tours/playbook/:cityId` (City Playbook: advance-sheet cards, audit sheet, sponsors badge) → "Build tour" sheet → `/tours/book` (Tour Book: market chapter, one chapter per shortlisted city, provenance appendix, print to PDF, `.ics`, Share).
- Playbooks are fetched once per artist and city by `dashboard/src/lib/qloo/playbookStore.ts` (key `artist|city|sampleSet`) and shared by Playbook, Book and Insights cross-domain taste; the Book prepares them one at a time.
- Sample mode has playbooks for four cities (Mexico City, Sao Paulo, Guadalajara, Curitiba) in `fixtures/lumenValePlaybooks.ts`; `?sample=1` works on `/tours/board`, `/tours/playbook/:cityId` and `/tours/book` without prior state, `?sample=long` runs the long-names variant on all three.
- **`?showcase=1` vs `?sample=1`**: `?showcase=1` replays one recorded real Qloo run (private recording served by `GET /api/recordings/showcase`, not in git; synthetic stand-in in `src/test/fixtures/`; zero gateway calls, banner "Recorded Qloo run · <ISO date> — not live"). `?sample=1` is the invented Lumen Vale test fixture (banner `SAMPLE_TEXT`). Re-record: `QLOO_GATEWAY_URL=… node dashboard/scripts/record-showcase.mjs --artist "<name>" --regions "Mexico,Brazil,United States" --out dashboard/src/lib/qloo/fixtures/showcase.json [--window YYYY-MM-DD:YYYY-MM-DD]` (spends real quota; needs `gcloud auth print-identity-token`). `--window A:B` is the date window for this-week, the Book and the calendar (`brief.dateWindow`); trends always use the last 90 days. The json is replayed through the sample path (`source: "showcase"`, zero fetches); a placeholder (`recordedAt: null`, built from Lumen Vale) reads the sample text instead. The strategist shows chips from the recorded board and answers "The live strategist needs a live run"; Without Qloo is unavailable. Landing's proof card is data-driven (biggest density-to-winnability climb, else top winnability with no shift claim). Wording rule: say "shared taste" (mean of the top-5 shared-tag scores, 0..1; null with no tags), never "audience overlap"; lift caption is "lift = shared taste × local affinity"; demographics are "over/under-index vs average" with signed values, never percentages; an empty trends series reads "No trend data from Qloo for this window" (no flat line).
- **Wording rule**: co-bill and talent similarity is "shared taste" (mean of the top-5 shared-tag `query.score`, 0..1, null when no tags), never "audience overlap". Lift caption: "lift = shared taste × local affinity". Demographics are "over/under-index vs average" with signed values, never percentages. Empty trends show "No trend data from Qloo for this window".
- "Save as campaign" (Book) writes via `POST /api/tours` to `tour_data_api` and is live-only; sample tours are refused.
- No code defaults point at the original Google-hackathon services: set `TOUR_DATA_API_URL` (BFF, `agent_mcp_server`, orchestrator) and `DELIGHT_RENDERER_URL` (BFF, orchestrator). Unset, the BFF answers 503 `tour_data_api not configured`; the other two refuse to start.

## Strategist, Without Qloo and agent surfaces (Plan 4)
- **Strategist** (`POST /v1/strategist`, gateway `strategist/run.ts`): a bounded Gemini tool-calling loop. Limits per turn: 4 model rounds and 6 tool calls, then one forced text-only answer. Every Gemini attempt reserves the narrative ceiling (20 per session in memory, `GEMINI_DAILY_CEILING` per day, persisted); Qloo calls stay behind the gateway cache and the `QLOO_DAILY_CEILING` budget. UI: a FAB ("Ask the strategist") opening a full-screen dialog on phones, a top-bar "Strategist" toggle with a docked panel on desktop; both show only on `/tours/*` and `/insights`. Tool calls render as chips (get_city_playbook is "Playbook").
- **Sample behaviour**: with `?sample=1|long` the strategist never calls the network. It replays scripted answers (`fixtures/strategistSample.ts`) for the three `SAMPLE_QUESTIONS`; any other question gets an honest UNAVAILABLE reply ("try a suggested question"). Every number in a scripted answer exists in the sample data (guarded by a test).
- **`?mode=`** on `/tours/board`: `winnability` (default, param absent), `density`, `without`. `without` shows the Without Qloo list (`aria-label="Generic ranking"`, banner "Generic LLM answer — no taste evidence", no verdicts); sample uses a fixed list, live asks `POST /v1/without-qloo` and accepts only a permutation of the scored cities.
- **WebMCP Qloo tools** (`components/QlooWebMcpTools.tsx`, six): `get_tour_board`, `get_city_playbook` (read-only); `open_city`, `set_comparison_mode`, `build_tour_from_shortlist`, `open_tour_book` (UI-driving).
- **MCP server** (`cloud_run/agent_mcp_server`): private mode (IAM-gated `agent-mcp-server`) exposes the nine campaign tools plus the five taste tools; public mode (`MCP_PUBLIC=1`, service `tour-intel-mcp-public`, `scripts/deploy_public.sh <gateway-url>`) exposes the five taste tools only, 30 requests per 10 minutes per IP, unauthenticated by design. Connection instructions and the tool table are in the README ("Connect an MCP client").

## Judge round, data policy and the public clone (Plans 6-7)
- **Story (approved 2026-10-24):** "Route with anything. Win every city with this." The product wins each city (sponsors and local guests by Qloo taste, rank-based sponsor lift, real venues, smaller support acts, verified claims, verdict clocks, Tour Book). Never claim winnability ranks cities better (Proof v3 Test A: the generic LLM beat it, p=0.031; ADR 0002) and never promise a "Hidden goldmine". "Where fan heat and winnability disagree" is "worth a second look".
- **Private data:** Qloo's developer guide forbids storing Qloo response data in a public repo. Real recordings (showcase, backtest, Proof v3 outputs, calibration inputs) live in git-ignored `private-data/`, are served by the dashboard BFF at `GET /api/recordings/:name` (`RECORDINGS_BUCKET` in prod, `RECORDINGS_DIR` in dev), and tests use synthetic fixtures (ADR 0003). `bash scripts/check-public-data.sh` must pass before every commit that touches data or docs.
- **Public clone:** `scripts/make-public-clone.sh` builds the public repo (`prats-2311/tour-intelligence-qloo`) from this branch with Qloo data paths and real ids removed from history; Prateek runs the publish steps in `scripts/README-public-clone.md`. Agents never push.
- **README numbers:** `node scripts/readme-numbers.mjs` prints every figure pasted into `README.md` (Proof v3 from `private-data/backtest.json` key `proofV3`, recording counts, commit count). Proof copy comes from the published `proofV3` claims verbatim; Test C is filled by the controller after rating.
- **Plan 7 (judge round):** four-step stepper (Markets, Decide, Playbook, Tour Book), "Try a routing" (paste your cities), "Ask about this tour" recorded Q&A with a work log, Proof v3 on `/proof`. Details in `dashboard/CLAUDE.md` and `cloud_run/qloo_gateway/CLAUDE.md`. ADRs are in `docs/adr/`.

## Deploy topology (2026-10-16)
- The finished Google-hackathon backends in `liifecalling-academy` (`tour-data-api`, `delight-card-renderer`, `agent-mcp-server`, Dialogflow CX agent, job `tour-campaign-orchestrator`) are reused; nothing is deleted.
- The dashboard deploys as the new Cloud Run service `tour-intel-qloo` (`dashboard/scripts/deploy.sh`, refuses `tour-dashboard`), with `https://tour-intel-qloo.web.app` as a 302 short link to the Cloud Run address (Hosting rewrites cannot carry long SSE streams) (`firebase.json`, `.firebaserc`, `dashboard/scripts/deploy_web_app.sh`). Prateek runs both; see `dashboard/CLAUDE.md`.
- The public MCP stays new: `cloud_run/agent_mcp_server/scripts/deploy_public.sh` (Plan 4) targets `tour-intel-mcp-public`.
- This project reuses the finished Google-hackathon dataset `tour_intelligence` via an explicit opt-in: run the migration as `ALLOW_SHARED_DATASET=1 bigquery/apply_migration.sh tour_intelligence bigquery/migrations/2026-10-17-qloo-tours.sql` (Prateek), and deploy `tour-data-api` with `BQ_DATASET=tour_intelligence,ALLOW_SHARED_DATASET=1,QLOO_GATEWAY_URL=<gateway>`. Without the flag the default guards still refuse `tour_intelligence`.
- Cloud Run reserves paths ending in `z`: the gateway health route is `/health`.

## Nested guides
Existing per-directory `CLAUDE.md` files remain authoritative for their services; `cloud_run/qloo_gateway/CLAUDE.md` covers the gateway.

## Tests
`./run_tests.sh` runs pytest, dashboard vitest, gateway vitest, and `graft check`. Must be green before every commit.
