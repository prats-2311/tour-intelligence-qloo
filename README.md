# Tour Intelligence × Qloo

[![test](https://github.com/prats-2311/tour-intelligence-qloo/actions/workflows/test.yml/badge.svg)](https://github.com/prats-2311/tour-intelligence-qloo/actions/workflows/test.yml)

**Route with anything. Win every city with this.**

For each city on a tour, Tour Intelligence shows the brands, venues and support acts the artist's fans rank far above the city as a whole. In Los Angeles, Mac DeMarco's fans rank Stüssy #1; it isn't in LA's overall top 20. That gap is the sponsor pitch. It comes from Qloo's taste graph, it is checked against the city's own baseline, and every written claim is verified against the Qloo results it cites (claims that fail are struck).

Among 10 candidates per case, Qloo put the real tour's pick at mean reciprocal rank 0.47, against 0.29 for a random order and 0.13 for the city's popularity list, which usually didn't contain the pick at all (Qloo ahead in 17 of 22 cases, p<0.001). Gemini alone did better still (0.57; not significant), and the claim checker caught 10 of 10 planted false claims. Where an LLM did better, we say so under Limits.

Who pays and why: promoters and agencies pay per tour; the return comes from sponsor deals and a better-sold room. We state no revenue, customer or price numbers because we have none.

## Links

- Live app: <https://tour-intel-qloo.web.app> (it opens on a recorded example, so there is nothing to type first)
- Proof page: <https://tour-intel-qloo.web.app/proof>
- Public MCP server (rate-limited demo, no auth): <https://tour-intel-mcp-public-602700957663.us-central1.run.app/mcp>
- Licence: [MIT](LICENSE)
- Proof protocol, with its 10 dated amendments: [docs/qloo/proof-v3-protocol.md](docs/qloo/proof-v3-protocol.md)

## The problem

Sponsorship is the highest-margin business in live music: Live Nation's sponsorship and advertising arm made [$1.3B in 2025 at a 64% margin](https://news.livenationentertainment.com/news/live-nation-entertainment-full-year-and-fourth-quarter-2025-results), and over 70% of 2026 commitments were already booked by February. Market choice still runs on instinct ("[their gut is a combination of hundreds of internalized pieces of data](https://www.waterandmusic.com/how-booking-agents-use-and-dont-use-data)", a Paradigm agent told Water & Music in 2021). Soft markets are costly: [one 2025 tour was cancelled](https://www.complex.com/music/a/alex-ocho/bobby-shmurda-addresses-tour-canceled-booking-agent-claims-low-ticket-sales) at about 10 tickets per city, by its booking agent's account, and Hypebot [reported](https://www.hypebot.com/what-is-blue-dot-fever-the-rising-tide-of-tour-cancellations-in-2026.md) at least 10 major artists postponing or cancelling dates in 2026. Top-100 tour [tickets fell 3.7% to 67.3M in 2025](https://news.pollstar.com/2025/12/12/year-end-business-analysis-a-return-to-earth-2025-grosses-ticket-sales-drop-averages-increase-beyonce-oasis-coldplay-have-top-tours-venues-stadiums-rock/) (Pollstar). Merch adds about [$10.29 per head](https://www.atvenu.com/post/an-updated-look-at-artist-merch-trends) (atVenu). These figures describe the industry, not this tool's results.

## The 2-minute judge path

New here? "Take the tour" on the landing page walks through these steps in 9 short stops, the last one in the chat on the recorded example (Back, Next, Skip; it never starts on its own).

1. **Markets** (opens on the example): fan heat per city, with "Try a routing" to replay a recorded run where a tour's cities were pasted, scored and ordered. To paste your own cities, use "Try your own artist". ![Landing](docs/screens/01-landing-desktop.png)
2. **Decide:** winnability per city, and the "where fan heat and winnability disagree" section, described as "worth a second look" rather than a ranking claim. ![Decide](docs/screens/02-board-winnability-desktop.png) Compare with the same cities as a generic LLM ranks them, without Qloo: ![Without Qloo](docs/screens/03-board-without-qloo-desktop.png)
3. **Playbook:** open a city for sponsors (with lift versus the city), acts these fans love in the city, venues, support acts, verified claims and verdict clocks. ![Playbook](docs/screens/04-playbook-desktop.png)
4. **Tour Book:** the printable document with a chapter per city. ![Tour Book](docs/screens/05-tour-book-cover-desktop.png)
5. **Ask about this tour:** a recorded Q&A in which the strategist answers with its work log visible. On the example you can also type a free-text question, or pick 

Also in the app:

- **Links on rows.** Place rows open a Google Maps search for the name in that city. Act rows open a Spotify search for the name.
- **Checked-claims panel.** Open it from any claim badge. It lists what was verified against the cited Qloo results and what was removed.
- **Acts these fans love here.** The card was called "local acts" until Test C. It can include acts that are not from the city (see Proof), so the name and a warning say so.
- **Advance & risks tab.** Weather history from Open-Meteo for the dates, labelled "not a forecast". Public holidays from Nager.Date. Visa and equipment notes from Tavily search plus Gemini, each with its sources and checked against them. Confirm these before you rely on them.
- **Sponsors by age group.** Pick an age group to see brands that group's fans rank higher. It uses Qloo audience demographics and its demographic signal, on age only. Each group shows a signed index such as "+0.91 vs the average audience (not a share)". Groups that include under-21s carry a note to keep alcohol sponsors out.
- **Team workspaces.** Share a link, no sign-in. A workspace holds status, notes, overrides, sponsor leads and an activity log, and shows the team's decisions in the Tour Book. Each visitor of the example gets a private copy with a seeded discussion between fictional teammates.
- **Taste Loop concept page** at `/v2`. A fictional example artist with real LA data, no predicted numbers, its own short tour and an "Experiences fans could book" section. When analytics are on, its RSVP-style buttons (going, waitlist, was there) are logged as anonymous prototype taps; otherwise they stay mock and disabled.
- **For agents page** at `/agents`. Lists the 9 public MCP tools, the Claude Code plugin install and WebMCP, with an example tour report (fictional artist).
- **11 WebMCP tools** registered by the dashboard in Chrome: `get_tour_board`, `get_city_playbook`, `open_city`, `set_comparison_mode`, `build_tour_from_shortlist`, `open_tour_book`, `get_sponsors_by_age`, `get_advance_risks`, `get_team_notes`, `add_team_note`, `set_city_status`.
- **Live trust meter and team decisions on `/proof`.** When BigQuery analytics are enabled, `/proof` shows aggregate counts from real playbook runs (claims checked and removed, median latency, sponsors hidden) and how teams used workspaces (statuses, overrides of Qloo's pick, notes by role). With analytics off the panels do not appear.
- **Not-found page**, a favicon and a link preview card.an "Ask live" suggestion. Then open `/proof`. ![Proof](docs/screens/06-proof-desktop.png)

<!-- Screenshot list (one place to fix names): 01-landing, 02-board-winnability, 03-board-without-qloo, 04-playbook-*, 05-tour-book-cover, 06-proof; each in -desktop.png and -mobile.png under docs/screens/ -->

## How it uses Qloo

Every Qloo call goes through one service, [`qloo_gateway`](cloud_run/qloo_gateway), which holds a single `qloo mcp` child process (the Qloo harness, `@qloo/qloo-harness`). Ten harness tools are allowlisted ([ADR 0001](docs/adr/0001-qloo-through-harness-gateway.md)).

| Harness tool | Product job |
|---|---|
| `qloo_describe` | Resolve an artist or city act to a Qloo entity; read its popularity (support acts must be smaller than the headliner) |
| `qloo_where_popular` | Heat points per city: fan heat, and the location check that every city sits on its own heat points |
| `qloo_audience_demographics` | Who the fans are in each city (over/under-index versus average) |
| `qloo_entity_tags` | Taste tags that drive sponsor fit and local hooks |
| `qloo_trends` | Trend window for the artist in the city (7-day cache) |
| `qloo_recommend` | Sponsor brands, real music venues, local acts, film and TV hooks |
| `qloo_rank` | Rank a fixed candidate list by taste fit (venues, acts fans love, sponsor candidates) |
| `qloo_compare_audiences` | Shared taste between the headliner and a support act or a city act |
| `qloo_find_tags` | Used once, offline, to fix the 4 venue-category tag ids; not called at runtime |
| `qloo_capabilities` | Gateway health check (is the harness connected and ready); plumbing, not a product screen |

A redacted request and result, shape only (the venue call in a city):

```jsonc
// request to qloo_recommend
{ "target_type": "place", "signals": ["<artist entity id>"], "filter_location": "<City, CC>",
  "include_tags": ["<4 venue-category tag ids>"], "include_tags_operator": "union", "limit": 20 }
// result (compacted by the harness)
{ "status": "ok", "entities": [ { "id": "<entity id>", "name": "<venue>", "affinity": 0.xx, "popularity": 0.xx } ] }
```

## How scores work

Scores are deterministic code, never LLM output; missing data gives `insufficient_data`.

- **Winnability = 0.5 × fan heat + 0.5 × activation.** Activation combines sponsor fit, local hooks, venue fit and fan concentration.
- **Calibration `calibrated-2026-10-17`.** Raw affinities saturated near 0.9, so a fixed cut decided cities by noise (activation range 51.5–96.8, IQR 2.67 on 32 recorded cities); after rescaling from per-component floors the range is 0.0–52.0, IQR 24.09. Details in [docs/qloo/calibration.md](docs/qloo/calibration.md). A re-run on 2026-10-24 failed its pre-set gate, so the 2026-10-17 calibration was kept.
- **Location check.** Qloo resolved "Ciudad Juarez, MX" to Mexico City (all 20 heat points about 1,555 km median away), so every city is now checked against its own heat points and flagged if they sit elsewhere ([docs/qloo/api-notes.md](docs/qloo/api-notes.md)).
- **Major markets** with floored fan heat are capped at Consider.
- **Sponsor lift is rank based.** Qloo rescales `affinity` within each response, so an artist response and a city-baseline response are on different scales (an affinity difference showed every sponsor as -2 to -5 "vs city"). Lift is how many places higher fans rank a brand than the city does.
- A close-call flag marks cities whose verdict changes within ±2 points.

## Proof, honestly

Everything below is from [Proof v3](docs/qloo/proof-v3-protocol.md): a protocol committed before any Qloo or Gemini call, with 10 amendments, each committed before the call it affected. We publish whatever came out, including losses. The full tables are at [/proof](https://tour-intel-qloo.web.app/proof). Raw results stay private (Qloo's data policy).

- **Test B, fixed candidates, 22 of 27 reviewed cases** ([protocol](docs/qloo/proof-v3-protocol.md)): Qloo rank beat popularity (p<0.001): mean reciprocal rank 0.47 vs 0.13, 17 wins, 1 loss, 4 ties over 22 cases. Not significant at this sample size: Qloo rank trails Gemini (0.47 vs 0.57; p=0.118; 4 wins, 11 losses, 7 ties).
- **Test B after the model's cutoff** ([Amendment 9](docs/qloo/proof-v3-protocol.md), cases dated 1 Apr to 29 Oct 2026, fixed before any case was collected): 8 of 18 collected cases were scored. Mean reciprocal rank: Qloo rank 0.70, Gemini 0.88, popularity 0.10; chance level 0.29. Qloo rank beat popularity (p=0.016): 7 wins, 0 losses, 1 tie over 8 cases. Not significant at this sample size: Qloo rank trails Gemini (0.70 vs 0.88; p=0.625; 1 win, 3 losses, 4 ties). 10 cases were excluded because the real pick could not be resolved in Qloo. The cases were collected and verified by AI agents, with no human review, and the sample is small.
- **Claim checker** ([protocol](docs/qloo/proof-v3-protocol.md)): it removed 10 of 10 planted false claims (5 plausible wrong numbers, 4 absent numbers, 1 swapped name).
- **Test C, grounding** ([protocol, Amendments 4–6 and 8](docs/qloo/proof-v3-protocol.md)): this is a loss for Qloo. We asked whether the names each playbook returns exist in the city. Share rated as existing in the city: venues 1.00 (27/27) for Qloo against 1.00 (36/36) for the LLM-only playbook; brands 1.00 (31/31) against 1.00 (36/36); local acts 0.48 (13/27) against 1.00 (27/27); overall 0.84 against 1.00. The LLM-only playbook beat Qloo in 7 cities, Qloo won none and 2 tied (p=0.016). The secondary analysis (each playbook cut to the smaller of the two counts per city and category) reaches the same conclusion. Qloo's local-act names were often real acts that are not from the city, so the playbook card is now called "Acts these fans love here" and carries a warning that some acts may not be local. **Raters (Amendment 8):** 148 of 182 rows were rated by blinded AI agents (Claude Sonnet), with every local-act row and every uncertain row re-checked against a fetched page. The author rated 34 rows and agreed with the agents on 28 (82%); the author adjudicated the 6 disagreements against the fetched evidence. The author had seen the showcase playbooks, so those 34 ratings are not fully blind to prior exposure. Names stay private; only aggregates are published.

**Verified claims, across the product** ([Amendment 10](docs/qloo/proof-v3-protocol.md), written 30 Oct before any of it was run). The claim checker above is one of five checks that stop a wrong number or name reaching the user. Each of the others was given 20 planted errors and 20 clean controls, from fixed, deterministic generators written into the protocol (run offline: no Qloo or Gemini call). These are checks, not comparisons, so there is no significance test.

| Checker | What it guards | Planted errors caught | False alarms on clean controls |
|---|---|---|---|
| Strategist answer check | Numbers in the strategist's answers that appear in no tool result | 20 of 20 | 0 of 20 |
| Document citation check | Numbers cited to a page of your document that do not contain them | 20 of 20 | 0 of 20 |
| Advance source and number filter | Visa and customs notes from another country's pages, or with numbers not in their source | 20 of 20 | 0 of 20 |
| Sponsor check | Non-profits, advocacy, political and religious groups listed as sponsors | 18 of 20 | 3 of 20 |

The planted errors are synthetic and the fixtures small. The sponsor row measures the rule given a fixed fake classifier output (including made-up wrong and missing answers), not the live model; with the classifier unavailable, the name rule alone caught 12 of 20 with 0 of 20 false alarms. The 2 misses are classifier answers that wrongly said "yes"; the 3 false alarms are brands the made-up classifier wrongly said "no" or did not answer for. Counts of automated tests, rule mutation checks and end-to-end specs are on `/proof`.

### Limits

- The popularity baseline is weak by construction: in 18 of 22 cases the real pick wasn't on the city's popularity list, so that arm ranked it last.
- **Test A, city ranking, 10 of a planned 12 artists** ([protocol](docs/qloo/proof-v3-protocol.md)): The generic LLM beat winnability (p=0.031): mean R-precision 0.82 vs 0.66, 0 wins, 6 losses, 4 ties over 10 artists. For context: fan heat 0.68, population 0.79, chance 0.62. Winnability versus fan heat is not significant (1 win, 1 loss, 8 ties). We therefore do not claim winnability picks better cities, and that is why the product leads with winning each city rather than choosing them ([ADR 0002](docs/adr/0002-winning-a-city-not-choosing-it.md)).
- **Gemini + Qloo combined** ([Amendment 7](docs/qloo/proof-v3-protocol.md), added on 29 Oct after Tests A and B were published, before any combined number was computed): fusing Qloo's ranking into Gemini's (reciprocal rank fusion, k=60) did not beat Gemini alone. Test B: mean reciprocal rank 0.50 vs 0.57 (4 wins, 10 losses, 8 ties over 22 cases; p=0.180, not significant). Test A: mean R-precision 0.75 vs 0.82 for the LLM alone (0 wins, 4 losses, 6 ties over 10 artists; p=0.125, not significant). Exploratory, small n: on the 4 Test B cases dated after the answering model's training cutoff, fusion scored 0.47 vs Gemini 0.31 (2 wins, 2 losses; p=1.0, no claim); no Test A tour started after the cutoff.

**Limits.** Qloo data is current, not as of the tour date. "Played" means agreement with the routing a tour actually took, not profit. Samples are small. The venue-name proxy stands in for mid-tier. Test C was rated mostly by AI agents, and the author's 34 ratings follow prior exposure to the showcase playbooks. The earlier 2026-10-17 backtest (the playbook's local-act card against city popularity and a generic LLM, on 27 cases) is still published at `/proof` and did not beat the LLM at naming a famous local guest, which is why that card is now a hybrid in which Gemini proposes and Qloo verifies.

## Architecture

![System architecture: browser and MCP clients reach the dashboard and public MCP server, which call the IAM-private qloo_gateway; the gateway calls the Qloo harness, Vertex Gemini, Tavily, Open-Meteo and Nager.Date, and Firestore.](docs/screens/architecture.png)

One city playbook, step by step:

![Sequence for one city playbook: location check, up to 22 Qloo lookups, a batched sponsor check, streamed cards, then the narrative with claim checking.](docs/screens/playbook-flow.png)

<details><summary>Mermaid source</summary>

```mermaid
flowchart LR
  U[Manager or agent<br/>browser] --> D
  A[AI agents<br/>MCP clients] --> P
  D["Dashboard (Cloud Run)<br/>React SPA, Express BFF, WebMCP tools"] --> G
  D -.-> S[(Private GCS<br/>recorded example)]
  P["Public MCP server<br/>9 tools, rate-limited"] --> G
  subgraph PRIV["IAM-private"]
    G["qloo_gateway (Cloud Run)<br/>Qloo caller with budget, scoring and lift,<br/>playbook builder, sponsor check, narrator,<br/>claim checker, strategist, this week,<br/>advance (new), workspaces (new)"]
    H["qloo mcp harness<br/>stdio child, 10 allowlisted tools"]
  end
  G --> H --> Q[(Qloo API)]
  G --> V[Vertex Gemini<br/>narrative, strategist, sponsor check]
  G --> T[Tavily<br/>web search, 25/day]
  G --> W["Open-Meteo and Nager.Date (new)<br/>weather, holidays"]
  G --> F[(Firestore<br/>cache, usage counters, workspaces)]
  classDef qloo stroke:#ffcc00,stroke-width:2px;
  classDef web stroke:#6aa8ff,stroke-width:2px;
  class H,Q qloo;
  class T,W web;
```

```mermaid
sequenceDiagram
  autonumber
  participant UI as Dashboard
  participant GW as qloo_gateway
  participant Q as Qloo
  participant GM as Gemini
  UI->>GW: city playbook for artist and city
  GW->>Q: where popular (location check)
  Q-->>GW: city placed, or stop
  GW->>Q: up to 22 lookups: brands, places, films, TV, acts, city baselines
  Q-->>GW: results
  GW->>GM: sponsor check (one batched call)
  GM-->>GW: yes or no per brand
  Note over GW: Lift by rank: fans' rank vs city rank. Scores are code, never the LLM.
  GW-->>UI: cards (streamed first)
  GW->>GM: write claims with entities, numbers, evidence ids
  GM-->>GW: draft narrative
  Note over GW: Claim checker: every number and name must be in the cited Qloo results
  GW-->>UI: narrative, N verified, M removed, Checked-claims panel
```

</details>

Decisions: [ADR 0001 Qloo through the harness gateway](docs/adr/0001-qloo-through-harness-gateway.md), [ADR 0002 winning a city, not choosing it](docs/adr/0002-winning-a-city-not-choosing-it.md), [ADR 0003 recordings private, synthetic tests](docs/adr/0003-recordings-private-synthetic-tests.md). The design spec is [docs/superpowers/specs/2026-10-16-tour-intelligence-qloo-design.md](docs/superpowers/specs/2026-10-16-tour-intelligence-qloo-design.md).

### Connect an MCP client

```bash
claude mcp add --transport http tour-intel https://tour-intel-mcp-public-602700957663.us-central1.run.app/mcp
```

Nine tools: `find_tour_markets`, `get_city_playbook`, `suggest_support_acts`, `rank_venues`, `get_local_moment`, `get_sponsors_by_age`, `get_advance_risks`, `get_team_notes` (read-only, from a workspace link) and `get_tour_report` (board plus top playbooks in one call). The server also offers the prompts `plan_tour` and `brief_for_sponsor_meeting` and the resource `tour-intel://about`. Limit 30 requests per 10 minutes per IP, 2 regions and 3 stops per board, cached results, and a shared daily Qloo budget. Results are affinity signals from aggregate taste data, not ticket forecasts or claims about individuals.

Claude Code plugin (the MCP server plus a `plan-tour` skill, no key needed):

```
/plugin marketplace add prats-2311/tour-intelligence-qloo
/plugin install tour-intel@tour-intelligence-qloo
```

## Run it

Needs Node 22 (22.19 or newer) and git. Nothing else: no keys, no Google Cloud account, no Firestore.

```bash
git clone <this repo> && cd <repo>
npm run setup        # npm ci for the gateway and the dashboard
npm run dev:all      # gateway :8080 + dashboard server :8787 + Vite :5173, all in memory
```

Open <http://localhost:5173/?sample=1>. `dev:all` prints one line per optional service that is off and what still works. Ctrl+C stops all three.

The real recorded Mac DeMarco example is private under Qloo's data terms and is not in this repo, so a local run uses the synthetic "Lumen Vale" sample instead (the landing page's "See the example tour" says the recording is unavailable and links to the sample; two 503s on `/api/recordings/*` in the browser console are expected). `/proof` loads the private backtest recording, so locally it shows "Proof results are unavailable right now"; the measured results and the scripts that produce them are in this README and `cloud_run/qloo_gateway`.

### Three levels

1. **No keys (sample mode).** Works: the Lumen Vale sample board, city playbooks, Tour Book, Charts, Budget, team workspaces (in memory), `/v2`, `/agents`, `/proof`. Off: live runs for your own artist, Gemini narration, "this week" and Advance, analytics.
2. **Qloo key (live runs).** Install the harness once, put your key in `.env`, restart `dev:all`: `npm i -g @qloo/qloo-harness@^0.1.26 && qloo setup --qloo`, then `cp .env.example .env` and set `QLOO_API_KEY`. Then "Try your own artist" builds real boards. Without Gemini, narration and local acts fall back to deterministic text. Check `http://127.0.0.1:8080/health`: `connected:true` after the first live call.
3. **Plus Gemini.** Either a Google AI Studio key (`GEMINI_API_KEY`, no Google Cloud needed) or Vertex AI (`GOOGLE_CLOUD_PROJECT` plus `gcloud auth application-default login`). If both are set the AI Studio key wins unless `GEMINI_PROVIDER=vertex`. Optional on top: `TAVILY_API_KEY` for this-week and Advance web lookups; `BQ_DATASET` for BigQuery analytics (needs a Google project and ADC).

### Configuration

Names only; copy [`.env.example`](.env.example) to `.env` (git-ignored; loaded by `dev:all`). Never commit values.

| Variable | Needed for | Without it |
| --- | --- | --- |
| `QLOO_API_KEY` | live Qloo runs | live runs disabled; the sample tour still works |
| `GEMINI_API_KEY` or `GOOGLE_CLOUD_PROJECT` + ADC | narration, local acts, sponsor check, strategist | deterministic fallbacks; those features are off |
| `TAVILY_API_KEY` | this week, Advance & risks | those cards are off |
| `BQ_DATASET` (+ project, ADC) | analytics | off; stats routes answer "disabled" |
| `RECORDINGS_DIR` | the private recorded example | the synthetic Lumen Vale sample |
| `QLOO_GATEWAY_URL` | dashboard server to gateway | set by `dev:all`; a loopback URL sends no Google token |
| `PORT`, `GATEWAY_PORT` | ports | gateway 8080, dashboard server 8787, Vite 5173 |

Other names (`QLOO_BASE_URL`, `QLOO_TRUSTED_BASE_URL`, `QLOO_BIN`, daily ceilings, model names, `QLOO_CACHE_BACKEND`, `QLOO_USAGE_BACKEND`, deployment-only URLs) are documented in `.env.example`. The gateway keeps its cache, usage counts and team workspaces in memory unless `QLOO_*_BACKEND=firestore`, which needs Google ADC.

### Tests

```bash
npm run test:scripts                                  # dev:all and .env.example guards
cd cloud_run/qloo_gateway && npm test                 # gateway
cd dashboard && npm test && npm run lint              # dashboard
./run_tests.sh                                        # everything, needs a Python .venv (see requirements-dev.txt)
```

## Limitations

- Affinity is a taste signal, not a ticket forecast.
- The hybrid local-act card (Gemini proposes, Qloo verifies) was not covered by the earlier backtests; Test C later found it often returns acts that are not from the city.
- The proof samples are small (10 artists, 22 cases) and the limits above apply.
- The public MCP is a rate-limited demo running on the author's Qloo key.
- Workspace links are capability links: anyone with the link can read and write the workspace. Demo workspaces expire after 30 days.
- Workspace rate limits are counted per server instance, not across instances.
- Advance & risks comes from web sources and a model summary. It is checked against those sources, but confirm visas and equipment with the venue or an official source.
- Age segments show over- and under-index, which is noisy, not a share of the audience. Qloo's demographic signal accepts numeric age ranges only, so the groups are fixed bands.
- WebMCP tools need Chrome with the feature enabled.
- A short do-not-book list (currently one act) is applied at display time; affected cards say so. Recorded data and proof results are unchanged.
- Non-profit, advocacy, political and religious organisations are kept off the sponsor card by a model check (one batched Gemini call per playbook: could this brand sponsor a concert? Unanswered ids are hidden) plus a short disclosed name list, because Qloo brand entities carry no tag that identifies them. The card says how many were hidden, or that the check was unavailable. In live runs they are removed before ranking, so the remaining brands' ranks are among the brands shown; the recorded example uses the name list only.

- Analytics are optional. The gateway writes to BigQuery only when `BQ_DATASET` and the project are set (tables created once by `cloud_run/qloo_gateway/scripts/bq_setup.sh`). Rows hold our own counts and metadata: city, verdict, claim and call counts, latency, team event types, anonymous hashed session or workspace ids. Never stored: Qloo results, note text, names of people or raw IPs. Logging is best effort and the stats routes answer "disabled" on any failure.

## Operations

During judging, the dashboard (`tour-intel-qloo`) and the gateway (`qloo-gateway`) each keep one warm instance (`--min-instances 1`; a cold start took about 2.8 s against 0.4 s warm). After judging, and no later than 13 Nov 2026, set both back to 0: `gcloud run services update tour-intel-qloo --min-instances 0` and the same for `qloo-gateway` (and `MIN_INSTANCES=0` for later dashboard deploys).

## Data policy

No Qloo response data is committed here. Real recordings are served from private storage by the dashboard server; tests use synthetic fixtures; `scripts/check-public-data.sh` guards the public clone. Only artist, city, venue and brand names go to Qloo, never personal data. See [ADR 0003](docs/adr/0003-recordings-private-synthetic-tests.md).

## New versus existing project

Forked from the author's Agentic Cinema (Google Cloud) entry, which supplies the legacy `tour_data_api`, Dialogflow agents and delight-card renderer (see [`archive/`](archive)). The Qloo work began on 2026-10-16: the gateway, scoring, Tour Board, playbooks, Tour Book, strategist, MCP tools, proof and calibration. At the time of writing, 415 commits since 16 Oct 2026 (`git rev-list --count --since="2026-10-16 00:00" HEAD`; `node scripts/readme-numbers.mjs` prints the figures used here).

### What's next (not built)

Next: a saved taste profile for each artist on a manager's roster: their own likes, their no-go brands, and the outcome of every activation. Qloo supplies the taste, the profile supplies the intent, and the results make each tour's plan better than the last.

## Licence

[MIT](LICENSE) © 2026 Prateek Srivastava
