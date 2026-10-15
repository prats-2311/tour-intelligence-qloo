# Tour Intelligence × Qloo — Design Spec

- **Date:** 2026-10-16
- **Status:** Draft for review
- **Target:** Qloo Agentic Hackathon (qloo.devpost.com) — deadline 2026-10-30 11:45 PM ET (2026-10-31 09:15 IST). Internal submission target: 2026-10-30 (IST evening).
- **Origin:** Upgrade of *Tour Intelligence* (Google Cloud "Agentic Cinema" hackathon, repo `prats-2311/google_promotions`). Submitted as an **existing project, significantly upgraded with Qloo** (Devpost field 28701).

---

## 1. Intent and success criteria

### 1.1 What we are building
A taste-powered planning system for live music tours that answers one question: **where can this artist win, and exactly how?**

> *Other tools tell you where your fans are. Tour Intelligence tells you where you can **win** — and exactly how — city by city.*
>
> One-liner: **"Don't just find your fans. Win their city."**

### 1.2 Who it is for
- **Primary:** promoters, booking agents, artist managers and label marketing teams planning tours for mid-tier and emerging artists — teams without a ticketing data warehouse, entering markets with no sales history.
- **Secondary ("also works for"):** film press tours (the original Tour Intelligence use case) — routing is fixed by the studio; the open problem is how to show up.

### 1.3 Success criteria (judging-aligned)
| Criterion (equal weight; tie-break order) | What success looks like |
|---|---|
| Technological Implementation | All 10 Qloo harness tools used, each with a real product job; deterministic tested scoring; real agent tool-calling; MCP + WebMCP; full test suite green. |
| Design | A judge completes the showcase path on a phone or laptop in ≤ 2 minutes with no login; coherent product, not a dashboard of API dumps. |
| Potential Impact | Specific buyer, specific decision (which cities, and the activation plan per city), framed in money (sponsorship, merch, promo spend). |
| Quality of the Idea | Unique in the field: competitors route on fan density only; we route on **winnability** and produce the per-city activation playbook. |

### 1.4 Explicit non-goals
- Calendar/travel logistics (date ordering, drive limits, off days, routing math). We decide *which cities and why*, then hand off.
- Ticket-demand forecasting. Qloo provides taste affinity, not sales predictions; we say so in-product.
- User accounts/login, organizer event upload, social features, native apps, PWA/offline.
- Exposing raw Qloo tools publicly.

---

## 2. Context that shaped this design

- **Judges:** Jason Calacanis, Mike Diolosa (Qloo CTO), Nicole Seligman, Todd Boehly, Cedric the Entertainer, Michael Abrams (EVP Strategic Initiatives, Live Nation).
- **Qloo client-story patterns** we deliberately echo: Clarion (co-tenant evidence that closes a deal → co-billing, deal-ready deliverable), jewelry brand (expensive market-entry decisions → winnability), Netflix (Qloo complements rich first-party data; Vans/coffee-not-tea → sponsor & merch fit), JCDecaux (block-level promo targeting → promo zones), Michelin (same block, different style → venue fit).
- **Ticketing-data objection** (Live Nation owns Ticketmaster): *ticketing tells you who bought; Qloo tells you what else they love, where their lookalikes are, and how to win the room.* We complement, not compete.
- **Competitors in this hackathon:** `routed` (strong: heatmap routing, rooms, support acts, with/without proof, MCP, active), `tourscout` (no live demo), `tourtaste` (shallow, stale). All stop at city/room/opener. None has activation, sponsor/merch fit, live-web grounding, multi-agent, WebMCP, PDF book, or film tours. We do not pitch heatmap routing as novel.
- **2025 Qloo hackathon winners** (GeoTaste, Alloy, Resonance AI, Zesty) were B2B-leaning, polished, deployed, and shallow on Qloo. Lessons applied: never let an LLM invent a headline metric (Alloy), make claims match code, polish the demo moment (GeoTaste), turn Qloo output into a decision framework (Resonance).

---

## 3. Product flow — Discover → Decide → Activate → Book

**Input:** artist name; target regions (e.g., Mexico, Brazil, US); date window (informational, for the live-events check); venue capacity tier; max stops.

