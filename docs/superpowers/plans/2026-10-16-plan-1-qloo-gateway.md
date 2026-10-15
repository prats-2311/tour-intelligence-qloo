# Plan 1 — qloo_gateway Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy `qloo_gateway`, the only service that talks to Qloo: it validates, budgets, caches and executes Qloo harness tool calls, turns heatmaps into markets, computes deterministic winnability scores, verifies LLM claims against evidence, and streams the Tour Board and City Playbook pipelines over HTTP/SSE.

**Architecture:** A Node 22 + TypeScript service (`cloud_run/qloo_gateway`) holding one long-lived `qloo mcp` child process via the official MCP SDK. Pure modules (validate, scoring, geo, claims) are unit-tested in isolation; I/O modules (mcpClient, cache, budget) are tested with injected fakes; the pipeline composes them as async generators of typed events; an Express app exposes them as SSE. Deployed as a container on Cloud Run with `min-instances=1`.

**Tech Stack:** Node 22.19+, TypeScript 5, Express 5, `@modelcontextprotocol/sdk` 1.30.1, `@qloo/qloo-harness` ≥ 0.1.26 (global in container), `@google-cloud/bigquery`, vitest, supertest.

**Spec:** `docs/superpowers/specs/2026-10-16-tour-intelligence-qloo-design.md` (read §3–§6, §9, §10 before starting any task).

**Plan series:** Plan 1 (this) → Plan 2 Tour Board UI → Plan 3 City Playbook, Stage-2 agents, Book, claims narrative → Plan 4 Strategist, MCP, WebMCP → Plan 5 Backtest & `/proof` → Plan 6 polish & submission. Each later plan is written after its predecessor lands, using real fixtures.

## Global Constraints

- Node ≥ 22.19.0; `@qloo/qloo-harness` ≥ 0.1.26; MCP SDK `@modelcontextprotocol/sdk` pinned `1.30.1`.
- Qloo tool allowlist (exact names): `qloo_capabilities, qloo_describe, qloo_where_popular, qloo_audience_demographics, qloo_entity_tags, qloo_trends, qloo_recommend, qloo_rank, qloo_compare_audiences, qloo_find_tags`.
- Limits: `rank.options` ≤ 10; `compare_audiences` groups ≤ 10 each; `trends.entities` 1–5; entity/tag input arrays ≤ 10; `limit` 1–20; dates `YYYY-MM-DD`.
- Insights types: `artist, book, brand, movie, person, place, podcast, tv_show, videogame`. Search types add `locality, actor, album, author, director`.
- Retries: at most 2, only when `error.retryable === true`.
- Cache TTL: 7 days; `qloo_trends` 1 day. Insert-only, latest row wins.
- Budget: 60 Qloo calls per session; global daily ceiling from env `QLOO_DAILY_CEILING` (default 2000). Cache hits never consume budget.
- Scoring constants (initial): fan heat `0.7·affinity + 0.3·popularity`; activation weights `sponsor_fit 0.30, local_hooks 0.25, fan_concentration 0.25, venue_fit 0.20`; activation needs ≥ 2 components; winnability `0.5·fan + 0.5·activation`; verdicts per spec §5.3.
- Missing inputs ⇒ `insufficient_data`; no scoring path calls an LLM.
- `QLOO_API_KEY` only from env (Secret Manager in prod); never logged, never in responses.
- Only artist/city/venue/brand names are sent to Qloo — no personal data.
- Cloud Run region `us-central1`, project `liifecalling-academy`, dedicated SA `qloo-gateway-sa`, `--no-allow-unauthenticated`.
- Tests: every task ends with `./run_tests.sh` green.

## Review Focus

1. **Ambiguous or accented artist names** ("Bad Bunny" fine; "Pedro" ambiguous; "Beyoncé" vs "Beyonce") — must surface `needs_input` with candidates, never pick silently. Test owned by Task 9.
2. **A region with zero heatmap points / an unknown region string** — board completes with that region marked empty; no crash, no fabricated cities. Test owned by Task 9.
3. **Client disconnects mid-stream** — pipeline stops issuing new Qloo calls within one step. Test owned by Task 11.
4. **Two identical requests at once** (judges clicking the showcase together) — one Qloo call, both get the result (in-flight de-duplication); budget charged once. Test owned by Task 5.
5. **`qloo mcp` child dies mid-session** — next call reconnects transparently; a call in flight returns a retryable error and is retried within the ≤ 2 limit. Test owned by Task 2.

---

## File Structure

```
cloud_run/qloo_gateway/
  package.json, tsconfig.json, vitest.config.ts, Dockerfile, .dockerignore
  CLAUDE.md                         service conventions
  scripts/build-cities.mjs          GeoNames → data/cities5000.json.gz (run once, output committed)
  data/cities5000.json.gz
  src/
    types.ts                        Envelope, EvidenceRef, Score, Verdict, events
    validate.ts                     allowlist + argument validation
    mcpClient.ts                    qloo mcp process wrapper
    cache.ts                        Cache interface, MemoryCache, BigQueryCache, cacheKey()
    budget.ts                       BudgetGuard
    qlooCall.ts                     resilientCall(): validate→cache→budget→mcp→retry→fallback, in-flight dedupe
    geo/geohash.ts                  geohash decode
    geo/cities.ts                   load cities, nearestCity()
    geo/heat.ts                     heat points → markets; in-city zones
    scoring/fanHeat.ts
    scoring/activation.ts           components + activation score
    scoring/winnability.ts          winnability + verdict + coBillLift
    claims/verify.ts                grounding verification of atomic claims
    extract.ts                      envelope → typed results (entities, heat points, issues)
    pipeline/tourBoard.ts           runTourBoard() async generator
    pipeline/cityPlaybook.ts        runCityPlaybook() async generator
    http/app.ts                     Express app, SSE helpers
    server.ts                       entrypoint
  test/                             mirrors src/, plus fixtures/
run_tests.sh                        + gateway vitest + graft check
CLAUDE.md                           rewritten for Qloo hackathon
```

---

### Task 1: Repo re-orientation, gateway scaffold, types, validation

**Files:**
- Modify: `CLAUDE.md` (rewrite), `run_tests.sh`
- Create: `cloud_run/qloo_gateway/{package.json,tsconfig.json,vitest.config.ts,CLAUDE.md}`, `src/types.ts`, `src/validate.ts`, `test/validate.test.ts`

**Interfaces:**
- Produces: `QlooEnvelope`, `QlooStatus`, `EvidenceRef`, `Score`, `Verdict`, `GatewayEvent` (types.ts); `TOOL_ALLOWLIST: readonly ToolName[]`, `type ToolName`, `validateToolCall(name: string, args: unknown): { ok: true; name: ToolName; args: Record<string, unknown> } | { ok: false; error: string }`.

- [ ] **Step 1: Rewrite root `CLAUDE.md`**

Replace the file with:

```markdown
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

## Nested guides
Existing per-directory `CLAUDE.md` files remain authoritative for their services; `cloud_run/qloo_gateway/CLAUDE.md` covers the gateway.

## Tests
`./run_tests.sh` runs pytest, dashboard vitest, gateway vitest, and `graft check`. Must be green before every commit.
```

- [ ] **Step 2: Scaffold the package**

`cloud_run/qloo_gateway/package.json`:

```json
{
  "name": "qloo-gateway",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.19.0" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@google-cloud/bigquery": "^8.1.0",
    "@modelcontextprotocol/sdk": "1.30.1",
    "express": "^5.2.1"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.10.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.1.0",
    "typescript": "^5.7.0",
    "vitest": "^3.2.0"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["test/**/*.test.ts"], environment: "node" } });
```

`cloud_run/qloo_gateway/CLAUDE.md`:

