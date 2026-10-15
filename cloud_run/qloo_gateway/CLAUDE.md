# qloo_gateway — conventions
The only service that talks to Qloo. Holds one `qloo mcp` child process (stdio) via `@modelcontextprotocol/sdk`, passing `env: process.env` so `QLOO_API_KEY` reaches it.
- Pure modules (`validate`, `scoring/*`, `geo/*`, `claims/*`, `extract`) have no I/O; test them directly.
- I/O modules take injected dependencies (`McpLike`, `FirestoreLike`, `now()`, `sleep()`); tests pass fakes. Never hit Qloo or GCP from unit tests.
- Cache: L1 in-memory LRU + L2 Firestore `qloo_cache`, TTL on `expireAt`.
- Every Qloo call goes through `resilientCall` (validate → cache → budget → mcp → retry → stale fallback).
- Imports use `.js` suffixes (NodeNext ESM).
- Deploy: container (Dockerfile) to Cloud Run, us-central1, `qloo-gateway-sa`, `--no-allow-unauthenticated`, `--min-instances=1`. `QLOO_API_KEY` from Secret Manager secret `qloo-api-key`.
