# tour-intelligence-qloo — Qloo Agentic Hackathon Submission

## What this is
Tour Intelligence × Qloo: "Don't just find your fans. Win their city." A taste-powered planning system for live music tours (film press tours secondary) that scores where an artist can **win** (fan heat + activation potential) and produces a per-city activation playbook and a Tour & Activation Book. Upgraded from the Google "Agentic Cinema" submission (`prats-2311/google_promotions`, left untouched).

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
- **`?showcase=1` vs `?sample=1`**: `?showcase=1` replays one recorded real Qloo run (`fixtures/showcase.json`, zero gateway calls, banner "Recorded Qloo run · <ISO date> — not live"). `?sample=1` is the invented Lumen Vale test fixture (banner `SAMPLE_TEXT`). Re-record: `QLOO_GATEWAY_URL=… node dashboard/scripts/record-showcase.mjs --artist "<name>" --regions "Mexico,Brazil,United States" --out dashboard/src/lib/qloo/fixtures/showcase.json [--window A:B]` (spends real quota; needs `gcloud auth print-identity-token`).
- **Wording rule**: co-bill and talent similarity is "shared taste" (mean of the top-5 shared-tag `query.score`, 0..1, null when no tags), never "audience overlap". Lift caption: "lift = shared taste × local affinity". Demographics are "over/under-index vs average" with signed values, never percentages. Empty trends show "No trend data from Qloo for this window".
- "Save as campaign" (Book) writes via `POST /api/tours` to `tour_data_api` and is live-only; sample tours are refused.
- No code defaults point at the original Google-hackathon services: set `TOUR_DATA_API_URL` (BFF, `agent_mcp_server`, orchestrator) and `DELIGHT_RENDERER_URL` (BFF, orchestrator). Unset, the BFF answers 503 `tour_data_api not configured`; the other two refuse to start.

## Strategist, Without Qloo and agent surfaces (Plan 4)
- **Strategist** (`POST /v1/strategist`, gateway `strategist/run.ts`): a bounded Gemini tool-calling loop. Limits per turn: 4 model rounds and 6 tool calls, then one forced text-only answer. Every Gemini attempt reserves the narrative ceiling (20 per session in memory, `GEMINI_DAILY_CEILING` per day, persisted); Qloo calls stay behind the gateway cache and the `QLOO_DAILY_CEILING` budget. UI: a FAB ("Ask the strategist") opening a full-screen dialog on phones, a top-bar "Strategist" toggle with a docked panel on desktop; both show only on `/tours/*` and `/insights`. Tool calls render as chips (get_city_playbook is "Playbook").
- **Sample behaviour**: with `?sample=1|long` the strategist never calls the network. It replays scripted answers (`fixtures/strategistSample.ts`) for the three `SAMPLE_QUESTIONS`; any other question gets an honest UNAVAILABLE reply ("try a suggested question"). Every number in a scripted answer exists in the sample data (guarded by a test).
- **`?mode=`** on `/tours/board`: `winnability` (default, param absent), `density`, `without`. `without` shows the Without Qloo list (`aria-label="Generic ranking"`, banner "Generic LLM answer — no taste evidence", no verdicts); sample uses a fixed list, live asks `POST /v1/without-qloo` and accepts only a permutation of the scored cities.
- **WebMCP Qloo tools** (`components/QlooWebMcpTools.tsx`, six): `get_tour_board`, `get_city_playbook` (read-only); `open_city`, `set_comparison_mode`, `build_tour_from_shortlist`, `open_tour_book` (UI-driving).
- **MCP server** (`cloud_run/agent_mcp_server`): private mode (IAM-gated `agent-mcp-server`) exposes the nine campaign tools plus the five taste tools; public mode (`MCP_PUBLIC=1`, service `tour-intel-mcp-public`, `scripts/deploy_public.sh <gateway-url>`) exposes the five taste tools only, 30 requests per 10 minutes per IP, unauthenticated by design. Connection instructions and the tool table are in the README ("Connect an MCP client").

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
