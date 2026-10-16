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
- `scripts/deploy.sh` is run by Prateek (not by agents) after creating the `qloo-api-key` secret: `printf '%s' "$QLOO_API_KEY" | gcloud secrets create qloo-api-key --data-file=- --project liifecalling-academy`

## Narrative
One Gemini call per playbook via Vertex REST (ADC token from `google-auth-library`). Claims are verified by `claims/verify.ts`; unverified ones are returned as `removed` with a reason. Results are cached 7 d under tool `gemini_narrative`. Ceilings: 20 per session and `GEMINI_DAILY_CEILING` (default 300) per day. Any failure yields an `unavailable` narrative and never fails the playbook. Models: `GEMINI_MODEL` / `GEMINI_FALLBACK_MODEL`.
