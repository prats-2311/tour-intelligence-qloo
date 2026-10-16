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
- "Save as campaign" (Book) writes via `POST /api/tours` to `tour_data_api` and is live-only; sample tours are refused.
- No code defaults point at the original Google-hackathon services: set `TOUR_DATA_API_URL` (BFF, `agent_mcp_server`, orchestrator) and `DELIGHT_RENDERER_URL` (BFF, orchestrator). Unset, the BFF answers 503 `tour_data_api not configured`; the other two refuse to start.

## Deploy topology (2026-10-16)
- The finished Google-hackathon backends in `liifecalling-academy` (`tour-data-api`, `delight-card-renderer`, `agent-mcp-server`, Dialogflow CX agent, job `tour-campaign-orchestrator`) are reused; nothing is deleted.
- The dashboard deploys as the new Cloud Run service `tour-intel-qloo` (`dashboard/scripts/deploy.sh`, refuses `tour-dashboard`), with `https://tour-intel-qloo.web.app` as a 302 short link to the Cloud Run address (Hosting rewrites cannot carry long SSE streams) (`firebase.json`, `.firebaserc`, `dashboard/scripts/deploy_web_app.sh`). Prateek runs both; see `dashboard/CLAUDE.md`.
- The public MCP stays new: `cloud_run/agent_mcp_server/scripts/deploy_public.sh` (Plan 4) targets `tour-intel-mcp-public`.
- Reusing dataset `tour_intelligence` (instead of `tour_intelligence_qloo`) is pending Prateek's decision; the dataset guards are unchanged until then.
- Cloud Run reserves paths ending in `z`: the gateway health route is `/health`.

## Nested guides
Existing per-directory `CLAUDE.md` files remain authoritative for their services; `cloud_run/qloo_gateway/CLAUDE.md` covers the gateway.

## Tests
`./run_tests.sh` runs pytest, dashboard vitest, gateway vitest, and `graft check`. Must be green before every commit.