**How agentic this is (stated honestly in README):** the core pipeline is a fixed plan executed by code (fast, cacheable, reliable). The LLM agent (a) interprets the brief into tool inputs, (b) resolves ambiguous entities with the user, (c) runs free tool-calling in the "Ask the strategist" chat, (d) writes explanations. "The LLM reasons, code acts."

### ① Discover — fan heat (≈ 4 + R Qloo calls, R = regions)
| Step | Tool | Output |
|---|---|---|
| Resolve artist | `qloo_describe(entity, type=artist)` | Confirmed entity; `needs_input` → "Did you mean…?" picker |
| Market heat | `qloo_where_popular(entity, within=<region>)` per region | Candidate cities with affinity/popularity, including markets not on the plan |
| Fan base | `qloo_audience_demographics`, `qloo_entity_tags` | Aggregate audience profile and defining concepts |
| Momentum | `qloo_trends([artist], last 90 days)` | Artist-level rising/flat/falling (not per city; not in the city score) |

### ② Decide — winnability (activation computed for the top N = 8 cities)
Per shortlisted city, compute activation inputs (≈ 5 calls/city, progressive, cached), then the score and verdict (§5).

### ③ Activate — the city playbook
| Card | Qloo / other | Content |
|---|---|---|
| Sponsor & brand partners | `qloo_recommend(target_type=brand, signals=[artist], filter_location=city)` | Brand categories/brands this city's fans over-index on, with affinity |
| Merch localisation | same brand + `entity_tags` | Style/colour/theme directions for a city-exclusive drop |
| Promo zones | `qloo_where_popular(artist, within=city)` | Neighbourhood heat map; top zones for posters/OOH |
| Local moment | `qloo_recommend(target_type ∈ {artist, place, movie, tv_show}, signals=[artist], filter_location=city)` → existing Local Delight agent | What this artist's fans in this city also love; stage nod / guest ideas / phrases |
| Venue fit | `qloo_recommend(target_type=place, …)` + existing Parallel venue discovery → `qloo_rank(options ≤ 10, option_type=place, signals=[artist], signal_location=city)` | Top 3 venues by crowd fit |
| Co-billing | `qloo_recommend(target_type=artist, filter_location=city)` → `qloo_compare_audiences([artist] vs [candidate])` for top 3 → `qloo_rank` | Support acts with overlap and lift |
| Talent brief & press angle | `qloo_compare_audiences([artist] vs [city mainstream proxy])` → existing Talent Prep agent | What to lean into / avoid |
| This week in the city | Existing Parallel live search | Festivals, holidays, rival shows in the date window, cited |

Activation findings feed back into ② (they are the inputs to the activation-potential score).

### ④ Book — deliverables
- **Tour & Activation Book** (existing Executive Tour Book, extended): market-selection chapter (heat map, winnability table, density-only vs winnability comparison), one activation chapter per city, provenance appendix listing every Qloo request. Print stylesheet → PDF; plus an `.ics` of chosen stops.
- "Build tour from shortlist" creates a campaign in the existing campaign system; existing per-city briefs (Culture, Delight, Talent) run with Qloo evidence attached.

### ⑤ Proof — the activation backtest (`/proof`)
Competitors "prove" Qloo by scoring tours against Qloo's own heatmap (circular). We test against **real-world outcomes**.

