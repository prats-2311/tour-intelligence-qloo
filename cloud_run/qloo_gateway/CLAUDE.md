# qloo_gateway — conventions
The only service that talks to Qloo. Holds one `qloo mcp` child process (stdio) via `@modelcontextprotocol/sdk`, passing `env: process.env` so `QLOO_API_KEY` reaches it.
- Pure modules (`validate`, `scoring/*`, `geo/*`, `claims/*`, `extract`) have no I/O; test them directly.
- I/O modules take injected dependencies (`McpLike`, `FirestoreLike`, `now()`, `sleep()`); tests pass fakes. Never hit Qloo or GCP from unit tests.
- Cache: L1 in-memory LRU + L2 Firestore `qloo_cache`, TTL on `expireAt`.
- Every Qloo call goes through `resilientCall` (validate → cache → budget → mcp → retry → stale fallback).
- Imports use `.js` suffixes (NodeNext ESM).
- Deploy: container (Dockerfile) to Cloud Run, us-central1, `qloo-gateway-sa`, `--no-allow-unauthenticated`, `--min-instances=1`. `QLOO_API_KEY` from Secret Manager secret `qloo-api-key`.

## Build & deploy
- Local image check (from worktree root): `docker build -t qloo-gateway cloud_run/qloo_gateway && docker run --rm qloo-gateway qloo --version`
- The hackathon server (`https://hackathon.api.qloo.com`) is used through `QLOO_BASE_URL` and `QLOO_TRUSTED_BASE_URL` (both set by `deploy.sh`, overridable via `QLOO_BASE_URL` in the environment); for local runs set both to the same URL before starting. The gateway logs the active base URL (never a key) at startup.
- `scripts/deploy.sh` is run by Prateek (not by agents) after creating the `qloo-api-key` secret: `printf '%s' "$QLOO_API_KEY" | gcloud secrets create qloo-api-key --data-file=- --project liifecalling-academy`

## Deployed
- URL `https://qloo-gateway-602700957663.us-central1.run.app`, first revision `qloo-gateway-00001-h4g`.
- Health is `GET /health` (also `/healthz` for local use). Cloud Run reserves paths ending in `z`, so `/healthz` returns Google's 404 on the deployed service.
- Verify (Prateek): `curl -H "Authorization: Bearer $(gcloud auth print-identity-token)" <url>/health` returns 200; the same call without the header returns 403.

## Narrative
One Gemini call per playbook via Vertex REST (ADC token from `google-auth-library`). Claims are verified by `claims/verify.ts`; unverified ones are returned as `removed` with a reason. Besides the declared `entities[]`/`numbers[]`, the displayed `text` is checked: every numeric token (decimals, `%`, thousands separators) must be supported by a declared number, and every declared entity name must appear in the text. Undeclared proper nouns in the text remain uncheckable. Results are cached 7 d under tool `gemini_narrative`. Ceilings: 20 per session (in memory) and `GEMINI_DAILY_CEILING` (default 300) per day, persisted in Firestore doc `gemini_usage/<YYYY-MM>` (with `QLOO_USAGE_BACKEND=firestore`) so restarts and extra instances share it. Budget is reserved per actual Vertex attempt; only a failed Vertex call (non-2xx, network, timeout) falls back to `GEMINI_FALLBACK_MODEL`, never malformed JSON or a schema error. Any failure yields an `unavailable` narrative and never fails the playbook. Models: `GEMINI_MODEL` / `GEMINI_FALLBACK_MODEL`.

## Web (Tavily)
"This week in the city" (`GET /v1/this-week`) uses Tavily `search` only: `search_depth: "basic"`, `max_results` 5, never research/crawl/extract. Hard caps of 25 calls/day and 600/month are checked before every call and persisted in Firestore doc `tavily_usage/<YYYY-MM>` (`QLOO_USAGE_BACKEND=firestore`), so restarts and extra instances cannot exceed them; over cap the route answers `unavailable` (`capped`), never a paid fallback. Every call logs its running count. Results are cached 7 d under tool `tavily_this_week`. `TAVILY_API_KEY` comes from Secret Manager secret `tavily-api-key` (optional; absent means `unavailable`/`no_key`). Summaries are verified by `web/verifyWeb.ts`: items need at least one entity found in the cited source, and numbers in the item text must appear in the cited title/content. All tests use fakes; one manual smoke test only, run by Prateek.

## Strategist
`POST /v1/strategist` (`{ messages, context }` + `x-session-id`) streams SSE from `strategist/run.ts`: a bounded Gemini tool-calling loop. Limits: 4 model rounds and 6 tool calls per turn, then one forced text-only answer (`stoppedEarly: true`). Every Gemini attempt reserves the narrative ceiling (`reserveAttempt`: 20/session + daily). Inputs are re-validated by `strategist/safety.ts` (12 messages, 1,000 chars, 20 context cities); the board context goes to Gemini as data. Tools (`strategist/tools.ts`): the nine allowlisted `qloo_*` insight tools plus `get_city_playbook`, all through `QlooCaller`; unsafe or unknown calls come back as `rejected` and never reach Qloo. Events: `strategist_thinking`, `strategist_tool_call`, `strategist_tool_result` (status incl. `needs_input`, `rejected`), `strategist_message` (`unsupportedNumbers` = numbers in the answer found in no tool result or board score, using the `verifyClaims` matcher via `tokenSupported`), `strategist_error` (`CAPPED`, `UNAVAILABLE`, `ABORTED`, `INTERNAL`), then `done`. An empty model turn is `UNAVAILABLE`, never a blank answer. Without `generate` the route streams `UNAVAILABLE`.

## Without-Qloo
`POST /v1/without-qloo` (`{ artist, regions, cities }` + `x-session-id`) asks Gemini to rank the scored cities with no taste data (`withoutQloo.ts`). Accepted only if the answer is a permutation of the input after `normaliseName`; otherwise `unavailable`/`invalid`. Reserves the narrative ceiling per attempt; only `ok` results are cached (tool `without_qloo`).
