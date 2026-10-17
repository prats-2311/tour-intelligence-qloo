# Tour Intelligence — Agentic Tour & Promo Intelligence OS

> A film cast lands in Mumbai. The lead says two lines in Hindi, name-checks a beloved local icon, and the clip does more for the opening weekend than a month of paid media. That moment wasn't luck — someone researched it. **Tour Intelligence is the agent system that does that research for every stop, and then acts on it.**

Built for **Agentic Cinema: The Blockbuster Hackathon** (Google Cloud × Devpost) — **Parallel partner track**.

- **Live app:** https://tour-dashboard-602700957663.us-central1.run.app
- **Devpost:** https://devpost.com/software/tour-intelligence-agentic-tour-promo-intelligence-os
- **License:** [MIT](LICENSE)

---

## What it is

Global press tours and music tours fail city-by-city because nobody has time to research every city properly. A planner routing a 10-stop tour needs, per city: cultural etiquette, real local phrases with pronunciation, fan-behavior forecasts, venue logistics, visa lead-times, seasonal weather risk, customs rules for touring gear — and a talent brief the artist will actually read. In practice that research happens for two cities and gets template-copied for the rest.

Tour Intelligence replaces that with a network of **five Dialogflow CX Playbook agents** (Culture Intelligence, Fan Enthusiasm, Local Delight, Talent Prep, Campaign Orchestrator) that gather intelligence conversationally while **deterministic code does the synthesis, grounding checks, and every database write** — agents that act, not chat.

### Headline features

| Feature | What it does |
|---|---|
| **Executive Tour Book** | One click assembles the boss-facing campaign document — itinerary, per-market demographics with bar charts, cultural playbooks, activation plans, generated key art, playable entrance stings. Cmd+P *is* the PDF. |
| **Campaign-aware key art** | `gemini-3-pro-image` renders per-city poster art from *real* grounded local motifs; the exact prompt is shown in the UI — never fabricated reasoning. |
| **Lyria entrance stings** | A generated audio moment per city, composed from the city's own curated music cues. |
| **AI co-planner chats** | Schema-constrained Gemini turns fill a real form (create) or produce reviewable diffs (edit). Nothing writes to a live campaign until the planner applies. Voice input, private client-side attachments, history that survives refreshes and devices. |
| **Live-answer loop** | Gemini flags its own staleness (`needs_live_search`) or detects a film title (`detected_title`) → Parallel Search fetches the present tense → the reply regenerates with a "Live sources" citation row. |
| **Tour-risk intelligence** | Visa lead-times by nationality, seasonal weather risk, customs/ATA Carnet notes, and a planner-owned safety checklist with a named showstop manager (deliberately *not* AI-generated). |
| **Any city on Earth** | Five demo cities run on curated BigQuery data; every other city falls back to live Parallel research with citations — through the same grounding gate. |

---

## Architecture