```markdown
# qloo_gateway — conventions
The only service that talks to Qloo. Holds one `qloo mcp` child process (stdio) via `@modelcontextprotocol/sdk`, passing `env: process.env` so `QLOO_API_KEY` reaches it.
- Pure modules (`validate`, `scoring/*`, `geo/*`, `claims/*`, `extract`) have no I/O; test them directly.
- I/O modules take injected dependencies (`McpLike`, `BigQueryLike`, `now()`, `sleep()`); tests pass fakes. Never hit Qloo or GCP from unit tests.
- Every Qloo call goes through `resilientCall` (validate → cache → budget → mcp → retry → stale fallback).
- Imports use `.js` suffixes (NodeNext ESM).
- Deploy: container (Dockerfile) to Cloud Run, us-central1, `qloo-gateway-sa`, `--no-allow-unauthenticated`, `--min-instances=1`. `QLOO_API_KEY` from Secret Manager secret `qloo-api-key`.
```

Run: `cd cloud_run/qloo_gateway && npm install`
Expected: installs without errors; `package-lock.json` created.

- [ ] **Step 3: Write `src/types.ts`**

```ts
export type QlooStatus = "ok" | "empty" | "needs_input" | "partial" | "degraded" | "error";

export interface QlooRequestPreview { method: "GET"; path: string; query: unknown }

export interface QlooEnvelope {
  schema_version?: string;
  operation: string;
  status: QlooStatus;
  summary?: string;
  interpretation?: unknown;
  results?: unknown;
  result_count?: number;
  warnings?: string[];
  issues?: unknown[];
  error?: { code: string; layer?: string; retryable: boolean; recovery: string };
  provenance?: { source: string; endpoint: string; documentation: string; requests?: QlooRequestPreview[] };
  [extra: string]: unknown;
}

export interface EvidenceRef { tool: string; cacheKey: string; resultIndex?: number }

export type Score =
  | { value: number; refs: EvidenceRef[] }
  | { value: null; reason: "insufficient_data"; refs: EvidenceRef[] };

export type Verdict = "play" | "hidden_goldmine" | "de_risk" | "consider" | "skip" | "insufficient_data";

export type GatewayEvent =
  | { type: "resolve"; entity: { entityId: string; name: string } }
  | { type: "artist_profile"; demographics: unknown[]; tags: Array<{ name: string; affinity: number }>; trends: unknown; refs: EvidenceRef[] }
  | { type: "needs_input"; field: string; candidates: Array<{ id: string; name: string; type?: string }>; summary: string }
  | { type: "tool_call"; tool: string; args: Record<string, unknown>; cached: boolean }
  | { type: "tool_result"; tool: string; status: QlooStatus; resultCount: number; cacheKey: string; stale: boolean }
  | { type: "region_empty"; region: string }
  | { type: "city_scored"; city: unknown }
  | { type: "playbook"; playbook: unknown }
  | { type: "done"; summary: unknown }
  | { type: "error"; code: string; message: string };
```

- [ ] **Step 4: Write the failing validation tests** — `test/validate.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { TOOL_ALLOWLIST, validateToolCall } from "../src/validate.js";

describe("validateToolCall", () => {
  it("rejects tools outside the allowlist", () => {
    expect(validateToolCall("qloo_api", {})).toEqual({ ok: false, error: "tool not allowlisted: qloo_api" });
  });
  it("allowlist has exactly the 10 harness tools", () => {
    expect([...TOOL_ALLOWLIST].sort()).toEqual([
      "qloo_audience_demographics", "qloo_capabilities", "qloo_compare_audiences", "qloo_describe",
      "qloo_entity_tags", "qloo_find_tags", "qloo_rank", "qloo_recommend", "qloo_trends", "qloo_where_popular",
    ]);
  });
  it("accepts a valid describe call", () => {
    expect(validateToolCall("qloo_describe", { entity: "Bad Bunny", type: "artist" }).ok).toBe(true);
  });
  it("rejects unknown args (Qloo silently ignores them)", () => {
    const r = validateToolCall("qloo_describe", { entity: "x", bogus: 1 });
    expect(r).toEqual({ ok: false, error: "qloo_describe: unknown argument bogus" });
  });
  it("rejects rank with more than 10 options", () => {
    const options = Array.from({ length: 11 }, (_, i) => `Venue ${i}`);
    const r = validateToolCall("qloo_rank", { options, option_type: "place", signals: ["Bad Bunny"] });
    expect(r).toEqual({ ok: false, error: "qloo_rank: options must have 1-10 items" });
  });
  it("rejects trends with 6 entities and bad dates", () => {
    const six = ["a", "b", "c", "d", "e", "f"];
    expect(validateToolCall("qloo_trends", { entities: six, entity_type: "artist", start_date: "2026-01-01", end_date: "2026-02-01" }))
      .toEqual({ ok: false, error: "qloo_trends: entities must have 1-5 items" });
    expect(validateToolCall("qloo_trends", { entities: ["a"], entity_type: "artist", start_date: "2026-1-1", end_date: "2026-02-01" }))
      .toEqual({ ok: false, error: "qloo_trends: start_date must be YYYY-MM-DD" });
  });
  it("rejects limit outside 1-20 and bad insights type", () => {
    expect(validateToolCall("qloo_recommend", { target_type: "artist", signals: ["x"], limit: 21 }))
      .toEqual({ ok: false, error: "qloo_recommend: limit must be an integer 1-20" });
    expect(validateToolCall("qloo_recommend", { target_type: "event", signals: ["x"] }))
      .toEqual({ ok: false, error: "qloo_recommend: target_type must be one of artist, book, brand, movie, person, place, podcast, tv_show, videogame" });
  });
  it("requires within for where_popular and exactly two groups for compare", () => {
    expect(validateToolCall("qloo_where_popular", { entity: "x" })).toEqual({ ok: false, error: "qloo_where_popular: within is required" });
    expect(validateToolCall("qloo_compare_audiences", { group_a: ["x"] })).toEqual({ ok: false, error: "qloo_compare_audiences: group_b is required" });
  });
});
```

- [ ] **Step 5: Run to verify failure**

Run: `cd cloud_run/qloo_gateway && npx vitest run test/validate.test.ts`
Expected: FAIL — cannot find module `../src/validate.js`.

- [ ] **Step 6: Implement `src/validate.ts`**

```ts
export const INSIGHTS_TYPES = ["artist", "book", "brand", "movie", "person", "place", "podcast", "tv_show", "videogame"] as const;
export const SEARCH_TYPES = [...INSIGHTS_TYPES, "locality", "actor", "album", "author", "director"] as const;

export const TOOL_ALLOWLIST = [
  "qloo_capabilities", "qloo_describe", "qloo_where_popular", "qloo_audience_demographics", "qloo_entity_tags",
  "qloo_trends", "qloo_recommend", "qloo_rank", "qloo_compare_audiences", "qloo_find_tags",
] as const;
export type ToolName = (typeof TOOL_ALLOWLIST)[number];

type Rule =
  | { kind: "string"; required?: boolean }
  | { kind: "bool" }
  | { kind: "limit" }
  | { kind: "date"; required?: boolean }
  | { kind: "enum"; values: readonly string[]; required?: boolean }
  | { kind: "strings"; min: number; max: number; required?: boolean };

const ENTITY_LIST: Rule = { kind: "strings", min: 1, max: 10 };
const OP: Rule = { kind: "enum", values: ["union", "intersection"] };

const RULES: Record<ToolName, Record<string, Rule>> = {
  qloo_capabilities: { operation_ids: { kind: "strings", min: 0, max: 20 } },
  qloo_describe: { entity: { kind: "string", required: true }, type: { kind: "enum", values: SEARCH_TYPES } },
  qloo_where_popular: {
    entity: { kind: "string", required: true }, entity_type: { kind: "enum", values: SEARCH_TYPES },
    within: { kind: "string", required: true }, limit: { kind: "limit" },
  },
  qloo_audience_demographics: { entity: { kind: "string", required: true }, entity_type: { kind: "enum", values: SEARCH_TYPES }, limit: { kind: "limit" } },
  qloo_entity_tags: { entities: { ...ENTITY_LIST, required: true }, entity_type: { kind: "enum", values: SEARCH_TYPES }, limit: { kind: "limit" } },
  qloo_trends: {
    entities: { kind: "strings", min: 1, max: 5, required: true }, entity_type: { kind: "enum", values: INSIGHTS_TYPES, required: true },
    start_date: { kind: "date", required: true }, end_date: { kind: "date", required: true }, limit: { kind: "limit" },
  },
  qloo_recommend: {
    target_type: { kind: "enum", values: INSIGHTS_TYPES, required: true }, signals: ENTITY_LIST, signal_tags: ENTITY_LIST,
    signal_tags_operator: OP, signal_location: { kind: "string" }, demographic: { kind: "string" }, filter_location: { kind: "string" },
    include_tags: ENTITY_LIST, include_tags_operator: OP, exclude_tags: ENTITY_LIST, exclude_tags_operator: OP,
    explain: { kind: "bool" }, limit: { kind: "limit" },
  },
  qloo_rank: {
    options: { kind: "strings", min: 1, max: 10, required: true }, option_type: { kind: "enum", values: INSIGHTS_TYPES, required: true },
    signals: ENTITY_LIST, signal_location: { kind: "string" }, demographic: { kind: "string" }, include_tags: ENTITY_LIST, exclude_tags: ENTITY_LIST,
  },
  qloo_compare_audiences: {
    group_a: { ...ENTITY_LIST, required: true }, group_b: { ...ENTITY_LIST, required: true },
    target_type: { kind: "enum", values: INSIGHTS_TYPES }, limit: { kind: "limit" },
  },
  qloo_find_tags: { query: { kind: "string", required: true }, semantic: { kind: "bool" }, limit: { kind: "limit" } },
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function checkRule(tool: string, key: string, rule: Rule, value: unknown): string | null {
  switch (rule.kind) {
    case "string":
      return typeof value === "string" && value.trim().length > 0 ? null : `${tool}: ${key} must be a non-empty string`;
    case "bool":
      return typeof value === "boolean" ? null : `${tool}: ${key} must be a boolean`;
    case "limit":
      return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 20 ? null : `${tool}: limit must be an integer 1-20`;
    case "date":
      return typeof value === "string" && DATE.test(value) ? null : `${tool}: ${key} must be YYYY-MM-DD`;
    case "enum":
      return typeof value === "string" && rule.values.includes(value) ? null : `${tool}: ${key} must be one of ${rule.values.join(", ")}`;
    case "strings":
      if (!Array.isArray(value) || value.length < rule.min || value.length > rule.max) return `${tool}: ${key} must have ${rule.min}-${rule.max} items`;
      return value.every((v) => typeof v === "string" && v.trim().length > 0) ? null : `${tool}: ${key} items must be non-empty strings`;
  }
}

export function validateToolCall(name: string, args: unknown):
  | { ok: true; name: ToolName; args: Record<string, unknown> }
  | { ok: false; error: string } {
  if (!(TOOL_ALLOWLIST as readonly string[]).includes(name)) return { ok: false, error: `tool not allowlisted: ${name}` };
  const tool = name as ToolName;
  if (typeof args !== "object" || args === null || Array.isArray(args)) return { ok: false, error: `${tool}: arguments must be an object` };
  const record = args as Record<string, unknown>;
  const rules = RULES[tool];
  for (const key of Object.keys(record)) if (!(key in rules)) return { ok: false, error: `${tool}: unknown argument ${key}` };
  for (const [key, rule] of Object.entries(rules)) {
    const value = record[key];
    if (value === undefined) {
      if ("required" in rule && rule.required) return { ok: false, error: `${tool}: ${key} is required` };
      continue;
    }
    const problem = checkRule(tool, key, rule, value);
    if (problem) return { ok: false, error: problem };
  }
  return { ok: true, name: tool, args: record };
}
```

- [ ] **Step 7: Run tests to verify pass**

Run: `cd cloud_run/qloo_gateway && npx vitest run test/validate.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 8: Wire into `run_tests.sh`**

Append to `run_tests.sh`:

```bash

echo ""
echo "=== qloo_gateway test suite (vitest) ==="
(cd cloud_run/qloo_gateway && npm test)

echo ""
echo "=== graft freshness ==="
graft check
```

Run: `graft build && ./run_tests.sh`
Expected: all suites PASS; `graft check` exits 0.

- [ ] **Step 9: Commit**

```bash
git add CLAUDE.md run_tests.sh cloud_run/qloo_gateway graft
git commit -m "feat(gateway): scaffold qloo_gateway with tool allowlist and argument validation"
```

---

### Task 2: MCP client wrapper

**Files:**
- Create: `src/mcpClient.ts`, `test/mcpClient.test.ts`

**Interfaces:**
- Consumes: `QlooEnvelope` (Task 1).
- Produces:
  - `interface McpLike { connect(): Promise<void>; callTool(req: { name: string; arguments: Record<string, unknown> }): Promise<{ structuredContent?: unknown }>; close(): Promise<void>; onclose?: () => void }`
  - `class QlooMcpClient { constructor(opts: { factory: () => McpLike; maxReconnects?: number }); callTool(name: string, args: Record<string, unknown>): Promise<QlooEnvelope>; health(): Promise<{ connected: boolean; ready: boolean }>; close(): Promise<void> }`
  - `defaultFactory(): McpLike` (real stdio transport)

- [ ] **Step 1: Write failing tests** — `test/mcpClient.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { QlooMcpClient, type McpLike } from "../src/mcpClient.js";

function fake(behaviour: (name: string) => unknown, log: string[] = []): McpLike {
  const client: McpLike = {
    async connect() { log.push("connect"); },
    async callTool({ name }) { return { structuredContent: behaviour(name) }; },
    async close() { log.push("close"); },
  };
  return client;
}

describe("QlooMcpClient", () => {
  it("connects lazily once and returns the structured envelope", async () => {
    const log: string[] = [];
    const c = new QlooMcpClient({ factory: () => fake(() => ({ operation: "describe", status: "ok", results: [] }), log) });
    const a = await c.callTool("qloo_describe", { entity: "x" });
    await c.callTool("qloo_describe", { entity: "y" });
    expect(a.status).toBe("ok");
    expect(log.filter((l) => l === "connect")).toHaveLength(1);
  });

  it("wraps a missing status as an UNKNOWN error envelope", async () => {
    const c = new QlooMcpClient({ factory: () => fake(() => ({ summary: "?" })) });
    const env = await c.callTool("qloo_describe", { entity: "x" });
    expect(env.status).toBe("error");
    expect(env.error?.code).toBe("UNKNOWN");
  });

  it("reconnects after the child process closes (Review Focus 5)", async () => {
    let created = 0;
    let current: McpLike | undefined;
    const c = new QlooMcpClient({
      factory: () => {
        created += 1;
        current = fake(() => ({ operation: "describe", status: "ok" }));
        return current;
      },
    });
    await c.callTool("qloo_describe", { entity: "x" });
    current?.onclose?.();
    await c.callTool("qloo_describe", { entity: "y" });
    expect(created).toBe(2);
  });

  it("turns a transport failure mid-call into a retryable error envelope", async () => {
    const c = new QlooMcpClient({
      factory: () => ({
        async connect() {}, async close() {},
        async callTool() { throw new Error("EPIPE"); },
      }),
    });
    const env = await c.callTool("qloo_describe", { entity: "x" });
    expect(env).toMatchObject({ status: "error", error: { code: "TRANSPORT", retryable: true } });
  });

  it("gives up after maxReconnects failed connects", async () => {
    const c = new QlooMcpClient({
      maxReconnects: 2,
      factory: () => ({ async connect() { throw new Error("ENOENT"); }, async close() {}, async callTool() { return {}; } }),
    });
    const env = await c.callTool("qloo_describe", { entity: "x" });
    expect(env).toMatchObject({ status: "error", error: { code: "UNAVAILABLE", retryable: false } });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/mcpClient.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/mcpClient.ts`**

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { QlooEnvelope } from "./types.js";

export interface McpLike {
  connect(): Promise<void>;
  callTool(req: { name: string; arguments: Record<string, unknown> }): Promise<{ structuredContent?: unknown }>;
  close(): Promise<void>;
  onclose?: () => void;
}

export function defaultFactory(): McpLike {
  const client = new Client({ name: "qloo-gateway", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: process.env.QLOO_BIN ?? "qloo",
    args: ["mcp"],
    env: process.env as Record<string, string>,
  });
  const wrapper: McpLike = {
    async connect() {
      transport.onclose = () => wrapper.onclose?.();
      await client.connect(transport);
    },
    async callTool(req) {
      return (await client.callTool(req)) as { structuredContent?: unknown };
    },
    async close() { await client.close(); },
  };
  return wrapper;
}

function errorEnvelope(operation: string, code: string, retryable: boolean, recovery: string): QlooEnvelope {
  return { operation, status: "error", summary: recovery, results: [], result_count: 0, error: { code, retryable, recovery } };
}

export class QlooMcpClient {
  private client: McpLike | undefined;
  private readonly factory: () => McpLike;
  private readonly maxReconnects: number;

  constructor(opts: { factory: () => McpLike; maxReconnects?: number }) {
    this.factory = opts.factory;
    this.maxReconnects = opts.maxReconnects ?? 3;
  }

  private async ensure(): Promise<McpLike | undefined> {
    if (this.client) return this.client;
    for (let attempt = 0; attempt < this.maxReconnects; attempt += 1) {
      const candidate = this.factory();
      try {
        candidate.onclose = () => { if (this.client === candidate) this.client = undefined; };
        await candidate.connect();
        this.client = candidate;
        return candidate;
      } catch {
        await candidate.close().catch(() => undefined);
      }
    }
    return undefined;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<QlooEnvelope> {
    const operation = name.replace(/^qloo_/, "");
    const client = await this.ensure();
    if (!client) return errorEnvelope(operation, "UNAVAILABLE", false, "Cannot start qloo mcp. Check the harness install and QLOO_API_KEY.");
    try {
      const result = await client.callTool({ name, arguments: args });
      const raw = (result.structuredContent ?? {}) as Partial<QlooEnvelope>;
      if (raw.status === undefined) {
        return { ...raw, operation, status: "error", error: { code: "UNKNOWN", retryable: false, recovery: "Malformed Qloo result", ...(raw.error ?? {}) } } as QlooEnvelope;
      }
      return raw as QlooEnvelope;
    } catch (err) {
      this.client = undefined;
      await client.close().catch(() => undefined);
      return errorEnvelope(operation, "TRANSPORT", true, `qloo mcp transport failed: ${(err as Error).message}`);
    }
  }

  async health(): Promise<{ connected: boolean; ready: boolean }> {
    const env = await this.callTool("qloo_capabilities", {});
    const ready = Boolean((env as { adapter?: { ready?: boolean } }).adapter?.ready ?? env.status !== "error");
    return { connected: this.client !== undefined, ready };
  }

  async close(): Promise<void> {
    await this.client?.close();
    this.client = undefined;
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run test/mcpClient.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add cloud_run/qloo_gateway/src/mcpClient.ts cloud_run/qloo_gateway/test/mcpClient.test.ts
git commit -m "feat(gateway): qloo mcp client with lazy connect, reconnect and transport errors"
```

---

### Task 3: Cache (key, memory, BigQuery)

**Files:**
- Create: `src/cache.ts`, `test/cache.test.ts`, `bigquery/qloo_cache.sql`

**Interfaces:**
- Consumes: `QlooEnvelope`, `ToolName`.
- Produces:
  - `cacheKey(tool: string, args: Record<string, unknown>): string` (sha256 hex of normalised JSON)
  - `ttlMs(tool: string): number`
  - `interface Cache { get(key: string, opts?: { allowStale?: boolean }): Promise<{ envelope: QlooEnvelope; createdAt: number; stale: boolean } | null>; put(key: string, tool: string, envelope: QlooEnvelope): Promise<void> }`
  - `class MemoryCache implements Cache { constructor(now?: () => number) }`
  - `interface BigQueryLike { query(opts: { query: string; params: Record<string, unknown> }): Promise<[Array<Record<string, unknown>>]>; dataset(id: string): { table(id: string): { insert(rows: object[]): Promise<unknown> } } }`
  - `class BigQueryCache implements Cache { constructor(opts: { bq: BigQueryLike; dataset: string; table?: string; now?: () => number }) }`

- [ ] **Step 1: Write failing tests** — `test/cache.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { BigQueryCache, MemoryCache, cacheKey, ttlMs } from "../src/cache.js";

const env = { operation: "describe", status: "ok" as const, results: [] };
const DAY = 86_400_000;

describe("cacheKey", () => {
  it("is stable across key order, case and whitespace in strings", () => {
    expect(cacheKey("qloo_describe", { entity: "Bad Bunny ", type: "artist" }))
      .toBe(cacheKey("qloo_describe", { type: "artist", entity: "bad bunny" }));
  });
  it("differs by tool and by array order", () => {
    expect(cacheKey("qloo_describe", { entity: "x" })).not.toBe(cacheKey("qloo_entity_tags", { entity: "x" }));
    expect(cacheKey("qloo_rank", { options: ["a", "b"] })).not.toBe(cacheKey("qloo_rank", { options: ["b", "a"] }));
  });
});

describe("ttlMs", () => {
  it("is 1 day for trends, 7 days otherwise", () => {
    expect(ttlMs("qloo_trends")).toBe(DAY);
    expect(ttlMs("qloo_recommend")).toBe(7 * DAY);
  });
});

describe("MemoryCache", () => {
  it("returns fresh entries and hides expired ones unless allowStale", async () => {
    let t = 0;
    const c = new MemoryCache(() => t);
    await c.put("k", "qloo_trends", env);
    expect((await c.get("k"))?.stale).toBe(false);
    t = DAY + 1;
    expect(await c.get("k")).toBeNull();
    expect((await c.get("k", { allowStale: true }))?.stale).toBe(true);
  });
  it("latest put wins", async () => {
    const c = new MemoryCache(() => 0);
    await c.put("k", "qloo_describe", env);
    await c.put("k", "qloo_describe", { ...env, summary: "new" });
    expect((await c.get("k"))?.envelope.summary).toBe("new");
  });
});

describe("BigQueryCache", () => {
  it("inserts rows and reads the latest row back", async () => {
    const rows: Array<Record<string, unknown>> = [];
    const bq = {
      async query({ params }: { query: string; params: Record<string, unknown> }) {
        const match = rows.filter((r) => r.cache_key === params.key).sort((a, b) => Number(b.created_at_ms) - Number(a.created_at_ms));
        return [match.slice(0, 1)] as [Array<Record<string, unknown>>];
      },
      dataset() { return { table() { return { async insert(r: object[]) { rows.push(...(r as Array<Record<string, unknown>>)); } }; } }; },
    };
    const c = new BigQueryCache({ bq, dataset: "tour_intelligence_qloo", now: () => 1000 });
    await c.put("k", "qloo_describe", env);
    const hit = await c.get("k");
    expect(hit?.envelope).toEqual(env);
    expect(rows[0]).toMatchObject({ cache_key: "k", tool: "qloo_describe", created_at_ms: 1000 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/cache.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/cache.ts`**

```ts
import { createHash } from "node:crypto";
import type { QlooEnvelope } from "./types.js";

const DAY = 86_400_000;

function normalise(value: unknown): unknown {
  if (typeof value === "string") return value.trim().toLowerCase().replace(/\s+/g, " ");
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value as object).sort().map((k) => [k, normalise((value as Record<string, unknown>)[k])]));
  }
  return value;
}

export function cacheKey(tool: string, args: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify({ tool, args: normalise(args) })).digest("hex");
}

export function ttlMs(tool: string): number {
  return tool === "qloo_trends" ? DAY : 7 * DAY;
}

export type CacheHit = { envelope: QlooEnvelope; createdAt: number; stale: boolean };

export interface Cache {
  get(key: string, opts?: { allowStale?: boolean }): Promise<CacheHit | null>;
  put(key: string, tool: string, envelope: QlooEnvelope): Promise<void>;
}

export class MemoryCache implements Cache {
  private readonly store = new Map<string, { tool: string; envelope: QlooEnvelope; createdAt: number }>();
  constructor(private readonly now: () => number = Date.now) {}

  async get(key: string, opts: { allowStale?: boolean } = {}): Promise<CacheHit | null> {
    const row = this.store.get(key);
    if (!row) return null;
    const stale = this.now() - row.createdAt > ttlMs(row.tool);
    if (stale && !opts.allowStale) return null;
    return { envelope: row.envelope, createdAt: row.createdAt, stale };
  }

  async put(key: string, tool: string, envelope: QlooEnvelope): Promise<void> {
    this.store.set(key, { tool, envelope, createdAt: this.now() });
  }
}

export interface BigQueryLike {
  query(opts: { query: string; params: Record<string, unknown> }): Promise<[Array<Record<string, unknown>>]>;
  dataset(id: string): { table(id: string): { insert(rows: object[]): Promise<unknown> } };
}

export class BigQueryCache implements Cache {
  private readonly bq: BigQueryLike;
  private readonly dataset: string;
  private readonly table: string;
  private readonly now: () => number;

  constructor(opts: { bq: BigQueryLike; dataset: string; table?: string; now?: () => number }) {
    this.bq = opts.bq;
    this.dataset = opts.dataset;
    this.table = opts.table ?? "qloo_cache";
    this.now = opts.now ?? Date.now;
  }

  async get(key: string, opts: { allowStale?: boolean } = {}): Promise<CacheHit | null> {
    const [rows] = await this.bq.query({
      query: `SELECT tool, envelope, created_at_ms FROM \`${this.dataset}.${this.table}\` WHERE cache_key = @key ORDER BY created_at_ms DESC LIMIT 1`,
      params: { key },
    });
    const row = rows[0];
    if (!row) return null;
    const createdAt = Number(row.created_at_ms);
    const stale = this.now() - createdAt > ttlMs(String(row.tool));
    if (stale && !opts.allowStale) return null;
    const envelope = typeof row.envelope === "string" ? (JSON.parse(row.envelope) as QlooEnvelope) : (row.envelope as QlooEnvelope);
    return { envelope, createdAt, stale };
  }

  async put(key: string, tool: string, envelope: QlooEnvelope): Promise<void> {
    await this.bq.dataset(this.dataset).table(this.table).insert([
      { cache_key: key, tool, envelope: JSON.stringify(envelope), created_at_ms: this.now() },
    ]);
  }
}
```

`bigquery/qloo_cache.sql`:

```sql
CREATE TABLE IF NOT EXISTS `liifecalling-academy.tour_intelligence_qloo.qloo_cache` (
  cache_key STRING NOT NULL,
  tool STRING NOT NULL,
  envelope STRING NOT NULL,
  created_at_ms INT64 NOT NULL
)
CLUSTER BY cache_key;
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run test/cache.test.ts`
Expected: PASS (6 tests). Note: the fake returns `created_at_ms` as stored; the comparison in `get` uses `Number(...)` so INT64-as-string from real BigQuery also works.

- [ ] **Step 5: Commit**

```bash
git add cloud_run/qloo_gateway/src/cache.ts cloud_run/qloo_gateway/test/cache.test.ts bigquery/qloo_cache.sql
git commit -m "feat(gateway): request-hash cache with memory and BigQuery backends"
```

---

### Task 4: Budget guard

**Files:**
- Create: `src/budget.ts`, `test/budget.test.ts`

**Interfaces:**
- Produces: `class BudgetExceededError extends Error { scope: "session" | "daily" }`; `class BudgetGuard { constructor(opts: { perSession: number; perDay: number; now?: () => number }); reserve(sessionId: string): void; remaining(sessionId: string): { session: number; daily: number } }`

- [ ] **Step 1: Write failing tests** — `test/budget.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { BudgetExceededError, BudgetGuard } from "../src/budget.js";

describe("BudgetGuard", () => {
  it("allows up to perSession calls per session", () => {
    const b = new BudgetGuard({ perSession: 2, perDay: 100, now: () => 0 });
    b.reserve("s1"); b.reserve("s1");
    expect(() => b.reserve("s1")).toThrow(BudgetExceededError);
    expect(() => b.reserve("s2")).not.toThrow();
  });
  it("enforces the daily ceiling across sessions and resets the next UTC day", () => {
    let t = Date.UTC(2026, 9, 20, 23, 59);
    const b = new BudgetGuard({ perSession: 10, perDay: 2, now: () => t });
    b.reserve("a"); b.reserve("b");
    try { b.reserve("c"); } catch (e) { expect((e as BudgetExceededError).scope).toBe("daily"); }
    t = Date.UTC(2026, 9, 21, 0, 1);
    expect(() => b.reserve("c")).not.toThrow();
  });
  it("reports remaining", () => {
    const b = new BudgetGuard({ perSession: 5, perDay: 9, now: () => 0 });
    b.reserve("s");
    expect(b.remaining("s")).toEqual({ session: 4, daily: 8 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/budget.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/budget.ts`**

```ts
export class BudgetExceededError extends Error {
  constructor(public readonly scope: "session" | "daily") {
    super(scope === "session" ? "Session Qloo budget exhausted" : "Daily Qloo budget exhausted");
  }
}

export class BudgetGuard {
  private readonly sessions = new Map<string, number>();
  private day = "";
  private dayCount = 0;
  private readonly perSession: number;
  private readonly perDay: number;
  private readonly now: () => number;

  constructor(opts: { perSession: number; perDay: number; now?: () => number }) {
    this.perSession = opts.perSession;
    this.perDay = opts.perDay;
    this.now = opts.now ?? Date.now;
  }

  private rollDay(): void {
    const today = new Date(this.now()).toISOString().slice(0, 10);
    if (today !== this.day) { this.day = today; this.dayCount = 0; }
  }

  reserve(sessionId: string): void {
    this.rollDay();
    const used = this.sessions.get(sessionId) ?? 0;
    if (used >= this.perSession) throw new BudgetExceededError("session");
    if (this.dayCount >= this.perDay) throw new BudgetExceededError("daily");
    this.sessions.set(sessionId, used + 1);
    this.dayCount += 1;
  }

  remaining(sessionId: string): { session: number; daily: number } {
    this.rollDay();
    return { session: this.perSession - (this.sessions.get(sessionId) ?? 0), daily: this.perDay - this.dayCount };
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run test/budget.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add cloud_run/qloo_gateway/src/budget.ts cloud_run/qloo_gateway/test/budget.test.ts
git commit -m "feat(gateway): per-session and daily Qloo budget guard"
```

---

### Task 5: resilientCall — validate, cache, budget, retry, stale fallback, in-flight dedupe

**Files:**
- Create: `src/qlooCall.ts`, `test/qlooCall.test.ts`

**Interfaces:**
- Consumes: `validateToolCall` (T1), `QlooMcpClient`-compatible `{ callTool(name, args): Promise<QlooEnvelope> }` (T2), `Cache`, `cacheKey` (T3), `BudgetGuard`, `BudgetExceededError` (T4).
- Produces:
  - `interface CallResult { envelope: QlooEnvelope; cacheKey: string; cached: boolean; stale: boolean }`
  - `interface QlooCaller { call(tool: string, args: Record<string, unknown>, sessionId: string): Promise<CallResult> }`
  - `createQlooCaller(deps: { mcp: { callTool(name: string, args: Record<string, unknown>): Promise<QlooEnvelope> }; cache: Cache; budget: BudgetGuard; sleep?: (ms: number) => Promise<void> }): QlooCaller`

- [ ] **Step 1: Write failing tests** — `test/qlooCall.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { BudgetGuard } from "../src/budget.js";
import { MemoryCache } from "../src/cache.js";
import { createQlooCaller } from "../src/qlooCall.js";
import type { QlooEnvelope } from "../src/types.js";

const ok: QlooEnvelope = { operation: "describe", status: "ok", results: [{ name: "x" }], result_count: 1 };
const retryable: QlooEnvelope = { operation: "describe", status: "error", error: { code: "RATE", retryable: true, recovery: "wait" } };
const fatal: QlooEnvelope = { operation: "describe", status: "error", error: { code: "QLOO_AUTH", retryable: false, recovery: "key" } };

function setup(responses: QlooEnvelope[], perSession = 60) {
  const calls: string[] = [];
  const mcp = { async callTool(name: string) { calls.push(name); return responses.shift() ?? ok; } };
  const cache = new MemoryCache(() => 0);
  const caller = createQlooCaller({ mcp, cache, budget: new BudgetGuard({ perSession, perDay: 1000, now: () => 0 }), sleep: async () => {} });
  return { caller, calls, cache };
}

describe("resilientCall", () => {
  it("rejects invalid calls without touching Qloo", async () => {
    const { caller, calls } = setup([]);
    await expect(caller.call("qloo_api", {}, "s")).rejects.toThrow("tool not allowlisted");
    expect(calls).toHaveLength(0);
  });
  it("caches ok results; second call is a free cache hit", async () => {
    const { caller, calls } = setup([ok]);
    const a = await caller.call("qloo_describe", { entity: "x" }, "s");
    const b = await caller.call("qloo_describe", { entity: "X " }, "s");
    expect([a.cached, b.cached]).toEqual([false, true]);
    expect(calls).toHaveLength(1);
  });
  it("retries retryable errors at most twice", async () => {
    const { caller, calls } = setup([retryable, retryable, retryable]);
    const r = await caller.call("qloo_describe", { entity: "x" }, "s");
    expect(calls).toHaveLength(3);
    expect(r.envelope.status).toBe("error");
  });
  it("succeeds after one retry", async () => {
    const { caller, calls } = setup([retryable, ok]);
    const r = await caller.call("qloo_describe", { entity: "x" }, "s");
    expect(calls).toHaveLength(2);
    expect(r.envelope.status).toBe("ok");
  });
  it("does not retry non-retryable errors and returns the error when nothing is cached", async () => {
    const { caller, calls } = setup([fatal]);
    const r = await caller.call("qloo_describe", { entity: "y" }, "s");
    expect(calls).toHaveLength(1);
    expect(r.envelope).toMatchObject({ status: "error", error: { code: "QLOO_AUTH" } });
  });
  it("never caches needs_input or error envelopes", async () => {
    const needs: QlooEnvelope = { operation: "describe", status: "needs_input", issues: [] };
    const { caller, calls } = setup([needs, needs]);
    await caller.call("qloo_describe", { entity: "x" }, "s");
    await caller.call("qloo_describe", { entity: "x" }, "s");
    expect(calls).toHaveLength(2);
  });
  it("de-duplicates identical in-flight calls and charges budget once (Review Focus 4)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const calls: string[] = [];
    const mcp = { async callTool(name: string) { calls.push(name); await gate; return ok; } };
    const budget = new BudgetGuard({ perSession: 60, perDay: 1000, now: () => 0 });
    const caller = createQlooCaller({ mcp, cache: new MemoryCache(() => 0), budget, sleep: async () => {} });
    const p1 = caller.call("qloo_describe", { entity: "x" }, "s");
    const p2 = caller.call("qloo_describe", { entity: "x" }, "s2");
    release();
    const [a, b] = await Promise.all([p1, p2]);
    expect(calls).toHaveLength(1);
    expect(a.envelope).toEqual(b.envelope);
    expect(budget.remaining("s2").session).toBe(60);
  });
  it("surfaces budget exhaustion as a BUDGET error envelope (not a throw)", async () => {
    const { caller } = setup([ok, ok], 1);
    await caller.call("qloo_describe", { entity: "a" }, "s");
    const r = await caller.call("qloo_describe", { entity: "b" }, "s");
    expect(r.envelope).toMatchObject({ status: "error", error: { code: "BUDGET", retryable: false } });
  });
});
```

Add a dedicated stale-fallback test with a controllable clock:

```ts
it("returns stale cache on non-retryable error", async () => {
  let t = 0;
  const cache = new MemoryCache(() => t);
  const { cacheKey } = await import("../src/cache.js");
  await cache.put(cacheKey("qloo_describe", { entity: "x" }), "qloo_describe", ok);
  t = 8 * 86_400_000;
  const mcp = { async callTool() { return fatal; } };
  const caller = createQlooCaller({ mcp, cache, budget: new BudgetGuard({ perSession: 9, perDay: 9, now: () => t }), sleep: async () => {} });
  const r = await caller.call("qloo_describe", { entity: "x" }, "s");
  expect(r).toMatchObject({ cached: true, stale: true });
  expect(r.envelope.status).toBe("ok");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/qlooCall.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/qlooCall.ts`**

```ts
import { BudgetExceededError, type BudgetGuard } from "./budget.js";
import { cacheKey, type Cache } from "./cache.js";
import type { QlooEnvelope } from "./types.js";
import { validateToolCall } from "./validate.js";

export interface CallResult { envelope: QlooEnvelope; cacheKey: string; cached: boolean; stale: boolean }
export interface QlooCaller { call(tool: string, args: Record<string, unknown>, sessionId: string): Promise<CallResult> }

const CACHEABLE = new Set(["ok", "empty", "partial", "degraded"]);
const MAX_RETRIES = 2;

export function createQlooCaller(deps: {
  mcp: { callTool(name: string, args: Record<string, unknown>): Promise<QlooEnvelope> };
  cache: Cache;
  budget: BudgetGuard;
  sleep?: (ms: number) => Promise<void>;
}): QlooCaller {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const inflight = new Map<string, Promise<CallResult>>();

  async function execute(tool: string, args: Record<string, unknown>, key: string, sessionId: string): Promise<CallResult> {
    const hit = await deps.cache.get(key);
    if (hit) return { envelope: hit.envelope, cacheKey: key, cached: true, stale: false };

    try {
      deps.budget.reserve(sessionId);
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        const recovery = err.scope === "session" ? "Session limit reached — try the showcase tour." : "Daily limit reached — try the showcase tour.";
        return { envelope: { operation: tool.replace(/^qloo_/, ""), status: "error", summary: recovery, error: { code: "BUDGET", retryable: false, recovery } }, cacheKey: key, cached: false, stale: false };
      }
      throw err;
    }

    let envelope = await deps.mcp.callTool(tool, args);
    for (let attempt = 0; attempt < MAX_RETRIES && envelope.status === "error" && envelope.error?.retryable; attempt += 1) {
      await sleep(250 * 2 ** attempt);
      envelope = await deps.mcp.callTool(tool, args);
    }

    if (CACHEABLE.has(envelope.status)) {
      await deps.cache.put(key, tool, envelope);
      return { envelope, cacheKey: key, cached: false, stale: false };
    }
    if (envelope.status === "error") {
      const stale = await deps.cache.get(key, { allowStale: true });
      if (stale) return { envelope: stale.envelope, cacheKey: key, cached: true, stale: true };
    }
    return { envelope, cacheKey: key, cached: false, stale: false };
  }

  return {
    async call(tool, args, sessionId) {
      const valid = validateToolCall(tool, args);
      if (!valid.ok) throw new Error(valid.error);
      const key = cacheKey(valid.name, valid.args);
      const existing = inflight.get(key);
      if (existing) return existing;
      const promise = execute(valid.name, valid.args, key, sessionId).finally(() => inflight.delete(key));
      inflight.set(key, promise);
      return promise;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run test/qlooCall.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add cloud_run/qloo_gateway/src/qlooCall.ts cloud_run/qloo_gateway/test/qlooCall.test.ts
git commit -m "feat(gateway): resilient Qloo call path with retries, stale fallback and in-flight dedupe"
```

---

### Task 6: Geo — geohash decode, nearest city, heat → markets and zones

**Files:**
- Create: `scripts/build-cities.mjs`, `data/cities5000.json.gz`, `src/geo/geohash.ts`, `src/geo/cities.ts`, `src/geo/heat.ts`, `test/geo.test.ts`

**Interfaces:**
- Produces:
  - `decodeGeohash(hash: string): { lat: number; lon: number }`
  - `interface City { id: string; name: string; country: string; lat: number; lon: number; population: number }`
  - `loadCities(path?: string): City[]` (memoised); `haversineKm(a: {lat:number;lon:number}, b: {lat:number;lon:number}): number`; `nearestCity(cities: City[], p: {lat:number;lon:number}, opts: { maxKm: number; minPopulation: number }): City | null`
  - `interface HeatPoint { lat: number; lon: number; affinity: number; popularity: number; index: number }`
  - `marketsFromHeat(points: HeatPoint[], cities: City[], opts?: { maxKm?: number; minPopulation?: number }): Array<{ city: City; affinity: number; popularity: number; pointIndexes: number[] }>` (one entry per city; affinity/popularity = max over its points)
  - `zonesFromHeat(points: HeatPoint[], cities: City[]): Array<{ label: string; lat: number; lon: number; affinity: number; share: number; index: number }>` (sorted by affinity desc; `share` = affinity / sum of affinities)

- [ ] **Step 1: Build the city dataset (run once, commit output)**

`scripts/build-cities.mjs`:

```js
// Downloads GeoNames cities5000 (CC BY 4.0) and writes a trimmed gzipped JSON.
// Usage: node scripts/build-cities.mjs
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";

mkdirSync("data", { recursive: true });
execSync("curl -sSL -o /tmp/cities5000.zip https://download.geonames.org/export/dump/cities5000.zip && unzip -o -q /tmp/cities5000.zip -d /tmp");
const rows = readFileSync("/tmp/cities5000.txt", "utf8").trim().split("\n").map((line) => {
  const f = line.split("\t");
  return [f[0], f[2], f[8], Number(f[4]), Number(f[5]), Number(f[14])]; // id, asciiname, country, lat, lon, population
});
writeFileSync("data/cities5000.json.gz", gzipSync(JSON.stringify(rows)));
console.log(`wrote ${rows.length} cities`);
```

Run: `cd cloud_run/qloo_gateway && node scripts/build-cities.mjs`
Expected: `wrote ~68000 cities`; file ≈ 1.5–2.5 MB. Add `data/README.md` with one line: "GeoNames cities5000, CC BY 4.0, https://www.geonames.org/ — attribution also in the app footer."

- [ ] **Step 2: Write failing tests** — `test/geo.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { decodeGeohash } from "../src/geo/geohash.js";
import { haversineKm, nearestCity, type City } from "../src/geo/cities.js";
import { marketsFromHeat, zonesFromHeat } from "../src/geo/heat.js";

const CITIES: City[] = [
  { id: "1", name: "Mexico City", country: "MX", lat: 19.4326, lon: -99.1332, population: 9_000_000 },
  { id: "2", name: "Monterrey", country: "MX", lat: 25.6866, lon: -100.3161, population: 1_100_000 },
  { id: "3", name: "Coyoacan", country: "MX", lat: 19.35, lon: -99.162, population: 600_000 },
  { id: "4", name: "Tiny Town", country: "MX", lat: 25.7, lon: -100.3, population: 6_000 },
];

describe("geohash", () => {
  it("decodes a known hash", () => {
    const p = decodeGeohash("9g3w81t7j");
    expect(p.lat).toBeCloseTo(19.4326, 2);
    expect(p.lon).toBeCloseTo(-99.1332, 2);
  });
});

describe("nearestCity", () => {
  it("picks the nearest city above the population floor within range", () => {
    expect(nearestCity(CITIES, { lat: 25.69, lon: -100.31 }, { maxKm: 50, minPopulation: 100_000 })?.name).toBe("Monterrey");
    expect(nearestCity(CITIES, { lat: 0, lon: 0 }, { maxKm: 50, minPopulation: 100_000 })).toBeNull();
  });
  it("haversine is sane", () => {
    expect(haversineKm(CITIES[0]!, CITIES[1]!)).toBeGreaterThan(700);
  });
});

describe("marketsFromHeat", () => {
  it("groups points by nearest major city taking max affinity/popularity", () => {
    const markets = marketsFromHeat([
      { lat: 19.43, lon: -99.13, affinity: 0.9, popularity: 0.5, index: 0 },
      { lat: 19.36, lon: -99.16, affinity: 0.7, popularity: 0.8, index: 1 },
      { lat: 25.68, lon: -100.31, affinity: 0.6, popularity: 0.4, index: 2 },
    ], CITIES, { minPopulation: 1_000_000 });
    expect(markets.map((m) => m.city.name)).toEqual(["Mexico City", "Monterrey"]);
    expect(markets[0]).toMatchObject({ affinity: 0.9, popularity: 0.8, pointIndexes: [0, 1] });
  });
  it("drops points with no city in range (no fabricated markets)", () => {
    expect(marketsFromHeat([{ lat: 0, lon: 0, affinity: 1, popularity: 1, index: 0 }], CITIES)).toEqual([]);
  });
});

describe("zonesFromHeat", () => {
  it("labels zones by nearest locality and computes share", () => {
    const zones = zonesFromHeat([
      { lat: 19.35, lon: -99.16, affinity: 0.6, popularity: 0.1, index: 0 },
      { lat: 19.43, lon: -99.13, affinity: 0.2, popularity: 0.1, index: 1 },
    ], CITIES);
    expect(zones[0]).toMatchObject({ label: "Coyoacan", share: 0.75 });
    expect(zones[1]?.label).toBe("Mexico City");
  });
  it("falls back to coordinates when no locality within 8 km", () => {
    expect(zonesFromHeat([{ lat: 10, lon: 10, affinity: 1, popularity: 0, index: 0 }], CITIES)[0]?.label).toBe("10.000, 10.000");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run test/geo.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement the three geo modules**

`src/geo/geohash.ts`:

```ts
const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function decodeGeohash(hash: string): { lat: number; lon: number } {
  let latLo = -90, latHi = 90, lonLo = -180, lonHi = 180, even = true;
  for (const ch of hash.toLowerCase()) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new Error(`invalid geohash character: ${ch}`);
    for (let bit = 4; bit >= 0; bit -= 1) {
      const on = (idx >> bit) & 1;
      if (even) { const mid = (lonLo + lonHi) / 2; if (on) lonLo = mid; else lonHi = mid; }
      else { const mid = (latLo + latHi) / 2; if (on) latLo = mid; else latHi = mid; }
      even = !even;
    }
  }
  return { lat: (latLo + latHi) / 2, lon: (lonLo + lonHi) / 2 };
}
```

`src/geo/cities.ts`:

```ts
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

export interface City { id: string; name: string; country: string; lat: number; lon: number; population: number }

let memo: City[] | undefined;
const DEFAULT_PATH = fileURLToPath(new URL("../../data/cities5000.json.gz", import.meta.url));

export function loadCities(path: string = DEFAULT_PATH): City[] {
  if (memo) return memo;
  const rows = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as Array<[string, string, string, number, number, number]>;
  memo = rows.map(([id, name, country, lat, lon, population]) => ({ id, name, country, lat, lon, population }));
  return memo;
}

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function nearestCity(cities: City[], p: { lat: number; lon: number }, opts: { maxKm: number; minPopulation: number }): City | null {
  let best: City | null = null;
  let bestKm = opts.maxKm;
  for (const c of cities) {
    if (c.population < opts.minPopulation) continue;
    if (Math.abs(c.lat - p.lat) > 1 || Math.abs(c.lon - p.lon) > 1.5) continue;
    const km = haversineKm(c, p);
    if (km <= bestKm) { best = c; bestKm = km; }
  }
  return best;
}
```

`src/geo/heat.ts`:

```ts
import { nearestCity, type City } from "./cities.js";

export interface HeatPoint { lat: number; lon: number; affinity: number; popularity: number; index: number }

export function marketsFromHeat(points: HeatPoint[], cities: City[], opts: { maxKm?: number; minPopulation?: number } = {}) {
  const byCity = new Map<string, { city: City; affinity: number; popularity: number; pointIndexes: number[] }>();
  for (const p of points) {
    const city = nearestCity(cities, p, { maxKm: opts.maxKm ?? 50, minPopulation: opts.minPopulation ?? 100_000 });
    if (!city) continue;
    const m = byCity.get(city.id) ?? { city, affinity: -Infinity, popularity: -Infinity, pointIndexes: [] };
    m.affinity = Math.max(m.affinity, p.affinity);
    m.popularity = Math.max(m.popularity, p.popularity);
    m.pointIndexes.push(p.index);
    byCity.set(city.id, m);
  }
  return [...byCity.values()].sort((a, b) => b.affinity - a.affinity);
}

export function zonesFromHeat(points: HeatPoint[], cities: City[]) {
  const total = points.reduce((sum, p) => sum + Math.max(0, p.affinity), 0);
  return [...points]
    .sort((a, b) => b.affinity - a.affinity)
    .map((p) => {
      const near = nearestCity(cities, p, { maxKm: 8, minPopulation: 0 });
      return {
        label: near ? near.name : `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}`,
        lat: p.lat, lon: p.lon, affinity: p.affinity, index: p.index,
        share: total > 0 ? Math.max(0, p.affinity) / total : 0,
      };
    });
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run test/geo.test.ts`
Expected: PASS (8 tests). Also run once: `node -e "import('./dist/geo/cities.js')"` is not needed; instead add to the test file a smoke test `expect(loadCities().length).toBeGreaterThan(50000)` and run again — PASS.

- [ ] **Step 6: Commit**

```bash
git add cloud_run/qloo_gateway/scripts cloud_run/qloo_gateway/data cloud_run/qloo_gateway/src/geo cloud_run/qloo_gateway/test/geo.test.ts
git commit -m "feat(gateway): geohash decoding and heatmap-to-market/zone mapping with GeoNames"
```

---

### Task 7: Scoring — fan heat, activation, winnability, verdict, co-bill lift

**Files:**
- Create: `src/scoring/fanHeat.ts`, `src/scoring/activation.ts`, `src/scoring/winnability.ts`, `test/scoring.test.ts`

**Interfaces:**
- Consumes: `Score`, `EvidenceRef`, `Verdict` (T1).
- Produces:
  - `fanHeat(markets: Array<{ id: string; affinity: number; popularity: number; refs: EvidenceRef[] }>): Map<string, Score>`
  - `type ComponentName = "sponsor_fit" | "local_hooks" | "fan_concentration" | "venue_fit"`
  - `DEFAULT_WEIGHTS: Record<ComponentName, number>`
  - `meanTopK(values: number[], k: number): number | null`
  - `fanConcentration(shares: number[]): number | null` (sum of top-3 shares)
  - `activation(components: Partial<Record<ComponentName, { value: number; refs: EvidenceRef[] }>>, weights?: Record<ComponentName, number>): Score & { components: Partial<Record<ComponentName, number>> }`
  - `winnability(fan: Score, act: Score): Score`
  - `verdict(fan: Score, act: Score, win: Score): Verdict`
  - `coBillLift(overlap: number, localAffinity: number): number`

- [ ] **Step 1: Write failing tests** — `test/scoring.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { fanHeat } from "../src/scoring/fanHeat.js";
import { DEFAULT_WEIGHTS, activation, fanConcentration, meanTopK } from "../src/scoring/activation.js";
import { coBillLift, verdict, winnability } from "../src/scoring/winnability.js";
import type { Score } from "../src/types.js";

const r = [{ tool: "qloo_where_popular", cacheKey: "k" }];
const s = (value: number): Score => ({ value, refs: r });
const none: Score = { value: null, reason: "insufficient_data", refs: [] };

describe("fanHeat", () => {
  it("min-max normalises within the set with 0.7/0.3 weights", () => {
    const m = fanHeat([
      { id: "a", affinity: 0.9, popularity: 0.2, refs: r },
      { id: "b", affinity: 0.5, popularity: 0.8, refs: r },
    ]);
    expect(m.get("a")?.value).toBeCloseTo(70, 5);
    expect(m.get("b")?.value).toBeCloseTo(30, 5);
  });
  it("uses raw 0-1 values (clamped) when there is one market or zero range", () => {
    const m = fanHeat([{ id: "a", affinity: 0.8, popularity: 0.5, refs: r }]);
    expect(m.get("a")?.value).toBeCloseTo(71, 5);
  });
  it("keeps evidence refs", () => {
    expect(fanHeat([{ id: "a", affinity: 1, popularity: 1, refs: r }]).get("a")?.refs).toEqual(r);
  });
});

describe("activation components", () => {
  it("meanTopK", () => {
    expect(meanTopK([0.9, 0.1, 0.5], 2)).toBeCloseTo(0.7);
    expect(meanTopK([], 5)).toBeNull();
  });
  it("fanConcentration sums top-3 shares", () => {
    expect(fanConcentration([0.5, 0.2, 0.1, 0.2])).toBeCloseTo(0.9);
    expect(fanConcentration([])).toBeNull();
  });
});

describe("activation", () => {
  it("weights sum to 1", () => {
    expect(Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
  it("renormalises weights over present components", () => {
    const a = activation({ sponsor_fit: { value: 1, refs: r }, venue_fit: { value: 0, refs: r } });
    expect(a.value).toBeCloseTo(60, 5); // 0.30/(0.30+0.20) * 100
  });
  it("needs at least two components", () => {
    expect(activation({ sponsor_fit: { value: 1, refs: r } })).toMatchObject({ value: null, reason: "insufficient_data" });
  });
});

describe("winnability & verdict", () => {
  it("averages fan heat and activation", () => {
    expect(winnability(s(80), s(60)).value).toBe(70);
    expect(winnability(none, s(60))).toMatchObject({ value: null });
  });
  it.each([
    [80, 70, "play"],
    [60, 80, "hidden_goldmine"],
    [75, 30, "de_risk"],
    [50, 70, "consider"],
    [30, 40, "skip"],
  ])("fan %d activation %d -> %s", (fan, act, expected) => {
    expect(verdict(s(fan), s(act), winnability(s(fan), s(act)))).toBe(expected);
  });
  it("insufficient data wins over everything", () => {
    expect(verdict(none, s(90), none)).toBe("insufficient_data");
  });
});

describe("coBillLift", () => {
  it("multiplies and clamps to 0-1", () => {
    expect(coBillLift(0.5, 0.8)).toBeCloseTo(0.4);
    expect(coBillLift(2, 2)).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/scoring.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement scoring modules**

`src/scoring/fanHeat.ts`:

```ts
import type { EvidenceRef, Score } from "../types.js";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function fanHeat(markets: Array<{ id: string; affinity: number; popularity: number; refs: EvidenceRef[] }>): Map<string, Score> {
  const out = new Map<string, Score>();
  const norm = (values: number[]) => {
    const min = Math.min(...values), max = Math.max(...values);
    return (x: number) => (values.length < 2 || max === min ? clamp01(x) : (x - min) / (max - min));
  };
  const na = norm(markets.map((m) => m.affinity));
  const np = norm(markets.map((m) => m.popularity));
  for (const m of markets) {
    if (!Number.isFinite(m.affinity) || !Number.isFinite(m.popularity)) {
      out.set(m.id, { value: null, reason: "insufficient_data", refs: m.refs });
      continue;
    }
    out.set(m.id, { value: 100 * (0.7 * na(m.affinity) + 0.3 * np(m.popularity)), refs: m.refs });
  }
  return out;
}
```

`src/scoring/activation.ts`:

```ts
import type { EvidenceRef, Score } from "../types.js";

export type ComponentName = "sponsor_fit" | "local_hooks" | "fan_concentration" | "venue_fit";
export const DEFAULT_WEIGHTS: Record<ComponentName, number> = { sponsor_fit: 0.3, local_hooks: 0.25, fan_concentration: 0.25, venue_fit: 0.2 };

export function meanTopK(values: number[], k: number): number | null {
  const finite = values.filter(Number.isFinite).sort((a, b) => b - a).slice(0, k);
  return finite.length === 0 ? null : finite.reduce((a, b) => a + b, 0) / finite.length;
}

export function fanConcentration(shares: number[]): number | null {
  if (shares.length === 0) return null;
  return [...shares].sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
}

export function activation(
  components: Partial<Record<ComponentName, { value: number; refs: EvidenceRef[] }>>,
  weights: Record<ComponentName, number> = DEFAULT_WEIGHTS,
): Score & { components: Partial<Record<ComponentName, number>> } {
  const present = (Object.keys(components) as ComponentName[]).filter((k) => Number.isFinite(components[k]?.value));
  const refs = present.flatMap((k) => components[k]!.refs);
  const values = Object.fromEntries(present.map((k) => [k, components[k]!.value])) as Partial<Record<ComponentName, number>>;
  if (present.length < 2) return { value: null, reason: "insufficient_data", refs, components: values };
  const totalWeight = present.reduce((sum, k) => sum + weights[k], 0);
  const value = 100 * present.reduce((sum, k) => sum + (weights[k] / totalWeight) * Math.min(1, Math.max(0, components[k]!.value)), 0);
  return { value, refs, components: values };
}
```

`src/scoring/winnability.ts`:

```ts
import type { Score, Verdict } from "../types.js";

export function winnability(fan: Score, act: Score): Score {
  if (fan.value === null || act.value === null) return { value: null, reason: "insufficient_data", refs: [...fan.refs, ...act.refs] };
  return { value: 0.5 * fan.value + 0.5 * act.value, refs: [...fan.refs, ...act.refs] };
}

export function verdict(fan: Score, act: Score, win: Score): Verdict {
  if (fan.value === null || act.value === null || win.value === null) return "insufficient_data";
  if (fan.value >= 70 && act.value >= 60) return "play";
  if (fan.value >= 45 && fan.value < 70 && act.value >= 75) return "hidden_goldmine";
  if (fan.value >= 70 && act.value < 45) return "de_risk";
  if (win.value >= 55) return "consider";
  return "skip";
}

export function coBillLift(overlap: number, localAffinity: number): number {
  return Math.min(1, Math.max(0, overlap * localAffinity));
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run test/scoring.test.ts`
Expected: PASS. Check the fanHeat expectation arithmetic: a → 0.7·1 + 0.3·0 = 0.7 → 70; b → 0.7·0 + 0.3·1 = 30. Single market 0.7·0.8 + 0.3·0.5 = 0.71 → 71.

- [ ] **Step 5: Commit**

```bash
git add cloud_run/qloo_gateway/src/scoring cloud_run/qloo_gateway/test/scoring.test.ts
git commit -m "feat(gateway): deterministic fan heat, activation, winnability and verdict scoring"
```

---

### Task 8: Claim verification

**Files:**
- Create: `src/claims/verify.ts`, `test/claims.test.ts`

**Interfaces:**
- Produces:
  - `interface EvidenceItem { id: string; entityIds: string[]; names: string[]; numbers: number[] }`
  - `interface Claim { text: string; entities: Array<{ name: string; entityId?: string }>; numbers: number[]; evidence_refs: string[] }`
  - `type RemovalReason = "no_refs" | "dangling_ref" | "unsupported_entity" | "unsupported_number"`
  - `verifyClaims(claims: Claim[], evidence: EvidenceItem[]): { verified: Claim[]; removed: Array<{ claim: Claim; reason: RemovalReason; detail: string }> }`
  - `normaliseName(s: string): string`

- [ ] **Step 1: Write failing tests** — `test/claims.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { normaliseName, verifyClaims, type Claim, type EvidenceItem } from "../src/claims/verify.js";

const evidence: EvidenceItem[] = [
  { id: "e1", entityIds: ["q-123"], names: ["Café Tacuba", "Corona"], numbers: [82, 0.82] },
];
const claim = (over: Partial<Claim>): Claim => ({ text: "t", entities: [], numbers: [], evidence_refs: ["e1"], ...over });

describe("normaliseName", () => {
  it("strips accents, case, punctuation and extra spaces", () => {
    expect(normaliseName("  Café   Tacuba! ")).toBe("cafe tacuba");
  });
});

describe("verifyClaims", () => {
  it("keeps a fully supported claim", () => {
    const r = verifyClaims([claim({ entities: [{ name: "cafe tacuba" }], numbers: [82] })], evidence);
    expect(r.verified).toHaveLength(1);
  });
  it("matches by entity id when given", () => {
    expect(verifyClaims([claim({ entities: [{ name: "Anything", entityId: "q-123" }] })], evidence).verified).toHaveLength(1);
  });
  it("removes a fabricated entity", () => {
    const r = verifyClaims([claim({ entities: [{ name: "Heineken" }] })], evidence);
    expect(r.removed[0]).toMatchObject({ reason: "unsupported_entity" });
  });
  it("removes an altered number but tolerates display rounding", () => {
    expect(verifyClaims([claim({ numbers: [83] })], evidence).removed[0]?.reason).toBe("unsupported_number");
    expect(verifyClaims([claim({ numbers: [0.8] })], evidence).verified).toHaveLength(1); // 0.82 shown at 1 dp
  });
  it("removes dangling refs and claims with no refs", () => {
    expect(verifyClaims([claim({ evidence_refs: ["nope"] })], evidence).removed[0]?.reason).toBe("dangling_ref");
    expect(verifyClaims([claim({ evidence_refs: [] })], evidence).removed[0]?.reason).toBe("no_refs");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/claims.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/claims/verify.ts`**

```ts
export interface EvidenceItem { id: string; entityIds: string[]; names: string[]; numbers: number[] }
export interface Claim { text: string; entities: Array<{ name: string; entityId?: string }>; numbers: number[]; evidence_refs: string[] }
export type RemovalReason = "no_refs" | "dangling_ref" | "unsupported_entity" | "unsupported_number";

export function normaliseName(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function decimals(n: number): number {
  const text = String(n);
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
}

function numberSupported(n: number, pool: number[]): boolean {
  const tolerance = 0.5 * 10 ** -decimals(n);
  return pool.some((v) => Math.abs(v - n) <= tolerance + 1e-9);
}

export function verifyClaims(claims: Claim[], evidence: EvidenceItem[]) {
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const verified: Claim[] = [];
  const removed: Array<{ claim: Claim; reason: RemovalReason; detail: string }> = [];

  for (const claim of claims) {
    if (claim.evidence_refs.length === 0) { removed.push({ claim, reason: "no_refs", detail: "claim cites no evidence" }); continue; }
    const missing = claim.evidence_refs.find((id) => !byId.has(id));
    if (missing) { removed.push({ claim, reason: "dangling_ref", detail: missing }); continue; }
    const items = claim.evidence_refs.map((id) => byId.get(id)!);
    const ids = new Set(items.flatMap((e) => e.entityIds));
    const names = new Set(items.flatMap((e) => e.names.map(normaliseName)));
    const numbers = items.flatMap((e) => e.numbers);

    const badEntity = claim.entities.find((e) => !(e.entityId && ids.has(e.entityId)) && !names.has(normaliseName(e.name)));
    if (badEntity) { removed.push({ claim, reason: "unsupported_entity", detail: badEntity.name }); continue; }
    const badNumber = claim.numbers.find((n) => !numberSupported(n, numbers));
    if (badNumber !== undefined) { removed.push({ claim, reason: "unsupported_number", detail: String(badNumber) }); continue; }
    verified.push(claim);
  }
  return { verified, removed };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run test/claims.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add cloud_run/qloo_gateway/src/claims cloud_run/qloo_gateway/test/claims.test.ts
git commit -m "feat(gateway): deterministic grounding verification for atomic LLM claims"
```

---

### Task 9: Envelope extraction + Tour Board pipeline (Discover → Decide)

**Files:**
- Create: `src/extract.ts`, `src/pipeline/tourBoard.ts`, `test/fixtures/envelopes.ts`, `test/extract.test.ts`, `test/tourBoard.test.ts`

**Interfaces:**
- Consumes: `QlooCaller`, `CallResult` (T5); `marketsFromHeat`, `zonesFromHeat`, `HeatPoint`, `City`, `decodeGeohash` (T6); `fanHeat`, `activation`, `meanTopK`, `fanConcentration`, `winnability`, `verdict` (T7); `GatewayEvent`, `Score`, `Verdict` (T1).
- Produces:
  - `extractEntities(env: QlooEnvelope): Array<{ entityId: string; name: string; type?: string; affinity: number; popularity: number; index: number }>`
  - `extractHeatPoints(env: QlooEnvelope): HeatPoint[]`
  - `extractIssues(env: QlooEnvelope): { field: string; candidates: Array<{ id: string; name: string; type?: string }> }[]`
  - `interface TourBrief { artist: string; artistEntityId?: string; regions: string[]; maxStops: number; sessionId: string; today: string }`
  - `interface ScoredCity { id: string; name: string; country: string; lat: number; lon: number; fanHeat: Score; activation: Score & { components: Record<string, number> }; winnability: Score; verdict: Verdict; zones: ReturnType<typeof zonesFromHeat> }`
  - `runTourBoard(brief: TourBrief, deps: { qloo: QlooCaller; cities: City[]; signal?: AbortSignal; concurrency?: number }): AsyncGenerator<GatewayEvent>`
  - `activationInputs(artist: string, city: { name: string; country: string }, deps: { qloo: QlooCaller; cities: City[]; signal?: AbortSignal }, sessionId: string, events: GatewayEvent[]): Promise<{ components: Partial<Record<ComponentName, { value: number; refs: EvidenceRef[] }>>; zones: ReturnType<typeof zonesFromHeat>; raw: { brands: CallResult; places: CallResult; films: CallResult; artists: CallResult; inCity: CallResult; ranked?: CallResult } }>` (exported for Task 10; `artist` is the Qloo entity id or name)
  - Emits, after `resolve`, one `artist_profile` event built from `qloo_audience_demographics`, `qloo_entity_tags` and `qloo_trends` (last 90 days ending `brief.today`).

**Data-shape note:** entity results follow the harness `compactEntity` shape `{ entity_id, name, type, subtype, popularity, affinity, explainability?, properties? }`. Heatmap points are raw Qloo points; the extractor accepts `{ location: { latitude, longitude, geohash? }, query: { affinity, popularity } }` and falls back to decoding `location.geohash`. Task 13 replaces the fixtures below with recorded real envelopes and adjusts the extractor if shapes differ.

- [ ] **Step 1: Create fixtures** — `test/fixtures/envelopes.ts`

```ts
import type { QlooEnvelope } from "../../src/types.js";

export const describeOk: QlooEnvelope = {
  operation: "describe", status: "ok",
  results: [{ entity_id: "A1", name: "Test Artist", type: "urn:entity", subtype: "urn:entity:artist", popularity: 0.9 }],
};
export const describeAmbiguous: QlooEnvelope = {
  operation: "describe", status: "needs_input", summary: "Choose the intended Qloo entity.",
  issues: [{ input: "Pedro", kind: "ambiguous", field: "entity", candidates: [{ id: "P1", name: "Pedro Infante" }, { id: "P2", name: "Pedro Capó" }] }],
};
export const heatMexico: QlooEnvelope = {
  operation: "where_popular", status: "ok",
  results: [
    { location: { latitude: 19.43, longitude: -99.13 }, query: { affinity: 0.92, popularity: 0.7 } },
    { location: { latitude: 25.68, longitude: -100.31 }, query: { affinity: 0.66, popularity: 0.4 } },
  ],
};
export const heatEmpty: QlooEnvelope = { operation: "where_popular", status: "empty", results: [] };
export const recs = (names: string[], affinities: number[]): QlooEnvelope => ({
  operation: "recommend", status: "ok",
  results: names.map((name, i) => ({ entity_id: `E${i}`, name, affinity: affinities[i] ?? 0, popularity: 0.5 })),
});
export const cityHeat: QlooEnvelope = {
  operation: "where_popular", status: "ok",
  results: [
    { location: { latitude: 19.35, longitude: -99.16 }, query: { affinity: 0.6, popularity: 0.2 } },
    { location: { latitude: 19.43, longitude: -99.13 }, query: { affinity: 0.3, popularity: 0.2 } },
    { location: { latitude: 19.40, longitude: -99.20 }, query: { affinity: 0.1, popularity: 0.2 } },
  ],
};
```

- [ ] **Step 2: Write failing extraction tests** — `test/extract.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { extractEntities, extractHeatPoints, extractIssues } from "../src/extract.js";
import { describeAmbiguous, heatMexico, recs } from "./fixtures/envelopes.js";

describe("extract", () => {
  it("extracts entities and marks a missing affinity as NaN", () => {
    const e = extractEntities(recs(["A"], [0.9]));
    expect(e[0]).toMatchObject({ entityId: "E0", name: "A", affinity: 0.9, index: 0 });
    const missing = extractEntities({ operation: "recommend", status: "ok", results: [{ entity_id: "Z", name: "Z" }] });
    expect(Number.isNaN(missing[0]!.affinity)).toBe(true);
  });
  it("extracts heat points from lat/lon or geohash", () => {
    expect(extractHeatPoints(heatMexico)[0]).toMatchObject({ lat: 19.43, lon: -99.13, affinity: 0.92, popularity: 0.7, index: 0 });
    const viaHash = extractHeatPoints({ operation: "where_popular", status: "ok", results: [{ location: { geohash: "9g3w81t7j" }, query: { affinity: 0.5, popularity: 0.1 } }] });
    expect(viaHash[0]!.lat).toBeCloseTo(19.43, 1);
  });
  it("skips malformed points instead of crashing", () => {
    expect(extractHeatPoints({ operation: "where_popular", status: "ok", results: [{ foo: 1 }, null] })).toEqual([]);
  });
  it("extracts needs_input issues and candidates", () => {
    expect(extractIssues(describeAmbiguous)).toEqual([{ field: "entity", candidates: [{ id: "P1", name: "Pedro Infante" }, { id: "P2", name: "Pedro Capó" }] }]);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run test/extract.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/extract.ts`**

```ts
import { decodeGeohash } from "./geo/geohash.js";
import type { HeatPoint } from "./geo/heat.js";
import type { QlooEnvelope } from "./types.js";

const rec = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number.NaN);
const list = (env: QlooEnvelope): unknown[] => (Array.isArray(env.results) ? env.results : []);

export function extractEntities(env: QlooEnvelope) {
  return list(env).flatMap((raw, index) => {
    const e = rec(raw);
    if (!e || typeof e.name !== "string") return [];
    return [{
      entityId: String(e.entity_id ?? e.id ?? ""), name: e.name,
      ...(typeof e.subtype === "string" ? { type: e.subtype } : typeof e.type === "string" ? { type: e.type } : {}),
      affinity: num(e.affinity), popularity: num(e.popularity), index,
    }];
  });
}

export function extractHeatPoints(env: QlooEnvelope): HeatPoint[] {
  return list(env).flatMap((raw, index) => {
    const p = rec(raw);
    const loc = rec(p?.location);
    const query = rec(p?.query);
    if (!loc || !query) return [];
    let lat = num(loc.latitude), lon = num(loc.longitude);
    if ((Number.isNaN(lat) || Number.isNaN(lon)) && typeof loc.geohash === "string") ({ lat, lon } = decodeGeohash(loc.geohash));
    const affinity = num(query.affinity), popularity = num(query.popularity);
    if ([lat, lon, affinity].some(Number.isNaN)) return [];
    return [{ lat, lon, affinity, popularity: Number.isNaN(popularity) ? 0 : popularity, index }];
  });
}

export function extractIssues(env: QlooEnvelope) {
  const raw = Array.isArray(env.issues) ? env.issues : Array.isArray(rec(env.resolution)?.issues) ? (rec(env.resolution)!.issues as unknown[]) : [];
  return raw.flatMap((i) => {
    const issue = rec(i);
    if (!issue) return [];
    const candidates = (Array.isArray(issue.candidates) ? issue.candidates : []).flatMap((c) => {
      const cand = rec(c);
      if (!cand || typeof cand.name !== "string") return [];
      return [{ id: String(cand.id ?? cand.entity_id ?? ""), name: cand.name, ...(typeof cand.type === "string" ? { type: cand.type } : {}) }];
    });
    return [{ field: String(issue.field ?? "entity"), candidates }];
  });
}
```

Run: `npx vitest run test/extract.test.ts` → Expected: PASS (4 tests).

- [ ] **Step 5: Write failing pipeline tests** — `test/tourBoard.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { City } from "../src/geo/cities.js";
import { runTourBoard, type TourBrief } from "../src/pipeline/tourBoard.js";
import type { QlooCaller } from "../src/qlooCall.js";
import type { GatewayEvent, QlooEnvelope } from "../src/types.js";
import { cityHeat, describeAmbiguous, describeOk, heatEmpty, heatMexico, recs } from "./fixtures/envelopes.js";

const CITIES: City[] = [
  { id: "1", name: "Mexico City", country: "MX", lat: 19.4326, lon: -99.1332, population: 9_000_000 },
  { id: "2", name: "Monterrey", country: "MX", lat: 25.6866, lon: -100.3161, population: 1_100_000 },
  { id: "3", name: "Coyoacan", country: "MX", lat: 19.35, lon: -99.162, population: 600_000 },
];

function fakeQloo(route: (tool: string, args: Record<string, unknown>) => QlooEnvelope, log: string[] = []): QlooCaller {
  return { async call(tool, args) { log.push(`${tool}:${String(args.within ?? args.filter_location ?? args.signal_location ?? "")}`); return { envelope: route(tool, args), cacheKey: `${tool}-${log.length}`, cached: false, stale: false }; } };
}

const brief: TourBrief = { artist: "Test Artist", regions: ["Mexico"], maxStops: 8, sessionId: "s", today: "2026-10-20" };

async function collect(gen: AsyncGenerator<GatewayEvent>) { const out: GatewayEvent[] = []; for await (const e of gen) out.push(e); return out; }

const happy = (tool: string, args: Record<string, unknown>): QlooEnvelope => {
  if (tool === "qloo_describe") return describeOk;
  if (tool === "qloo_where_popular") return args.within === "Mexico" ? heatMexico : cityHeat;
  if (tool === "qloo_recommend") return recs(["One", "Two", "Three"], [0.9, 0.7, 0.5]);
  if (tool === "qloo_rank") return recs(["Venue A"], [0.8]);
  return { operation: tool, status: "ok", results: [] };
};

describe("runTourBoard", () => {
  it("emits resolve, scored cities sorted by winnability, and done", async () => {
    const events = await collect(runTourBoard(brief, { qloo: fakeQloo(happy), cities: CITIES }));
    expect(events[0]).toMatchObject({ type: "resolve", entity: { entityId: "A1", name: "Test Artist" } });
    expect(events.some((e) => e.type === "artist_profile")).toBe(true);
    const scored = events.filter((e) => e.type === "city_scored");
    expect(scored.map((e) => (e as { city: { name: string } }).city.name)).toEqual(["Mexico City", "Monterrey"]);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("stops with needs_input for ambiguous artists (Review Focus 1)", async () => {
    const events = await collect(runTourBoard({ ...brief, artist: "Pedro" }, { qloo: fakeQloo((t) => (t === "qloo_describe" ? describeAmbiguous : happy(t, {}))), cities: CITIES }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "needs_input", candidates: [{ id: "P1" }, { id: "P2" }] });
  });

  it("uses artistEntityId when the user picked a candidate", async () => {
    const log: string[] = [];
    await collect(runTourBoard({ ...brief, artist: "Pedro", artistEntityId: "P2" }, { qloo: fakeQloo(happy, log), cities: CITIES }));
    expect(log.some((l) => l.startsWith("qloo_describe"))).toBe(false);
  });

  it("marks an empty region and still finishes (Review Focus 2)", async () => {
    const events = await collect(runTourBoard({ ...brief, regions: ["Atlantis", "Mexico"] }, {
      qloo: fakeQloo((t, a) => (t === "qloo_where_popular" && a.within === "Atlantis" ? heatEmpty : happy(t, a))), cities: CITIES,
    }));
    expect(events).toContainEqual({ type: "region_empty", region: "Atlantis" });
    expect(events.at(-1)?.type).toBe("done");
  });

  it("gives insufficient_data activation when city calls are empty", async () => {
    const events = await collect(runTourBoard(brief, {
      qloo: fakeQloo((t, a) => (t === "qloo_describe" ? describeOk : t === "qloo_where_popular" && a.within === "Mexico" ? heatMexico : { operation: t, status: "empty", results: [] })),
      cities: CITIES,
    }));
    const city = (events.find((e) => e.type === "city_scored") as { city: { verdict: string } }).city;
    expect(city.verdict).toBe("insufficient_data");
  });

  it("stops issuing calls once aborted", async () => {
    const controller = new AbortController();
    const log: string[] = [];
    const gen = runTourBoard(brief, { qloo: fakeQloo(happy, log), cities: CITIES, signal: controller.signal });
    await gen.next(); // resolve (only qloo_describe has run)
    controller.abort();
    const atAbort = log.length;
    const rest = await collect(gen);
    expect(rest.at(-1)).toMatchObject({ type: "error", code: "ABORTED" });
    expect(log.length).toBe(atAbort);
  });

  it("computes the trends window as the 90 days ending today", async () => {
    const seen: Array<Record<string, unknown>> = [];
    await collect(runTourBoard(brief, { qloo: fakeQloo((t, a) => { if (t === "qloo_trends") seen.push(a); return happy(t, a); }), cities: CITIES }));
    expect(seen[0]).toMatchObject({ start_date: "2026-07-22", end_date: "2026-10-20", entity_type: "artist" });
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run test/tourBoard.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `src/pipeline/tourBoard.ts`**

```ts
import { extractEntities, extractHeatPoints, extractIssues } from "../extract.js";
import type { City } from "../geo/cities.js";
import { marketsFromHeat, zonesFromHeat } from "../geo/heat.js";
import type { CallResult, QlooCaller } from "../qlooCall.js";
import { activation, fanConcentration, meanTopK, type ComponentName } from "../scoring/activation.js";
import { fanHeat } from "../scoring/fanHeat.js";
import { verdict, winnability } from "../scoring/winnability.js";
import type { EvidenceRef, GatewayEvent, Score, Verdict } from "../types.js";

export interface TourBrief { artist: string; artistEntityId?: string; regions: string[]; maxStops: number; sessionId: string; today: string }
export interface ScoredCity {
  id: string; name: string; country: string; lat: number; lon: number;
  fanHeat: Score; activation: Score & { components: Partial<Record<ComponentName, number>> }; winnability: Score; verdict: Verdict;
  zones: ReturnType<typeof zonesFromHeat>;
}
interface Deps { qloo: QlooCaller; cities: City[]; signal?: AbortSignal; concurrency?: number }

const SHORTLIST = 8;
const ref = (tool: string, r: CallResult, resultIndex?: number): EvidenceRef => ({ tool, cacheKey: r.cacheKey, ...(resultIndex !== undefined ? { resultIndex } : {}) });

class Aborted extends Error {}

async function call(deps: Deps, sessionId: string, tool: string, args: Record<string, unknown>, events: GatewayEvent[]): Promise<CallResult> {
  if (deps.signal?.aborted) throw new Aborted();
  const r = await deps.qloo.call(tool, args, sessionId);
  events.push({ type: "tool_call", tool, args, cached: r.cached });
  events.push({ type: "tool_result", tool, status: r.envelope.status, resultCount: Array.isArray(r.envelope.results) ? r.envelope.results.length : 0, cacheKey: r.cacheKey, stale: r.stale });
  return r;
}

export async function activationInputs(artist: string, city: { name: string; country: string }, deps: Deps, sessionId: string, events: GatewayEvent[]) {
  const where = `${city.name}, ${city.country}`;
  const [brands, places, films, artists, inCity] = await Promise.all([
    call(deps, sessionId, "qloo_recommend", { target_type: "brand", signals: [artist], signal_location: where, limit: 10 }, events),
    call(deps, sessionId, "qloo_recommend", { target_type: "place", signals: [artist], filter_location: where, limit: 10 }, events),
    call(deps, sessionId, "qloo_recommend", { target_type: "movie", signals: [artist], signal_location: where, limit: 10 }, events),
    call(deps, sessionId, "qloo_recommend", { target_type: "artist", signals: [artist], signal_location: where, limit: 10 }, events),
    call(deps, sessionId, "qloo_where_popular", { entity: artist, entity_type: "artist", within: where, limit: 20 }, events),
  ]);
  const placeEntities = extractEntities(places.envelope);
  const venueNames = placeEntities.slice(0, 10).map((e) => e.name);
  const ranked = venueNames.length > 0
    ? await call(deps, sessionId, "qloo_rank", { options: venueNames, option_type: "place", signals: [artist], signal_location: where }, events)
    : undefined;

  const zones = zonesFromHeat(extractHeatPoints(inCity.envelope), deps.cities);
  const components: Partial<Record<ComponentName, { value: number; refs: EvidenceRef[] }>> = {};
  const sponsor = meanTopK(extractEntities(brands.envelope).map((e) => e.affinity), 5);
  if (sponsor !== null) components.sponsor_fit = { value: sponsor, refs: [ref("qloo_recommend", brands)] };
  const hooks = meanTopK([...placeEntities, ...extractEntities(films.envelope), ...extractEntities(artists.envelope)].map((e) => e.affinity), 5);
  if (hooks !== null) components.local_hooks = { value: hooks, refs: [ref("qloo_recommend", places), ref("qloo_recommend", films), ref("qloo_recommend", artists)] };
  const conc = fanConcentration(zones.map((z) => z.share));
  if (conc !== null) components.fan_concentration = { value: conc, refs: [ref("qloo_where_popular", inCity)] };
  const venue = ranked ? meanTopK(extractEntities(ranked.envelope).map((e) => e.affinity), 1) : null;
  if (venue !== null && ranked) components.venue_fit = { value: venue, refs: [ref("qloo_rank", ranked)] };

  return { components, zones, raw: { brands, places, films, artists, inCity, ranked } };
}

export async function* runTourBoard(brief: TourBrief, deps: Deps): AsyncGenerator<GatewayEvent> {
  const events: GatewayEvent[] = [];
  const flush = function* () { while (events.length) yield events.shift()!; };
  try {
    let artistName = brief.artist;
    let entityId = brief.artistEntityId;
    if (!entityId) {
      const d = await deps.qloo.call("qloo_describe", { entity: brief.artist, type: "artist" }, brief.sessionId);
      if (d.envelope.status === "needs_input") {
        const issue = extractIssues(d.envelope)[0];
        yield { type: "needs_input", field: issue?.field ?? "entity", candidates: issue?.candidates ?? [], summary: d.envelope.summary ?? "Choose the intended artist." };
        return;
      }
      const top = extractEntities(d.envelope)[0];
      if (!top) { yield { type: "error", code: "NOT_FOUND", message: `Qloo has no artist matching "${brief.artist}"` }; return; }
      entityId = top.entityId;
      artistName = top.name;
    }
    yield { type: "resolve", entity: { entityId, name: artistName } };
    const signalArtist = entityId; // harness accepts Qloo UUIDs as entity inputs

    const end = new Date(`${brief.today}T00:00:00Z`);
    const start = new Date(end.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
    const [demo, tags, trends, heatCalls] = await Promise.all([
      call(deps, brief.sessionId, "qloo_audience_demographics", { entity: signalArtist, entity_type: "artist" }, events),
      call(deps, brief.sessionId, "qloo_entity_tags", { entities: [signalArtist], entity_type: "artist", limit: 10 }, events),
      call(deps, brief.sessionId, "qloo_trends", { entities: [signalArtist], entity_type: "artist", start_date: start, end_date: brief.today }, events),
      Promise.all(brief.regions.map(async (region) => ({
        region, r: await call(deps, brief.sessionId, "qloo_where_popular", { entity: signalArtist, entity_type: "artist", within: region, limit: 20 }, events),
      }))),
    ]);
    yield* flush();
    yield {
      type: "artist_profile",
      demographics: Array.isArray(demo.envelope.results) ? demo.envelope.results : [],
      tags: extractEntities(tags.envelope).map((t) => ({ name: t.name, affinity: t.affinity })),
      trends: trends.envelope.results ?? null,
      refs: [ref("qloo_audience_demographics", demo), ref("qloo_entity_tags", tags), ref("qloo_trends", trends)],
    };

    const pooled = heatCalls.flatMap(({ region, r }) => {
      const points = extractHeatPoints(r.envelope);
      if (points.length === 0) { events.push({ type: "region_empty", region }); return []; }
      return marketsFromHeat(points, deps.cities).map((m) => ({ ...m, refs: [ref("qloo_where_popular", r)] }));
    });
    yield* flush();

    const heat = fanHeat(pooled.map((m) => ({ id: m.city.id, affinity: m.affinity, popularity: m.popularity, refs: m.refs })));
    const shortlist = [...pooled]
      .sort((a, b) => (heat.get(b.city.id)?.value ?? -1) - (heat.get(a.city.id)?.value ?? -1))
      .slice(0, Math.min(SHORTLIST, Math.max(brief.maxStops, 1) + 2));

    const scored: ScoredCity[] = [];
    const limit = deps.concurrency ?? 3;
    for (let i = 0; i < shortlist.length; i += limit) {
      const batch = await Promise.all(shortlist.slice(i, i + limit).map(async (m) => {
        const inputs = await activationInputs(signalArtist, m.city, deps, brief.sessionId, events);
        const fan = heat.get(m.city.id)!;
        const act = activation(inputs.components);
        const win = winnability(fan, act);
        return { id: m.city.id, name: m.city.name, country: m.city.country, lat: m.city.lat, lon: m.city.lon, fanHeat: fan, activation: act, winnability: win, verdict: verdict(fan, act, win), zones: inputs.zones } satisfies ScoredCity;
      }));
      yield* flush();
      scored.push(...batch);
    }
    scored.sort((a, b) => (b.winnability.value ?? -1) - (a.winnability.value ?? -1));
    for (const city of scored) yield { type: "city_scored", city };
    yield { type: "done", summary: { artist: { entityId, name: artistName }, cities: scored.length } };
  } catch (err) {
    yield* flush();
    if (err instanceof Aborted) { yield { type: "error", code: "ABORTED", message: "client disconnected" }; return; }
    yield { type: "error", code: "INTERNAL", message: (err as Error).message };
  }
}
```

- [ ] **Step 8: Run tests to verify pass**

Run: `npx vitest run test/tourBoard.test.ts test/extract.test.ts`
Expected: PASS. Note: `city_scored` events are emitted after all scoring so the client receives them in winnability order; `tool_call`/`tool_result` events stream as batches complete.

- [ ] **Step 9: Commit**

```bash
git add cloud_run/qloo_gateway/src/extract.ts cloud_run/qloo_gateway/src/pipeline/tourBoard.ts cloud_run/qloo_gateway/test
git commit -m "feat(gateway): Tour Board pipeline — discover markets from heatmaps and score winnability"
```

---

### Task 10: City Playbook evidence pipeline (Activate)

**Files:**
- Create: `src/pipeline/cityPlaybook.ts`, `test/cityPlaybook.test.ts`

**Interfaces:**
- Consumes: `activationInputs` (T9), `extractEntities` (T9), `coBillLift` (T7), `QlooCaller` (T5).
- Produces:
  - `interface PlaybookCard<T> { kind: "sponsors" | "promo_zones" | "local_moment" | "venue_fit" | "co_billing"; status: "ok" | "empty"; items: T[]; refs: EvidenceRef[] }`
  - `runCityPlaybook(input: { artist: string; artistEntityId: string; city: { name: string; country: string }; sessionId: string }, deps: { qloo: QlooCaller; cities: City[]; signal?: AbortSignal }): AsyncGenerator<GatewayEvent>` — ends with `{ type: "playbook", playbook: { city, cards: PlaybookCard<unknown>[] } }` then `done`.

- [ ] **Step 1: Write failing tests** — `test/cityPlaybook.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { City } from "../src/geo/cities.js";
import { runCityPlaybook } from "../src/pipeline/cityPlaybook.js";
import type { QlooCaller } from "../src/qlooCall.js";
import type { GatewayEvent, QlooEnvelope } from "../src/types.js";
import { cityHeat, recs } from "./fixtures/envelopes.js";

const CITIES: City[] = [{ id: "3", name: "Coyoacan", country: "MX", lat: 19.35, lon: -99.162, population: 600_000 }];
const compare: QlooEnvelope = { operation: "compare_audiences", status: "ok", results: { overlap: 0.4 } };

function qloo(route: (t: string, a: Record<string, unknown>) => QlooEnvelope): QlooCaller {
  let n = 0;
  return { async call(tool, args) { n += 1; return { envelope: route(tool, args), cacheKey: `k${n}`, cached: false, stale: false }; } };
}
const happy = (t: string, a: Record<string, unknown>): QlooEnvelope => {
  if (t === "qloo_where_popular") return cityHeat;
  if (t === "qloo_compare_audiences") return compare;
  if (t === "qloo_rank") return recs(["Venue A", "Venue B"], [0.8, 0.6]);
  if (t === "qloo_recommend" && a.target_type === "artist") return recs(["Opener 1", "Opener 2", "Opener 3", "Opener 4"], [0.9, 0.8, 0.7, 0.6]);
  return recs(["X", "Y"], [0.7, 0.5]);
};
async function collect(g: AsyncGenerator<GatewayEvent>) { const o: GatewayEvent[] = []; for await (const e of g) o.push(e); return o; }
const input = { artist: "Test Artist", artistEntityId: "A1", city: { name: "Mexico City", country: "MX" }, sessionId: "s" };

describe("runCityPlaybook", () => {
  it("produces all five evidence cards in order", async () => {
    const events = await collect(runCityPlaybook(input, { qloo: qloo(happy), cities: CITIES }));
    const pb = (events.find((e) => e.type === "playbook") as { playbook: { cards: Array<{ kind: string; status: string }> } }).playbook;
    expect(pb.cards.map((c) => c.kind)).toEqual(["sponsors", "promo_zones", "local_moment", "venue_fit", "co_billing"]);
    expect(events.at(-1)?.type).toBe("done");
  });
  it("co-billing compares only the top 3 candidates and ranks by lift", async () => {
    const seen: string[] = [];
    const events = await collect(runCityPlaybook(input, { qloo: qloo((t, a) => { if (t === "qloo_compare_audiences") seen.push(String((a.group_b as string[])[0])); return happy(t, a); }), cities: CITIES }));
    expect(seen).toEqual(["E0", "E1", "E2"]);
    const co = (events.find((e) => e.type === "playbook") as { playbook: { cards: Array<{ kind: string; items: Array<{ lift: number }> }> } }).playbook.cards.find((c) => c.kind === "co_billing")!;
    expect(co.items[0]!.lift).toBeGreaterThanOrEqual(co.items[1]!.lift);
  });
  it("marks cards empty instead of inventing items", async () => {
    const events = await collect(runCityPlaybook(input, { qloo: qloo((t) => ({ operation: t, status: "empty", results: [] })), cities: CITIES }));
    const cards = (events.find((e) => e.type === "playbook") as { playbook: { cards: Array<{ status: string; items: unknown[] }> } }).playbook.cards;
    expect(cards.every((c) => c.status === "empty" && c.items.length === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/cityPlaybook.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/pipeline/cityPlaybook.ts`**

```ts
import { extractEntities } from "../extract.js";
import type { City } from "../geo/cities.js";
import type { QlooCaller } from "../qlooCall.js";
import { coBillLift } from "../scoring/winnability.js";
import type { EvidenceRef, GatewayEvent } from "../types.js";
import { activationInputs } from "./tourBoard.js";

export interface PlaybookCard<T> { kind: "sponsors" | "promo_zones" | "local_moment" | "venue_fit" | "co_billing"; status: "ok" | "empty"; items: T[]; refs: EvidenceRef[] }

function overlapOf(results: unknown): number {
  const r = results as Record<string, unknown> | undefined;
  const v = r && typeof r === "object" ? (r.overlap ?? r.similarity ?? r.score) : undefined;
  return typeof v === "number" && Number.isFinite(v) ? v : Number.NaN;
}

function card<T>(kind: PlaybookCard<T>["kind"], items: T[], refs: EvidenceRef[]): PlaybookCard<T> {
  return { kind, status: items.length > 0 ? "ok" : "empty", items, refs };
}

export async function* runCityPlaybook(
  input: { artist: string; artistEntityId: string; city: { name: string; country: string }; sessionId: string },
  deps: { qloo: QlooCaller; cities: City[]; signal?: AbortSignal },
): AsyncGenerator<GatewayEvent> {
  const events: GatewayEvent[] = [];
  try {
    const a = await activationInputs(input.artistEntityId, input.city, deps, input.sessionId, events);
    while (events.length) yield events.shift()!;
    const ref = (tool: string, r: { cacheKey: string }) => ({ tool, cacheKey: r.cacheKey });

    const candidates = extractEntities(a.raw.artists.envelope).slice(0, 3);
    const lifts = await Promise.all(candidates.map(async (c) => {
      if (deps.signal?.aborted) return undefined;
      const r = await deps.qloo.call("qloo_compare_audiences", { group_a: [input.artistEntityId], group_b: [c.entityId] }, input.sessionId);
      events.push({ type: "tool_call", tool: "qloo_compare_audiences", args: { group_a: [input.artistEntityId], group_b: [c.entityId] }, cached: r.cached });
      const overlap = overlapOf(r.envelope.results);
      if (Number.isNaN(overlap) || Number.isNaN(c.affinity)) return undefined;
      return { name: c.name, entityId: c.entityId, overlap, localAffinity: c.affinity, lift: coBillLift(overlap, c.affinity), ref: ref("qloo_compare_audiences", r) };
    }));
    while (events.length) yield events.shift()!;
    const coBill = lifts.filter((x): x is NonNullable<typeof x> => x !== undefined).sort((x, y) => y.lift - x.lift);

    const cards: PlaybookCard<unknown>[] = [
      card("sponsors", extractEntities(a.raw.brands.envelope), [ref("qloo_recommend", a.raw.brands)]),
      card("promo_zones", a.zones.slice(0, 5), [ref("qloo_where_popular", a.raw.inCity)]),
      card("local_moment", [...extractEntities(a.raw.artists.envelope), ...extractEntities(a.raw.films.envelope), ...extractEntities(a.raw.places.envelope)].slice(0, 9),
        [ref("qloo_recommend", a.raw.artists), ref("qloo_recommend", a.raw.films), ref("qloo_recommend", a.raw.places)]),
      card("venue_fit", a.raw.ranked ? extractEntities(a.raw.ranked.envelope).slice(0, 3) : [], a.raw.ranked ? [ref("qloo_rank", a.raw.ranked)] : []),
      card("co_billing", coBill, coBill.map((c) => c.ref)),
    ];
    yield { type: "playbook", playbook: { city: input.city, cards } };
    yield { type: "done", summary: { city: input.city.name } };
  } catch (err) {
    yield { type: "error", code: "INTERNAL", message: (err as Error).message };
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run test/cityPlaybook.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add cloud_run/qloo_gateway/src/pipeline/cityPlaybook.ts cloud_run/qloo_gateway/test/cityPlaybook.test.ts
git commit -m "feat(gateway): City Playbook evidence pipeline with co-billing lift"
```

---

### Task 11: HTTP app with SSE

**Files:**
- Create: `src/http/app.ts`, `src/server.ts`, `test/http.test.ts`

**Interfaces:**
- Consumes: `runTourBoard` (T9), `runCityPlaybook` (T10), `QlooCaller` (T5), `QlooMcpClient.health` (T2), `loadCities` (T6).
- Produces: `createApp(deps: { qloo: QlooCaller; cities: City[]; health: () => Promise<{ connected: boolean; ready: boolean }> }): express.Express` with routes:
  - `GET /healthz` → `200 { connected, ready }`
  - `POST /v1/tour-board` body `TourBrief` minus `sessionId/today` plus header `x-session-id` → SSE (`event: <type>\ndata: <json>\n\n`)
  - `GET /v1/city-playbook?artist=&artistEntityId=&city=&country=` + `x-session-id` → SSE
  - `POST /v1/tools/:name` body args + `x-session-id` → `200 CallResult` or `400 { error }`
- Note: spec §6.2 listed `POST /v1/resolve`; this plan replaces it with a stateless re-submission of `/v1/tour-board` including `artistEntityId` (simpler, no server session state). Update spec §6.2 in this task.

- [ ] **Step 1: Write failing tests** — `test/http.test.ts`

```ts
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/http/app.js";
import type { QlooCaller } from "../src/qlooCall.js";
import { describeOk, heatMexico, recs, cityHeat } from "./fixtures/envelopes.js";
import type { City } from "../src/geo/cities.js";

const CITIES: City[] = [{ id: "1", name: "Mexico City", country: "MX", lat: 19.4326, lon: -99.1332, population: 9_000_000 }];
const qloo: QlooCaller = {
  async call(tool, args) {
    const envelope = tool === "qloo_describe" ? describeOk : tool === "qloo_where_popular" ? (args.within === "Mexico" ? heatMexico : cityHeat) : recs(["A"], [0.5]);
    return { envelope, cacheKey: "k", cached: false, stale: false };
  },
};
const app = createApp({ qloo, cities: CITIES, health: async () => ({ connected: true, ready: true }) });

describe("http", () => {
  it("healthz", async () => {
    expect((await request(app).get("/healthz")).body).toEqual({ connected: true, ready: true });
  });
  it("streams tour-board events as SSE", async () => {
    const res = await request(app).post("/v1/tour-board").set("x-session-id", "s").send({ artist: "Test Artist", regions: ["Mexico"], maxStops: 4 });
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.text).toContain("event: resolve");
    expect(res.text).toContain("event: done");
  });
  it("rejects a malformed brief with 400", async () => {
    const res = await request(app).post("/v1/tour-board").set("x-session-id", "s").send({ artist: "", regions: [] });
    expect(res.status).toBe(400);
  });
  it("requires a session id", async () => {
    expect((await request(app).post("/v1/tour-board").send({ artist: "x", regions: ["Mexico"], maxStops: 3 })).status).toBe(400);
  });
  it("tools endpoint validates via the caller", async () => {
    const bad: QlooCaller = { async call() { throw new Error("tool not allowlisted: qloo_api"); } };
    const res = await request(createApp({ qloo: bad, cities: CITIES, health: async () => ({ connected: true, ready: true }) }))
      .post("/v1/tools/qloo_api").set("x-session-id", "s").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not allowlisted");
  });
  it("aborts the pipeline when the client disconnects (Review Focus 3)", async () => {
    let calls = 0;
    const slow: QlooCaller = { async call(tool, args) { calls += 1; await new Promise((r) => setTimeout(r, 20)); return qloo.call(tool, args, "s"); } };
    const server = createApp({ qloo: slow, cities: CITIES, health: async () => ({ connected: true, ready: true }) }).listen(0);
    const port = (server.address() as { port: number }).port;
    const controller = new AbortController();
    const res = fetch(`http://127.0.0.1:${port}/v1/tour-board`, {
      method: "POST", signal: controller.signal, headers: { "content-type": "application/json", "x-session-id": "s" },
      body: JSON.stringify({ artist: "Test Artist", regions: ["Mexico"], maxStops: 4 }),
    }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 30));
    controller.abort();
    await res;
    const atAbort = calls;
    await new Promise((r) => setTimeout(r, 200));
    server.close();
    expect(calls - atAbort).toBeLessThanOrEqual(6); // at most one in-flight batch completes
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/http.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/http/app.ts` and `src/server.ts`**

`src/http/app.ts`:

```ts
import express, { type Response } from "express";
import type { City } from "../geo/cities.js";
import { runCityPlaybook } from "../pipeline/cityPlaybook.js";
import { runTourBoard } from "../pipeline/tourBoard.js";
import type { QlooCaller } from "../qlooCall.js";
import type { GatewayEvent } from "../types.js";

async function streamSse(res: Response, gen: AsyncGenerator<GatewayEvent>, controller: AbortController): Promise<void> {
  res.status(200).set({ "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  res.flushHeaders();
  res.on("close", () => controller.abort());
  for await (const event of gen) {
    if (controller.signal.aborted) break;
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  }
  res.end();
}

export function createApp(deps: { qloo: QlooCaller; cities: City[]; health: () => Promise<{ connected: boolean; ready: boolean }> }) {
  const app = express();
  app.use(express.json({ limit: "64kb" }));

  app.get("/healthz", async (_req, res) => { res.json(await deps.health()); });

  app.post("/v1/tour-board", async (req, res) => {
    const sessionId = req.header("x-session-id");
    const { artist, artistEntityId, regions, maxStops } = req.body ?? {};
    if (!sessionId) return void res.status(400).json({ error: "x-session-id header required" });
    if (typeof artist !== "string" || !artist.trim() || !Array.isArray(regions) || regions.length === 0 || regions.length > 6
      || !regions.every((r: unknown) => typeof r === "string" && r.trim()) || !Number.isInteger(maxStops) || maxStops < 1 || maxStops > 20) {
      return void res.status(400).json({ error: "artist, regions[1-6], maxStops[1-20] required" });
    }
    const controller = new AbortController();
    await streamSse(res, runTourBoard({
      artist: artist.trim(), ...(typeof artistEntityId === "string" && artistEntityId ? { artistEntityId } : {}),
      regions, maxStops, sessionId, today: new Date().toISOString().slice(0, 10),
    }, { qloo: deps.qloo, cities: deps.cities, signal: controller.signal }), controller);
  });

  app.get("/v1/city-playbook", async (req, res) => {
    const sessionId = req.header("x-session-id");
    const { artist, artistEntityId, city, country } = req.query;
    if (!sessionId || [artist, artistEntityId, city, country].some((v) => typeof v !== "string" || !v)) {
      return void res.status(400).json({ error: "x-session-id, artist, artistEntityId, city, country required" });
    }
    const controller = new AbortController();
    await streamSse(res, runCityPlaybook({ artist: String(artist), artistEntityId: String(artistEntityId), city: { name: String(city), country: String(country) }, sessionId },
      { qloo: deps.qloo, cities: deps.cities, signal: controller.signal }), controller);
  });

  app.post("/v1/tools/:name", async (req, res) => {
    const sessionId = req.header("x-session-id");
    if (!sessionId) return void res.status(400).json({ error: "x-session-id header required" });
    try {
      res.json(await deps.qloo.call(req.params.name, req.body ?? {}, sessionId));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  return app;
}
```

`src/server.ts`:

```ts
import { BigQuery } from "@google-cloud/bigquery";
import { BudgetGuard } from "./budget.js";
import { BigQueryCache, MemoryCache, type BigQueryLike } from "./cache.js";
import { loadCities } from "./geo/cities.js";
import { createApp } from "./http/app.js";
import { QlooMcpClient, defaultFactory } from "./mcpClient.js";
import { createQlooCaller } from "./qlooCall.js";

const mcp = new QlooMcpClient({ factory: defaultFactory });
const dataset = process.env.QLOO_CACHE_DATASET;
const cache = dataset ? new BigQueryCache({ bq: new BigQuery() as unknown as BigQueryLike, dataset }) : new MemoryCache();
const budget = new BudgetGuard({ perSession: 60, perDay: Number(process.env.QLOO_DAILY_CEILING ?? 2000) });
const app = createApp({ qloo: createQlooCaller({ mcp, cache, budget }), cities: loadCities(), health: () => mcp.health() });
const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => console.log(`qloo_gateway listening on ${port}`));
```

- [ ] **Step 4: Update spec §6.2** — replace the line `` - `POST /v1/resolve` `{choiceId}` → resumes after `needs_input`. `` with `` - After `needs_input`, the client re-submits `POST /v1/tour-board` with `artistEntityId` set to the chosen candidate (stateless). ``

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run test/http.test.ts && npm run typecheck`
Expected: PASS (6 tests); typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add cloud_run/qloo_gateway/src/http cloud_run/qloo_gateway/src/server.ts cloud_run/qloo_gateway/test/http.test.ts docs/superpowers/specs/2026-10-16-tour-intelligence-qloo-design.md
git commit -m "feat(gateway): HTTP API with SSE streaming, abort on disconnect, stateless needs_input"
```

---

### Task 12: Container + Cloud Run deployment

**Files:**
- Create: `cloud_run/qloo_gateway/Dockerfile`, `cloud_run/qloo_gateway/.dockerignore`, `cloud_run/qloo_gateway/scripts/deploy.sh`

**Interfaces:**
- Consumes: built `dist/` (T11).
- Produces: a private Cloud Run service `qloo-gateway` (URL recorded in `cloud_run/qloo_gateway/CLAUDE.md`), BigQuery dataset `tour_intelligence_qloo` with `qloo_cache`.

- [ ] **Step 1: Write the Dockerfile**

```dockerfile
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
RUN npm install --global @qloo/qloo-harness@^0.1.26 && qloo --version
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY data ./data
EXPOSE 8080
CMD ["node", "dist/server.js"]
```

`.dockerignore`:

```
node_modules
dist
test
scripts
*.md
```

Run: `docker build -t qloo-gateway cloud_run/qloo_gateway && docker run --rm qloo-gateway qloo --version`
Expected: build succeeds; prints a version ≥ 0.1.26.

- [ ] **Step 2: Local container smoke test (needs the Qloo key)**

Run (Prateek runs this so the key never enters the session): `! docker run --rm -e QLOO_API_KEY=$QLOO_API_KEY -p 8080:8080 qloo-gateway` in one terminal, then:
`curl -s localhost:8080/healthz`
Expected: `{"connected":true,"ready":true}`.

- [ ] **Step 3: Provision GCP resources** — `scripts/deploy.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
PROJECT=liifecalling-academy
REGION=us-central1
SA=qloo-gateway-sa@${PROJECT}.iam.gserviceaccount.com

gcloud iam service-accounts describe "$SA" --project "$PROJECT" >/dev/null 2>&1 || \
  gcloud iam service-accounts create qloo-gateway-sa --project "$PROJECT" --display-name "qloo_gateway"
bq --project_id "$PROJECT" show tour_intelligence_qloo >/dev/null 2>&1 || bq --project_id "$PROJECT" mk --location=US tour_intelligence_qloo
bq --project_id "$PROJECT" query --use_legacy_sql=false < "$(dirname "$0")/../../../bigquery/qloo_cache.sql"
gcloud secrets add-iam-policy-binding qloo-api-key --project "$PROJECT" --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor
gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" --role roles/bigquery.jobUser --condition=None
bq --project_id "$PROJECT" add-iam-policy-binding --member "serviceAccount:$SA" --role roles/bigquery.dataEditor tour_intelligence_qloo

gcloud run deploy qloo-gateway --source "$(dirname "$0")/.." --region "$REGION" --project "$PROJECT" \
  --service-account "$SA" --no-allow-unauthenticated --min-instances 1 --max-instances 3 --memory 1Gi \
  --set-secrets QLOO_API_KEY=qloo-api-key:latest --set-env-vars QLOO_CACHE_DATASET=tour_intelligence_qloo,QLOO_DAILY_CEILING=2000
```

Prerequisite (Prateek, once): `! printf '%s' "$QLOO_API_KEY" | gcloud secrets create qloo-api-key --data-file=- --project liifecalling-academy`
`roles/bigquery.jobUser` is project-level because BigQuery has no resource-level equivalent (per `cloud_run/CLAUDE.md`).

Run: `bash cloud_run/qloo_gateway/scripts/deploy.sh`
Expected: deploy succeeds and prints a service URL.

- [ ] **Step 4: Verify the deployed service**

Run: `curl -s -H "Authorization: Bearer $(gcloud auth print-identity-token)" <SERVICE_URL>/healthz` and `curl -s -o /dev/null -w "%{http_code}" <SERVICE_URL>/healthz`
Expected: `{"connected":true,"ready":true}` and `403` respectively.

- [ ] **Step 5: Record and commit**

Add the service URL and the verification commands to `cloud_run/qloo_gateway/CLAUDE.md` under "## Deployed". If `qloo mcp` fails on Cloud Run (spec §12 risk 3), record the error and fall back to a Compute Engine e2-small VM running the same container (`gcloud compute instances create-with-container`), noting it in the same section.

```bash
git add cloud_run/qloo_gateway/Dockerfile cloud_run/qloo_gateway/.dockerignore cloud_run/qloo_gateway/scripts/deploy.sh cloud_run/qloo_gateway/CLAUDE.md
git commit -m "chore(gateway): container image and Cloud Run deployment"
```

---

### Task 13: Data spike — record real envelopes, adjust extractors, tune scoring

**Prerequisite:** Qloo API key configured (`qloo setup --qloo` locally, or the deployed gateway). Run as soon as the key arrives; it may run in parallel with Tasks 6–11 and must complete before Plan 2 starts.

**Files:**
- Create: `cloud_run/qloo_gateway/scripts/spike.ts`, `test/fixtures/recorded/*.json`, `docs/superpowers/notes/2026-10-data-spike.md`
- Modify (only if shapes differ): `src/extract.ts`, `test/fixtures/envelopes.ts`; (only if tuning warrants) `src/scoring/*.ts` constants and `Global Constraints` values in this plan.

**Interfaces:**
- Consumes: `QlooMcpClient` (T2), extractors (T9).
- Produces: recorded fixtures named `<tool>__<slug>.json`; a notes file answering spec §12 items 1, 2 and 4.

- [ ] **Step 1: Write the spike script** — `scripts/spike.ts`

```ts
// Usage: npx tsx scripts/spike.ts "<artist>" "<region1>" "<region2>" ...
import { mkdirSync, writeFileSync } from "node:fs";
import { QlooMcpClient, defaultFactory } from "../src/mcpClient.js";

const [artist, ...regions] = process.argv.slice(2);
if (!artist || regions.length === 0) throw new Error("usage: spike.ts <artist> <region...>");
const mcp = new QlooMcpClient({ factory: defaultFactory });
const out = "test/fixtures/recorded";
mkdirSync(out, { recursive: true });
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
async function rec(tool: string, args: Record<string, unknown>, tag: string) {
  const env = await mcp.callTool(tool, args);
  writeFileSync(`${out}/${tool}__${slug(tag)}.json`, JSON.stringify(env, null, 2));
  console.log(tool, tag, env.status, Array.isArray(env.results) ? env.results.length : typeof env.results);
  return env;
}
await rec("qloo_describe", { entity: artist, type: "artist" }, artist);
for (const region of regions) await rec("qloo_where_popular", { entity: artist, entity_type: "artist", within: region, limit: 20 }, `${artist}-${region}`);
await rec("qloo_where_popular", { entity: artist, entity_type: "artist", within: regions.join(", "), limit: 20 }, `${artist}-pooled`);
const city = "Mexico City, Mexico";
for (const t of ["brand", "place", "movie", "artist"]) {
  const key = t === "place" ? "filter_location" : "signal_location";
  await rec("qloo_recommend", { target_type: t, signals: [artist], [key]: city, limit: 10 }, `${artist}-${t}-${city}`);
}
await rec("qloo_recommend", { target_type: "artist", signal_location: city, limit: 10 }, `city-mainstream-${city}`);
await rec("qloo_where_popular", { entity: artist, entity_type: "artist", within: city, limit: 20 }, `${artist}-zones-${city}`);
await rec("qloo_audience_demographics", { entity: artist, entity_type: "artist" }, artist);
await rec("qloo_entity_tags", { entities: [artist], entity_type: "artist" }, artist);
await rec("qloo_trends", { entities: [artist], entity_type: "artist", start_date: "2026-07-20", end_date: "2026-10-18" }, artist);
await rec("qloo_find_tags", { query: "live music venue" }, "live-music-venue");
await mcp.close();
```

Add `tsx` to devDependencies (`npm i -D tsx`).

- [ ] **Step 2: Run the spike for the showcase candidate and 3 controls**

Run (one at a time): `npx tsx scripts/spike.ts "<showcase artist>" "Mexico" "Brazil" "United States"`, then for three control artists of different scale (one global star, one mid-tier, one niche), same regions.
Expected: fixtures written; every call returns a non-error status (record any errors in the notes).

- [ ] **Step 3: Write a recorded-fixture regression test** — `test/recorded.test.ts`

```ts
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractEntities, extractHeatPoints } from "../src/extract.js";

const dir = "test/fixtures/recorded";
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

describe("recorded Qloo envelopes", () => {
  it.each(files.filter((f) => f.startsWith("qloo_where_popular")))("%s yields heat points", (f) => {
    const env = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
    if (env.status === "ok") expect(extractHeatPoints(env).length).toBeGreaterThan(0);
  });
  it.each(files.filter((f) => f.startsWith("qloo_recommend")))("%s yields entities with finite affinity", (f) => {
    const env = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
    if (env.status === "ok") {
      const e = extractEntities(env);
      expect(e.length).toBeGreaterThan(0);
      expect(e.every((x) => Number.isFinite(x.affinity))).toBe(true);
    }
  });
});
```

Run: `npx vitest run test/recorded.test.ts`
Expected: PASS. If it FAILS, inspect the failing fixture, fix `src/extract.ts` to the real shape, update `test/fixtures/envelopes.ts` to mirror it, re-run the full suite until green.

- [ ] **Step 4: Answer the open questions in `docs/superpowers/notes/2026-10-data-spike.md`**

Record, with numbers from the fixtures:
1. Coverage: heat point counts per region and per artist; recommend result counts per type in Mexico City; which regions/artists are thin.
2. Comparability: compare per-region affinities against the pooled call; decide `fanHeat` normalisation stays pooled min-max or switches to per-region (if switching, change `fanHeat` and its tests in the same commit).
3. City mainstream proxy: whether `recommend(artist, signal_location=city)` without an artist signal returns a usable mainstream set for the talent brief.
4. Affinity ranges observed (min/max) for heat and recommend — confirm 0–1; if not, add scaling in `extract.ts` with a test.
5. Showcase artist choice and why (rich data in all three regions, at least one Hidden goldmine verdict).
6. Final scoring constants (keep or change), with before/after verdicts for the four artists.

- [ ] **Step 5: Run the full suite and commit**

Run: `./run_tests.sh`
Expected: all PASS.

```bash
git add cloud_run/qloo_gateway docs/superpowers/notes
git commit -m "chore(gateway): data spike — recorded Qloo fixtures, extractor fixes, tuned scoring"
```

---

## Execution notes for the controller

- **Parallelisable:** after Task 1 lands, Tasks 2, 3, 4, 6, 7, 8 are independent and may run in parallel worktrees. Task 5 needs 2–4. Task 9 needs 5–7. Task 10 needs 9. Task 11 needs 9–10. Task 12 needs 11. Task 13 needs 2 + 9 and the key.
- **Every subagent prompt includes:** the spec path, this plan's Global Constraints, its own task text, and the instruction to use Graft (`graft_find_code`, `graft_file_api`, `graft_trace_calls`) before reading or editing existing files.
- **Review gates per task:** spec-compliance review, then code-quality review, then `./run_tests.sh` green, before marking complete.
