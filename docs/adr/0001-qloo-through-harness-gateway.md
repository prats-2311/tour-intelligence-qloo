# 1. Qloo through the harness gateway

Date: 2026-10-16. Status: accepted.

## Context
The hackathon asks for Qloo's agent harness (`@qloo/qloo-harness`, run as `qloo mcp`), which is Node-only and
speaks MCP over stdio. The rest of this project is Python (Cloud Run services) plus a React dashboard. Qloo
rescales scores per response, silently ignores unknown parameters, and has an unpublished quota, so raw calls
from many places would be hard to validate, cache or budget.

## Decision
Exactly one service, `cloud_run/qloo_gateway` (Node, Cloud Run, IAM-private), talks to Qloo. It holds a single
`qloo mcp` child process and exposes an allowlist of ten harness tools. Every call passes through one path:
validate, cache (in-memory plus Firestore, TTL 45 days), budget, MCP call, retry, stale fallback. Only the
gateway holds `QLOO_API_KEY` (Secret Manager). The dashboard server, `tour_data_api`, the strategist and the
public MCP server call the gateway, never Qloo. The old "no Node stack" rule is superseded for this service only.

## Consequences
- One place to enforce parameter validation, the call budget and the data policy; unit tests use a fake MCP and
  never touch Qloo or GCP.
- The cache lets a judged demo survive an exhausted quota; stale answers are labelled as such.
- An extra hop and a second runtime (Node) to deploy and keep warm (`--min-instances=1`).
- We depend on the harness's tool schemas; a harness upgrade can change them and is pinned (`^0.1.26`).
- The harness can only send fuzzy location names, not coordinates, which is why every city is checked against
  its own heat points (see `docs/qloo/api-notes.md`).