- **Question:** for real past tours, would our Qloo-powered playbook have surfaced the activations that actually happened in that city?
- **Dataset (`backtest_cases`, BigQuery):** 12–20 documented city-specific activations from 2023–2026 tours — local sponsor/brand partnerships, city-exclusive merch collaborations, local guest appearances or covers of local artists. Each case: `artist, city, activation_type (sponsor | merch_collab | local_artist), real_entity, date, source_urls[]`. Candidates are gathered with Parallel Search/Task; **every case is human-reviewed before inclusion** (cases are evidence, so they are not trusted from an LLM). Minimum viable set: 8 cases.
- **Method:** run `get_city_playbook(artist, city)` and check whether `real_entity` appears in the matching card's top-10 (**exact hit**), or shares its Qloo category/tag (**category hit**, via `entity_tags`).
- **Baselines (same cases, same top-10 cut):**
  1. **LLM-only** — Gemini, same prompt, no Qloo.
  2. **City-popularity** — Qloo `recommend(filter_location=city)` **without** the artist signal (tests that the artist's taste adds value beyond "what's popular in the city").
- **Reporting:** per-case table (hit/miss per method, with source links), aggregate hit rates, and an explicit "where we lost" section. Ties and losses are published, not hidden.
- **Disclosed limitation:** Qloo's graph may already reflect past activations (post-hoc leakage); we cannot control for this and say so. The backtest shows consistency with real decisions, not causal lift.
- **Reproducibility:** `scripts/backtest` runs end-to-end from the case table; results JSON committed; `/proof` renders from that JSON (static, no live quota during judging).

---

## 4. Qloo tool constraints (from `@qloo/qloo-harness` 0.1.26 schemas)

- Insights entity types: `artist, book, brand, movie, person, place, podcast, tv_show, videogame`; search adds `locality, actor, album, author, director`. **No event type** — events are represented by their venue (`place`), performer (`artist`), and tags.
- `rank`: ≤ 10 options per call; scores **not comparable across calls**.
- `compare_audiences`: exactly two groups, each ≤ 10 entities.
- `trends`: 1–5 entities, ISO date range, not location-scoped.
- `where_popular`: requires `within`; returns query-relative affinity — **comparability across separate region calls is an open question (§12)**.
- Signals/entity inputs ≤ 10 per call; `limit` ≤ 20 (default 10).
- Result envelope statuses: `ok | empty | needs_input | partial | degraded | error`; envelope includes `provenance.requests[]`.
- Qloo silently ignores invalid parameters → we validate all arguments ourselves.

---

## 5. Scoring (deterministic, pure functions, never LLM-generated)

All scores are 0–100, computed in `qloo_gateway/src/scoring/`, unit-tested, and each carries `inputs[]` references to the Qloo results (tool, request hash) it used.

### 5.1 Fan heat (per city)
`fan_heat = 100 × (0.7 × affinity_norm + 0.3 × popularity_norm)` where `*_norm` are the city's `where_popular` values min-max normalised within the comparison set (method depends on §12 outcome).

### 5.2 Activation potential (per city)
`activation = 100 × Σ wᵢ·cᵢ` over available components, weights renormalised over the components present:

| Component cᵢ (0–1) | Source | Initial wᵢ |
|---|---|---|
| `sponsor_fit` — mean affinity of top-5 brand recs | brand `recommend` | 0.30 |
| `local_hooks` — mean affinity of top-5 cross-domain recs (place, movie, tv_show, local artist) | `recommend` × types | 0.25 |
| `fan_concentration` — share of total heat in the top-3 zones within the city | in-city `where_popular` | 0.25 |
| `venue_fit` — best venue rank score | `rank` (place) | 0.20 |

If fewer than 2 components are available → `activation = insufficient_data`.

### 5.3 Winnability and verdict
`winnability = 0.5 × fan_heat + 0.5 × activation`

| Verdict | Rule (evaluated in order) |
|---|---|
| `insufficient_data` | fan_heat or activation unavailable |
| **Play** | fan_heat ≥ 70 and activation ≥ 60 |
| **Hidden goldmine** | 45 ≤ fan_heat < 70 and activation ≥ 75 |
| **De-risk** | fan_heat ≥ 70 and activation < 45 |
| **Consider** | winnability ≥ 55 (none of the above) |
| **Skip** | otherwise |

Initial weights and thresholds are configuration constants, displayed in the "Why this score?" sheet. A dedicated plan task re-tunes them after the data spike (§12) against the showcase artist and 3 control artists; tests assert the rule table, not specific tuned numbers.

### 5.4 Co-bill lift
`lift = overlap(compare_audiences) × local_affinity(candidate in city)`, ranked; displayed with both factors.

### 5.5 Integrity rules (tested)
- Missing inputs ⇒ `insufficient_data`, never a filler number.
- No score path calls an LLM.
- Every displayed number links to its inputs and the Qloo requests behind them.
- In-product label: "Affinity signal from aggregate taste data — not a ticket forecast or a claim about individuals."

### 5.6 Grounding-verified activation claims
Every playbook card has two layers: **evidence** (structured Qloo/Parallel results) and **narrative** (Gemini-written recommendation text). The narrative is never trusted on its own.

1. **Constrained generation.** Gemini receives only the card's evidence set and must return schema-constrained JSON: a list of atomic claims, each with `text`, `entities[]`, `numbers[]` and `evidence_refs[]` (Qloo result ids / Parallel citation ids).
2. **Verification (deterministic, reusing `checkGrounding`).** A claim passes only if every named entity appears in a referenced evidence item, every number matches a value in referenced evidence (no rounding beyond display precision), and every `evidence_ref` exists. Entity matching is by Qloo entity id where available, else normalised exact name.
3. **Removal, not repair.** Failing claims are dropped from the card (never rewritten by another LLM call) and kept in a `removed_claims[]` audit list with the failure reason.
4. **UI.** Each card shows a badge "N verified · M removed"; tapping it opens the audit list. The Book prints the same counts per chapter.
5. **Tests.** A fabricated entity, an altered number, a dangling evidence ref, and a correct claim each produce the expected pass/remove outcome; a card with all claims removed shows evidence-only content plus an honest notice.

---

## 6. Architecture

```
Browser (React 19, mobile-first, Premiere Noir)
  │ /api/*  (no credentials in browser)
  ▼
tour-dashboard — Express BFF (existing; + /api/qloo/* proxy)
  │ identity token                         │ identity token
  ▼                                        ▼
tour_data_api — Flask (existing)          qloo_gateway ★ NEW — Node 22 container, Cloud Run min-instances=1
  ├ BigQuery (campaigns, briefs…)           ├ one long-lived `qloo mcp` child (stdio, @modelcontextprotocol/sdk client)
  ├ Parallel (live web)                     ├ Tour Strategist agent (Gemini via Vertex, tool-calling over allowlisted Qloo tools)
  ├ Gemini / Lyria / image                  ├ scoring module (pure, tested)
  └ new /qloo_* routes → gateway ───────────┤ SSE stream of tool calls + provenance
                                            ├ cache: BigQuery `qloo_cache`
5 Dialogflow CX Playbooks (existing)        └ QLOO_API_KEY from Secret Manager
delight_card_renderer (existing; Book gains new chapters)
agent_mcp_server (existing; + taste tools, + public demo endpoint)
```

### 6.1 Units
| Unit | Responsibility | Interface | Depends on |
|---|---|---|---|
| `qloo_gateway/mcpClient` ★ | Own the `qloo mcp` process; restart on exit; health via `qloo_capabilities` | `callTool(name, args) → Envelope` | harness |
| `qloo_gateway/validate` ★ | Allowlist + argument validation per tool (limits in §4) | `validate(name, args) → ok \| ValidationError` | — |
| `qloo_gateway/cache` ★ | Request-hash cache, insert-only, TTL 7 d (trends 1 d) | `get(key)`, `put(key, envelope)` | BigQuery |
| `qloo_gateway/budget` ★ | Per-session (60 calls) and global daily ceilings | `reserve(sessionId, n)` | — |
| `qloo_gateway/scoring` ★ | §5 formulas | pure functions | — |
| `qloo_gateway/pipeline` ★ | Discover/Decide/Activate steps as code | `runTourBoard(brief)`, `runCityPlaybook(artist, city)` → async event stream | mcpClient, cache, budget, scoring |
| `qloo_gateway/strategist` ★ | Gemini tool-calling chat over allowlisted Qloo tools + pipeline functions | `chat(sessionId, messages)` → SSE | pipeline, Vertex |
| `qloo_gateway/http` ★ | REST + SSE endpoints (§6.2) | HTTP | all above |
| `tour_data_api` /qloo_* routes | Forward Stage-2 evidence requests; pass results through `checkGrounding` | HTTP | gateway |
| BFF `/api/qloo/*` | Proxy with identity token (existing pattern) | HTTP | gateway |
| Dashboard | Tour Board, City Playbook, Why-sheet, strategist, Book | React | BFF |
| `agent_mcp_server` | External MCP surface (§8) | MCP streamable-http | gateway, tour_data_api |
| `WebMcpTools.tsx` | Browser-agent surface (§8) | `document.modelContext.registerTool` | dashboard state |

### 6.2 Gateway HTTP contract (initial)
- `POST /v1/tour-board` `{artist, regions[], capacityTier, maxStops, dateWindow}` → SSE events: `resolve`, `needs_input`, `tool_call`, `tool_result`, `city_scored`, `done`, `error`.
- `POST /v1/resolve` `{choiceId}` → resumes after `needs_input`.
- `GET /v1/city-playbook?artist=&city=` → SSE (same event types) ending in a `playbook` payload.
- `POST /v1/strategist` `{sessionId, messages[]}` → SSE.
- `POST /v1/tools/:name` (internal only; allowlisted) → Envelope.
- `GET /healthz` → capabilities + process state.

All payloads carry `provenance` (Qloo requests), `status`, and `warnings`.

### 6.3 Decisions
- New private repo `prats-2311/tour-intelligence-qloo` (history preserved from `google_promotions`); **made public with MIT licence before submission**.
- New BigQuery dataset `tour_intelligence_qloo` seeded from the same seed files; new Cloud Run service names; the original Google submission's services, data and URLs are untouched.
- Node for the gateway (harness + MCP SDK are Node). Gemini (Vertex) for the strategist (already provisioned).
- Only the gateway holds the Qloo key.
- The root `CLAUDE.md` (Google-hackathon era) is rewritten for this hackathon as the first plan task. Its rule "don't re-propose the Next.js/Node stack" is superseded **for the gateway only**: the Qloo harness and `qloo mcp` are Node-only. All other services keep their existing stacks.

---

## 7. Product experience — mobile-first, responsive

Design order: 375 px → tablet → desktop. Desktop is an expansion of the phone layout, and must be excellent (judges likely use laptops).

### 7.1 Judge path (≤ 2 min, no login)
Landing → **Try the showcase tour** (pre-cached) → Tour Board → tap a **Hidden goldmine** city → City Playbook → **Build tour** → Tour & Activation Book. "Ask the strategist" available throughout.

### 7.2 Screens
| Screen | Phone | Desktop |
|---|---|---|
| Landing | Full-screen hero, one-line pitch, two large CTAs (showcase / plan your own) | Hero + animated heat preview |
| **Tour Board** ★ | Dark map top (~45 %) + draggable bottom sheet of city cards: two bars (Fan heat, Activation), verdict chip (Play · Hidden goldmine · De-risk · Consider · Skip); top chip "Agent · N Qloo calls" opens the agent log sheet; segmented toggle **Winnability / Density-only / Without Qloo** | Map left, list right, agent log side panel; comparison side-by-side |
| **City Playbook** ★ | Sticky tabs (Activate · Culture · Delight · Talent); swipeable cards: Sponsors → Merch → Promo zones → Local moment → Venue fit → Co-billing → This week | Card grid |
| Why this score? | Bottom sheet: formula + weights, component values, Qloo inputs, raw requests, limitations | Side drawer |
| Ask the strategist | FAB → full-screen chat; tool calls as chips; voice input (existing) | Docked panel |
| Tour & Activation Book | Vertical reader + chapter index sheet; Share (Web Share API), Download PDF, Download .ics | Existing print layout |
| Proof (`/proof`) | Headline hit rates (ours vs LLM-only vs city-popularity), per-case cards with source links, "where we lost" section, limitations | Table view |
| Navigation | Bottom tab bar: Discover · Tours · Strategist; Proof linked from Landing and the Tour Board header | Top bar |

### 7.3 UI rules (acceptance criteria)
- Touch targets ≥ 44 px; primary actions in thumb zone; no horizontal scroll at 360 px.
- Showcase content visible ≤ 2.5 s on a mid-range phone over 4G (cache, skeletons, lazy map).
- Map gestures don't fight scroll (dedicated map area; two-finger pan inside sheets).
- `needs_input` always shows a picker; nothing is silently guessed. Thin data shows an honest empty state.
- Premiere Noir system per `dashboard/CLAUDE.md` (warm dark only, Fraunces/JetBrains Mono/Inter, validated city palette, reduced motion).
- Map: MapLibre GL + CARTO dark basemap (no token).

---

## 8. Agent surfaces — one tool contract, three entry points

| Surface | Audience | Tools |
|---|---|---|
| `agent_mcp_server` public demo endpoint `/mcp` (streamable-http, stateless) | Any external MCP client (Claude, ChatGPT connectors, Cursor) | Read-only taste tools below; IP rate-limited; cached + budget-guarded |
| `agent_mcp_server` private endpoint | Trusted callers (IAM) | All tools incl. existing writes |
| WebMCP page tools | Browser agents operating the app | Taste tools + UI-driving tools |
| Internal | Tour Strategist + 5 Playbooks | Same contract |

**Taste tools (new):** `find_tour_markets(artist, regions[], max_stops)` → cities with fan heat, activation, winnability, verdicts, provenance; `get_city_playbook(artist, city)`; `suggest_support_acts(artist, city)`; `rank_venues(artist, city, venues[≤10])`; `get_local_moment(artist, city)`. Existing read tools unchanged.

**WebMCP UI-driving tools (new):** `open_city`, `set_comparison_mode`, `build_tour_from_shortlist`, `open_tour_book`. Existing write tools keep their confirmation behaviour.

Raw Qloo tools are never exposed publicly (key-sharing and quota rules in the Qloo kit). README documents one-line connection (`claude mcp add --transport http tour-intel <url>/mcp`) and custom-connector setup.

---

## 9. Errors, caching, quota, security

### 9.1 Envelope handling
| Status | UI | Code |
|---|---|---|
| `ok` | Results | Cache; attach provenance |
| `needs_input` | Picker | Pause until choice |
| `empty` | "Qloo has no signal for this market"; greyed city | Component → unavailable |
| `partial` / `degraded` | Amber "partial data" badge + Qloo summary | Store warning with score |
| `error` retryable | Brief spinner | ≤ 2 retries, backoff, only if `retryable` |
| `error` non-retryable | "Live Qloo data unavailable — showing cached results from <date>" | Cache fallback; **never** LLM-invented numbers |

### 9.2 Caching & quota
- `qloo_cache` (BigQuery), key = hash(tool, normalised args); insert-only, latest wins; TTL 7 d (trends 1 d).
- Showcase artist + 3 control artists pre-warmed before submission.
- Budget: 60 Qloo calls/session, global daily ceiling; exceeded → "Try the showcase".
- City activation computed progressively for top 8 cities; city playbooks lazy-loaded and cached.

### 9.3 Security & data handling
- `QLOO_API_KEY` only in Secret Manager → gateway env; never in repo, browser, logs, or prompts.
- Gateway is IAM-private (callers: BFF, tour_data_api, agent_mcp_server) via resource-level `run.invoker`.
- Only artist, city, venue and brand names go to Qloo — no personal data (Qloo SAFE_USE).
- Chat text passes existing prompt-injection allowlists before becoming tool arguments; strategist restricted to allowlisted tools with validated args.
- No political, health, credit, housing, employment or insurance uses.

---

## 10. Testing

| Area | Tests |
|---|---|
| Scoring | Every branch; verdict rule table; weight renormalisation; `insufficient_data` paths; provenance preserved; no-LLM guarantee |
| Gateway | Validation limits; allowlist; each of the 6 statuses; retry policy; cache hit/miss/TTL; budget; MCP process restart |
| Pipeline | Event sequence for tour-board and playbook with mocked `callTool`; partial-data propagation |
| Strategist | Allowlisted tools only; `needs_input` pause; SSE shape; Gemini mocked |
| tour_data_api /qloo_* | Forwarding; `checkGrounding`; injection allowlists |
| MCP / WebMCP | Tools as plain functions; schema checks; one live E2E against the deployed demo endpoint |
| Claim verification (§5.6) | Fabricated entity, altered number, dangling ref, valid claim; all-removed card fallback; audit list contents |
| Backtest (§3 ⑤) | Hit/category-hit logic on fixtures; baselines use identical cases and cut-off; results JSON schema; `/proof` renders from JSON with no live calls |
| UI | vitest for logic (geo conversion, score formatting, state); **Playwright judge path at 375 px and 1280 px**; no horizontal scroll at 360 px |

`./run_tests.sh` (existing 413 + new) must be green for every merge. `graft check` runs inside it.

---

## 11. Delivery process

- **Superpowers workflow:** `brainstorming` (this spec) → `writing-plans` → `using-git-worktrees` → `subagent-driven-development` with **Sonnet** subagents (one task each; spec-compliance review then code-quality review) → `dispatching-parallel-agents` for independent tasks → `test-driven-development` on every task (red seen, then green, then refactor) → `systematic-debugging` for failures → `requesting-code-review` / `receiving-code-review` → `verification-before-completion` → `finishing-a-development-branch`.
- **Graft:** `graft build` after setup; subagents locate code with `graft_find_code`/`graft ask`, read APIs with `graft_file_api`/`graft skeleton`, check blast radius with `graft_trace_calls` before edits; `graft check` in `run_tests.sh`.
- **UI tasks:** subagents read `frontend-design`, `ui-ux-pro-max` and `taste-skill` (from `~/.claude/plugins/cache/…` until enabled) plus `dashboard/CLAUDE.md`; design at 375 px first; deliver Playwright screenshots at 375/1280 for review.

### 11.1 Milestones
| Dates | Milestone |
|---|---|
| Oct 16–17 | Repo + dataset; spec approved; plan written; **data spike when key arrives**; tune §5 |
| Oct 18–20 | `qloo_gateway`: MCP client, validation, cache, budget, scoring, pipeline skeleton; deployed |
| Oct 20–23 | Tour Board (Discover + Decide), agent log, Why-sheet, comparison toggle; showcase pre-warm |
| Oct 21–24 (parallel track) | Backtest case gathering via Parallel + **human review by Prateek** (target 12–20, minimum 8) |
| Oct 23–25 | City Playbook (Activate) with grounding-verified claims; Stage-2 Playbooks get Qloo evidence; Book chapters + .ics |
| Oct 25–27 | Strategist chat; MCP taste tools + public demo endpoint; WebMCP tools; **run backtest, build `/proof`** |
| Oct 27–29 | Polish, performance, Playwright judge path, README (request→result walkthrough, limitations, architecture), Devpost write-up, existing-project answer; repo → public |
| Oct 30 | Final deploy, real-device smoke test, submit |

**Cut order if behind:** merch localisation → Density-only/Without-Qloo toggle → WebMCP UI-driving tools → co-billing. **Never cut:** Tour Board with winnability, City Playbook (sponsors, promo zones, local moment, venue fit) with grounding-verified claims, provenance, Book, MCP demo endpoint, backtest with at least 8 cases.

---

## 12. Open questions and risks

| # | Item | Resolution path |
|---|---|---|
| 1 | Qloo data coverage outside the US (heatmaps, brand/place recs per city, mid-tier artists) | Data spike as soon as the key arrives; adjust showcase regions and component weights |
| 2 | Comparability of `where_popular` affinity across separate region calls | Spike: compare one broad `within` vs per-region calls; choose normalisation; document |
| 3 | `qloo mcp` (stdio) on Cloud Run container with min-instances=1 — kit says serverless functions unsupported | Validate in gateway task; ask on Qloo Discord; fallback: Compute Engine VM |
| 4 | "City mainstream proxy" for talent-brief `compare_audiences` | Spike: use top city-level artists from `recommend(filter_location=city)` without artist signal |
| 5 | Judges perceive project as recycled | Qloo drives the hero flow; clear upgrade narrative; new Tour Board and Playbook |
| 6 | `routed` keeps improving | Don't compete on routing; win on winnability + activation + breadth + polish |
| 7 | Quota during judging | Cache, pre-warm, budget guards, cached fallback |
| 8 | Too few well-documented past activations for the backtest | Start gathering Oct 21 in parallel; widen to 2021–2026 and to film press tours if needed; floor of 8 cases; report sample size prominently |
| 9 | Backtest results unfavourable | Publish anyway with analysis (honesty is a differentiator); never tune the method on the test cases |

---

## 13. Submission checklist
- Live demo URL (dashboard), public repo with detected MIT licence, text description.
- "When did you begin": 2026-07-30 (original); upgrade field explains the Qloo work started 2026-10-16.
- README: problem, Qloo tools and why, request→result walkthrough with entity/tag choices, setup from clean env, limitations, provenance, data handling.
- MCP demo endpoint documented; showcase pre-warmed; no credentials in repo or screenshots.