![System architecture](https://storage.googleapis.com/liifecalling-academy-delight-cards/media/diagram_system_architecture.png)
*The full system: planner surfaces → five Playbook agents → four Cloud Run services → BigQuery / Parallel / Gemini. Gold edges are the paths where agents act, not chat.*

![The grounding pipeline](https://storage.googleapis.com/liifecalling-academy-delight-cards/media/diagram_grounding_pipeline.png)
*Curated path and live path converge on one deterministic `checkGrounding` gate. Parallel-sourced facts earn canon the same way curated rows do — rejected facts never enter a brief.*

![AI control at every layer](https://storage.googleapis.com/liifecalling-academy-delight-cards/media/diagram_ai_control_layers.png)
*Left: three agent surfaces — Playbooks, an external MCP server, and Chrome WebMCP — sharing one audited tool contract. Right: the two-pass loop that refuses to answer time-sensitive questions from stale training data.*

### The five design rules

1. **"The LLM reasons, code acts."** Agents gather intelligence conversationally; synthesis, the grounding check, and every BigQuery write are deterministic code.
2. **Grounding is architectural, not a prompt instruction.** Every fact — curated or live — passes the same `checkGrounding` gate before entering a brief.
3. **Gemini reasons, Parallel grounds — never confused.** Live search runs exactly where a hallucination would be dangerous; instant Gemini everywhere else.
4. **Honest AI or no AI.** Brief traces come from real tool calls; key art shows its exact prompt; a live metric with zero results returns an honest `null`.
5. **Agents controllable by agents.** One tool contract, three surfaces: internal Playbooks, an external MCP server (`agent_mcp_server`), and the dashboard's own functions registered as WebMCP page tools.

### How Parallel is used (partner track)

Called at runtime via the official `parallel-web` SDK — see `cloud_run/tour_data_api/`:

| Task | Parallel surface |
|---|---|
| Culture / local delight / demographics for unseeded cities | **Search** → Gemini schema-constrained synthesis |
| Venue discovery, commute/customs notes, crew & vendors, visas, weather | **Search** |
| Film/franchise research + real-time questions in both chats | **Search** (Gemini-triggered) |
| Custom campaign metrics | **Search** (honest `null` on zero results) |
| Deep research when adding a brand-new city | **Task API** |
| Cultural-drift + safety monitoring after briefs exist | **Monitors** |

Every live result keeps its citations, passes prompt-injection validation on the way in (regex allowlists on every user-influenced field, built test-first), and passes `checkGrounding` on the way out.

---

## Repo layout

```
sdk/                      Canonical pure-logic modules (enthusiasm scoring, city ranking, grounding check)
cloud_run/
  tour_data_api/          The core OpenAPI tool: BigQuery reads/writes, Parallel + Gemini live-search
                          routes, chats, key art, Lyria stings, TTS  (Flask, Cloud Run)
  delight_card_renderer/  Renders delight cards + the Executive Tour Book to Cloud Storage (Jinja)
  agent_mcp_server/       Real MCP server (official Python SDK) exposing read-only tools to any agent
orchestration_driver/     "LLM reasons, code acts" campaign driver — runs the 5 Playbooks per city
agent_builder/            Playbook definitions, OpenAPI tool spec, the inter-agent protocol (AGENT_PROTOCOL.md)
bigquery/                 Schema + seeds (insert-only "latest revision wins" everywhere)
dashboard/                React 19 + TypeScript + Tailwind frontend ("Premiere Noir") + Express BFF
run_tests.sh              Full test suite: 413 tests (391 pytest + 22 vitest)
```

Each directory has its own `CLAUDE.md` with engineering conventions and deploy detail.

---

## Running it

### Prerequisites

- Python 3.11+, Node 20+, the `gcloud` CLI authenticated against a GCP project
- BigQuery dataset `tour_intelligence` created from `bigquery/schema.sql` (+ seeds)
- A [Parallel](https://parallel.ai) API key stored in Secret Manager as `parallel-api-key`
- Vertex AI (Gemini, Lyria) enabled; a public Cloud Storage bucket for rendered artifacts

### Tests (no cloud needed)

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
./run_tests.sh          # 391 pytest + 22 vitest, all mocked — no GCP credentials required
```

### Dashboard locally

```bash
cd dashboard
npm install
npm run server          # Express BFF on :8080 (uses `gcloud auth print-identity-token` locally)
npm run dev             # Vite dev server, proxies /api to the BFF
```

### Deploying the services

All services are source-deployed with buildpacks to **us-central1**, each with a dedicated least-privilege service account (see `cloud_run/CLAUDE.md` for the auth topology):

```bash
gcloud run deploy tour-data-api        --source=cloud_run/tour_data_api        --region=us-central1
gcloud run deploy delight-card-renderer --source=cloud_run/delight_card_renderer --region=us-central1
gcloud run deploy agent-mcp-server     --source=cloud_run/agent_mcp_server     --region=us-central1 --no-allow-unauthenticated
gcloud run deploy tour-dashboard       --source=dashboard                      --region=us-central1
```

The five Playbooks are provisioned in Dialogflow CX (Agent Builder) from `agent_builder/playbooks/` with `agent_builder/openapi/tour_data_api.yaml` as their authenticated OpenAPI tool. A full campaign run is driven by:

```bash
.venv/bin/python orchestration_driver/run_campaign.py <campaign_id>
```

### Connect an MCP client

A public, rate-limited demo MCP server exposes the five Qloo taste tools (deployed with `cloud_run/agent_mcp_server/scripts/deploy_public.sh <qloo-gateway-url>`; it prints the URL).

```bash
claude mcp add --transport http tour-intel <url>/mcp
```

Other clients: add it as a custom connector / remote MCP server with the same `<url>/mcp` (streamable HTTP, no auth).

| Tool | What it does |
| --- | --- |
| `find_tour_markets` | Score and rank touring markets for an artist in up to 2 regions and 3 stops |
| `get_city_playbook` | Compact taste playbook for one artist in one city |
| `suggest_support_acts` | Support acts with shared taste, local affinity and lift |
| `rank_venues` | Rank up to 10 candidate venues by taste fit |
| `get_local_moment` | Local events, scenes and places that fit the audience |

Limits: 30 requests per 10 minutes per IP (counts every MCP HTTP request, including the initialize handshake, and is tracked per instance, with up to 2 instances), 2 regions and 3 stops per board, cached results. Public sessions share a gateway budget of 400 Qloo calls per day (`QLOO_PUBLIC_DAILY_CEILING`), counted inside the global daily ceiling, and each client IP gets the 160-call per-session budget; the judge dashboard keeps working when the public budget is spent. The public service runs as its own `tour-intel-mcp-public-sa`, which can only invoke `qloo-gateway`.
Every result is an affinity signal from aggregate taste data, not a ticket forecast or a claim about individuals.

---

## Proof: checked against real tours

The promoter's question: would this have found the sponsor, merch collab or local act the real tour actually used? `/proof` tests that against documented past activations, not against Qloo's own heatmap (which would be circular). Every case was reviewed by hand before it was scored.

Three methods, same cases, same top-10 cut:
1. **Qloo playbook:** what the City Playbook's local-act column was in that run.
   - Run 1 (v1): the artist-taste recommend request (the headliner's taste signal plus the city), widened to 20 results. For brands it is the exact recommend request the City Playbook makes.
   - Run 2 (v2): the city's 20 most popular artists, the first 10 re-ranked by taste fit with `qloo_rank` (the card shows 10 of a pool of 20). For brands it is the same recommend request widened to 20.
   - The live card is now a hybrid (Gemini proposes, Qloo verifies and ranks) that has not been tested on any case.
2. **City popularity:** the same request without the artist, which tests whether the artist's taste adds anything to "what's popular in this city".
3. **Generic LLM:** Gemini, same question, no Qloo.

Real entity in the top 10, per method (from `backtest/results.json` and `backtest/results-run2.json`):

| Run | Qloo playbook | City popularity | Generic LLM |
|---|---|---|---|
| Run 1: 14 reviewed cases, all activation types (method v1) | 1 of 13 | 1 of 13 | 3 of 14 |
| Run 2: 13 fresh local-act cases (method v2) | 1 of 13 | 1 of 13 | 7 of 13 |

The honest reading: the playbook did not beat either baseline, and for naming the specific famous local guest the generic LLM did better. That is a world-knowledge question, and Qloo's city recommendations reflect what over-indexes with an audience in a city, not who is most famous there. So the City Playbook's local-act card is now a hybrid: Gemini proposes candidates, Qloo checks each name exists (a name Qloo cannot find is dropped, never shown) and ranks the survivors by taste fit. That hybrid has not been tested on new cases, and we make no claim about it. Run 1 is published as run 1; run 2 was judged on fresh cases reviewed after the method changed.

Case selection: run 1 started from 26 candidates and 14 were accepted, after a controller pre-filter (weak source, future date, not city-specific, not local) and Prateek's review; run 2 went from 16 candidates to 13. Both candidate files (`backtest/candidates.json`, `backtest/candidates-run2.json`) are committed with the rejection notes.

Limitation: Qloo's graph (and the LLM's training data) may already reflect these past activations (post-hoc leakage); we cannot control for this. The backtest shows consistency with real decisions, not causal lift. The samples are small and say so.

See the full per-case table, sources and "where we lost" at `/proof` in the dashboard.

## How scores are calibrated

In the first Mac DeMarco recording, activation scores clustered at 73.9-76.1 because three affinity components saturate near 0.9, so a fixed verdict cut decided cities by noise. Across all 32 calibration cities the default config gave a range of 51.5–96.8 with an IQR of only 2.67. Plan 5 rescales the affinities from per-component floors, re-bases fan concentration against an even spread, sets the verdict thresholds from quantiles, marks thin-data cities `insufficient_data` and flags any verdict within 2 points of flipping as a "close call". Inputs were four recorded Tour Board runs (32 scored cities); backtest cases were never used. Source: `docs/qloo/calibration.md` (`calibrated-2026-10-17`).

| Config | Activation range | IQR | Fragile cities (±1 point) | Verdicts |
|---|---|---|---|---|
| Before (default) | 51.5–96.8 | 2.67 | 5 | play 15, consider 10, hidden_goldmine 6, skip 1 |
| After (calibrated) | 0.0–52.0 | 24.09 | 4 | play 12, consider 10, skip 7, insufficient_data 1, de_risk 1, hidden_goldmine 1 |

Affinity floors: sponsor_fit 0.92, local_hooks 0.95, venue_fit 0.88. Close calls (verdict changes within ±2 points): 10 before, 10 after. The showcase tour (Natalia Lafourcade across Mexico, Brazil and the United States) was re-recorded on the calibrated scoring: Ciudad Juarez is the Hidden goldmine; El Paso, San Diego and Reynosa are Play.

### Run the backtest

```bash
cd cloud_run/qloo_gateway && npm run build && QLOO_GATEWAY_URL=<gateway> node dist/backtest/cli.js --cases ../../backtest/cases.json --out ../../backtest/results.json
# run 2 (fresh local-act cases)
QLOO_GATEWAY_URL=<gateway> node dist/backtest/cli.js --cases ../../backtest/cases-run2.json --out ../../backtest/results-run2.json --method-note "Local acts: city-popular artists re-ranked by taste fit (qloo_rank). Judged on fresh cases reviewed after the method was fixed."
```

### Re-run calibration

```bash
cd cloud_run/qloo_gateway && npm run build
node dist/scoring/calibrateCli.js --in test/fixtures/calibration/*.json --version calibrated-2026-10-17 --write src/scoring/calibration.ts --report ../../docs/qloo/calibration.md
```

The four trimmed recordings that produced `calibrated-2026-10-17` are committed in `cloud_run/qloo_gateway/test/fixtures/calibration/` (only the scores, affinities and zone shares; no entity ids, coordinates or refs), and a test checks that this command reproduces `src/scoring/calibration.ts` exactly. `src/scoring/calibration.ts` is generated; never edit it by hand.

---

## Google Cloud stack

Gemini (Vertex AI) · Agent Builder / Dialogflow CX Playbooks · Cloud Run (4 services) · BigQuery · Cloud Storage · Secret Manager · Cloud IAM — plus Parallel Search/Task/Monitors, MCP, and Chrome WebMCP.

## License

[MIT](LICENSE) © 2026 Prateek Srivastava
