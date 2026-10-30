import { readFileSync } from "node:fs";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Analytics, BQ_SCHEMAS, BQ_TABLES, createAnalytics, sha256, type BqClientLike, type BqRow, type BqTable } from "../src/analytics/bigquery.js";
import { observePlaybook } from "../src/analytics/playbookLog.js";
import { createStats } from "../src/analytics/stats.js";
import { mountCollab } from "../src/collab/routes.js";
import { MemoryCollabStore } from "../src/collab/store.js";
import { createApp } from "../src/http/app.js";
import type { City } from "../src/geo/cities.js";
import type { GatewayEvent } from "../src/types.js";

interface Fake extends BqClientLike { inserts: Array<{ table: BqTable; rows: BqRow[] }>; queries: string[] }
function fake(over: { insert?: () => Promise<void>; query?: (sql: string) => Promise<Array<Record<string, unknown>>> } = {}): Fake {
  const f: Fake = {
    inserts: [], queries: [],
    async insert(table, rows) { f.inserts.push({ table, rows }); await over.insert?.(); },
    async query(sql) { f.queries.push(sql); return over.query ? over.query(sql) : []; },
  };
  return f;
}
const enabled = (client: BqClientLike, extra: Partial<ConstructorParameters<typeof Analytics>[0] & object> = {}) => new Analytics({ project: "p", dataset: "d", client, ...extra });
afterEach(() => { vi.useRealTimers(); });

describe("Analytics sink", () => {
  it("is disabled without BQ_DATASET or GOOGLE_CLOUD_PROJECT", () => {
    expect(createAnalytics({}).enabled).toBe(false);
    expect(createAnalytics({ BQ_DATASET: "d" }).enabled).toBe(false);
    expect(createAnalytics({ GOOGLE_CLOUD_PROJECT: "p" }).enabled).toBe(false);
    expect(createAnalytics({ BQ_DATASET: "bad name; drop", GOOGLE_CLOUD_PROJECT: "p" }).enabled).toBe(false);
    expect(createAnalytics({ BQ_DATASET: "tour_intel", GOOGLE_CLOUD_PROJECT: "p" }, { client: fake() }).enabled).toBe(true);
  });
  it("disabled track and query do nothing", async () => {
    const a = createAnalytics({});
    a.track("v2_outcome_taps", { action: "going" });
    await a.flush();
    await expect(a.query("select 1")).rejects.toThrow();
  });
  it("disabled track buffers nothing and schedules no timer", () => {
    vi.useFakeTimers();
    const a = createAnalytics({});
    for (let i = 0; i < 25; i++) a.track("v2_outcome_taps", { action: "going" });
    expect(vi.getTimerCount()).toBe(0);
    expect((a as unknown as { buffers: Map<string, unknown[]> }).buffers.size).toBe(0);
  });
  it("flushes at 20 rows", async () => {
    const c = fake();
    const a = enabled(c);
    for (let i = 0; i < 19; i++) a.track("v2_outcome_taps", { action: "going" });
    expect(c.inserts).toHaveLength(0);
    a.track("v2_outcome_taps", { action: "going" });
    await Promise.resolve();
    expect(c.inserts).toHaveLength(1);
    expect(c.inserts[0]!.rows).toHaveLength(20);
    expect(typeof c.inserts[0]!.rows[0]!.ts).toBe("string");
  });
  it("flushes after 5 seconds", async () => {
    vi.useFakeTimers();
    const c = fake();
    const a = enabled(c);
    a.track("team_events", { event: "status" });
    await vi.advanceTimersByTimeAsync(4999);
    expect(c.inserts).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2);
    expect(c.inserts).toHaveLength(1);
  });
  it("never throws or rejects when an insert fails, and logs at most once a minute", async () => {
    let t = 0;
    const log = vi.fn();
    const c = fake({ insert: async () => { throw new Error("boom"); } });
    const a = enabled(c, { now: () => t, log, maxBatch: 1 });
    expect(() => a.track("v2_outcome_taps", { action: "going" })).not.toThrow();
    a.track("v2_outcome_taps", { action: "going" });
    await a.flush();
    expect(log).toHaveBeenCalledTimes(1);
    t = 61_000;
    a.track("v2_outcome_taps", { action: "going" });
    await a.flush();
    expect(log).toHaveBeenCalledTimes(2);
  });
  it("schema JSON files used by bq_setup.sh match the schemas in code", () => {
    for (const t of BQ_TABLES) expect(JSON.parse(readFileSync(new URL(`../scripts/bq_schemas/${t}.json`, import.meta.url), "utf8"))).toEqual(BQ_SCHEMAS[t]);
    const script = readFileSync(new URL("../scripts/bq_setup.sh", import.meta.url), "utf8");
    expect(script).toContain("roles/bigquery.jobUser");
    expect(script).toContain("--time_partitioning_field=ts");
    for (const t of BQ_TABLES) expect(script).toContain(t);
    expect(readFileSync(new URL("../scripts/deploy.sh", import.meta.url), "utf8")).toContain("BQ_DATASET=");
  });
  it("no schema has a column that could hold Qloo data or free text", () => {
    const names = BQ_TABLES.flatMap((t) => BQ_SCHEMAS[t].map((f) => f.name));
    for (const bad of ["artist", "name", "text", "message", "entity", "entities", "affinity", "items"]) expect(names).not.toContain(bad);
  });
});

const evs = (list: GatewayEvent[]) => (async function* () { for (const e of list) yield e; })();
const drain = async (g: AsyncGenerator<GatewayEvent>) => { const out: GatewayEvent[] = []; for await (const e of g) out.push(e); return out; };
const card = (kind: string, status: "ok" | "empty", summary?: object) => ({ kind, status, items: [{ name: "Secret Qloo Name", affinity: 0.9 }], refs: [], warnings: [], ...(summary ? { summary } : {}) });
const claim = { text: "t", entities: [], numbers: [], evidence_refs: [] };

describe("observePlaybook", () => {
  const input = { sessionId: "sess-1", city: { id: "123", name: "Lima", country: "PE" }, narrative: true };
  const stream: GatewayEvent[] = [
    { type: "tool_call", tool: "qloo_recommend", args: { signals: ["Secret Artist"] }, cached: false },
    { type: "tool_call", tool: "qloo_recommend", args: {}, cached: true },
    { type: "playbook", playbook: { city: input.city, cards: [card("sponsors", "ok", { hiddenNonSponsors: 3 }), card("talent", "empty")] } },
    { type: "narrative", narrative: { status: "ok", model: "m", thoughtSummary: null, cached: false, merch: null, cards: { sponsors: { verified: [claim, claim], removed: [{ claim, reason: "no_refs", detail: "" }] } } } },
    { type: "done", summary: {} },
  ];
  it("passes events through unchanged and tracks one row of counts", async () => {
    const c = fake();
    const a = enabled(c);
    expect(await drain(observePlaybook(evs(stream), input, a, () => 1000))).toEqual(stream);
    await a.flush();
    expect(c.inserts).toHaveLength(1);
    const row = c.inserts[0]!.rows[0]!;
    expect(row).toMatchObject({ source: "live", city_id: "123", city: "Lima", country: "PE", cards_ok: 1, cards_empty: 1, claims_verified: 2, claims_removed: 1, sponsors_hidden: 3, qloo_calls: 2, cache_hits: 1, gemini_calls: null, verdict: null, narrative_status: "ok", error: null, session_hash: sha256("sess-1") });
    const json = JSON.stringify(row);
    for (const secret of ["Secret", "sess-1", "affinity"]) expect(json).not.toContain(secret);
  });
  it("marks public sessions and errors, and an abandoned stream as ABORTED", async () => {
    const c = fake();
    const a = enabled(c);
    await drain(observePlaybook(evs([{ type: "error", code: "BUDGET", message: "x" }]), { ...input, sessionId: "mcp-public-1" }, a));
    const g = observePlaybook(evs(stream), input, a);
    await g.next();
    await g.return(undefined);
    await a.flush();
    const rows = c.inserts.flatMap((i) => i.rows);
    expect(rows[0]).toMatchObject({ source: "mcp_public", error: "BUDGET" });
    expect(rows[1]).toMatchObject({ error: "ABORTED" });
  });
  it("records narrative=false as skipped, unavailable narrative by reason", async () => {
    const c = fake();
    const a = enabled(c);
    await drain(observePlaybook(evs([{ type: "done", summary: {} }]), { ...input, narrative: false }, a));
    await drain(observePlaybook(evs([{ type: "narrative", narrative: { status: "unavailable", reason: "capped", message: "m" } }, { type: "done", summary: {} }]), input, a));
    await a.flush();
    const rows = c.inserts.flatMap((i) => i.rows);
    expect(rows.map((r) => r.narrative_status)).toEqual(["skipped", "capped"]);
    expect(rows[1]!.claims_removed).toBeNull();
  });
  it("is a plain passthrough when analytics is off", async () => {
    const off = createAnalytics({});
    const track = vi.spyOn(off, "track");
    expect(await drain(observePlaybook(evs(stream), input, off))).toEqual(stream);
    expect(track).not.toHaveBeenCalled();
  });
});

describe("stats", () => {
  it("answers {enabled:false} when disabled and runs no query", async () => {
    const off = createAnalytics({});
    const query = vi.spyOn(off, "query");
    const s = createStats(off);
    expect(await s.trust()).toEqual({ enabled: false });
    expect(query).not.toHaveBeenCalled();
    expect(await s.team()).toEqual({ enabled: false });
    expect(await s.v2()).toEqual({ enabled: false });
  });
  it("trust: shapes one aggregate row, filters to the last 90 days and caches for 60 s", async () => {
    let t = 0;
    const c = fake({ query: async () => [{ since: { value: "2026-10-30T10:00:00.000Z" }, playbooks: 12, claims_checked: 100, claims_removed: 8, median_latency_ms: 4200, sponsors_hidden: 5, cities: 7, p24: 3, c24: 25 }] });
    const s = createStats(enabled(c), () => t);
    const r = await s.trust();
    expect(r).toEqual({ enabled: true, since: "2026-10-30T10:00:00.000Z", playbooks: 12, claimsChecked: 100, claimsRemoved: 8, removedRate: 0.08, medianLatencyMs: 4200, sponsorsHidden: 5, cities: 7, last24h: { playbooks: 3, claimsChecked: 25 } });
    expect(c.queries).toHaveLength(1);
    expect(c.queries[0]).toContain("INTERVAL 90 DAY");
    expect(c.queries[0]).toContain("`p.d.playbook_runs`");
    t = 59_000; await s.trust();
    expect(c.queries).toHaveLength(1);
    t = 61_000; await s.trust();
    expect(c.queries).toHaveLength(2);
  });
  it("trust with no rows: zeros and null rates", async () => {
    const s = createStats(enabled(fake({ query: async () => [{ since: null, playbooks: 0, claims_checked: null, claims_removed: null, median_latency_ms: null }] })));
    expect(await s.trust()).toMatchObject({ enabled: true, since: null, playbooks: 0, claimsChecked: 0, removedRate: null, medianLatencyMs: null });
  });
  it("a failing query answers {enabled:false}", async () => {
    const s = createStats(enabled(fake({ query: async () => { throw new Error("denied"); } }), { log: () => {} }));
    expect(await s.trust()).toEqual({ enabled: false });
  });
  it("team: groups the union rows", async () => {
    const c = fake({ query: async () => [
      { k: "total", g: "", n: 30, w: 4, since: "2026-10-01T00:00:00Z" },
      { k: "override", g: "top_zone", n: 3 }, { k: "override", g: "support", n: 1 },
      { k: "status", g: "confirmed", n: 5 }, { k: "status", g: "on_hold", n: 2 },
      { k: "role", g: "Manager", n: 7 }, { k: "role", g: "Promoter", n: 2 },
    ] });
    expect(await createStats(enabled(c)).team()).toEqual({
      enabled: true, since: "2026-10-01T00:00:00.000Z", workspaces: 4, events: 30, overridesByField: { top_zone: 3, best_room: 0, support: 1 }, overrideRate: 1,
      statusCounts: { Considering: 0, Confirmed: 5, "On hold": 2, Dropped: 0 }, notesByRole: { Manager: 7, "Booking agent": 0, Promoter: 2, "Brand team": 0, Other: 0 },
    });
  });
  it("v2: counts by action and experience", async () => {
    const c = fake({ query: async () => [
      { experience: "listening", action: "going", n: 12, since: "2026-10-30T00:00:00Z" }, { experience: "listening", action: "waitlist", n: 3, since: "2026-10-30T01:00:00Z" },
      { experience: "popup", action: "was_there", n: 5, since: "2026-10-30T02:00:00Z" }, { experience: "x", action: "bogus", n: 9, since: null },
    ] });
    expect(await createStats(enabled(c)).v2()).toEqual({
      enabled: true, since: "2026-10-30T00:00:00.000Z", taps: 20, byAction: { going: 12, waitlist: 3, was_there: 5 },
      byExperience: { listening: { going: 12, waitlist: 3, was_there: 0 }, popup: { going: 0, waitlist: 0, was_there: 5 } },
    });
  });
});

const CITIES: City[] = [{ id: "123", name: "Lima", country: "PE", lat: 0, lon: 0, population: 1 }];
const qloo = { async call() { throw new Error("unused"); } };
const health = async () => ({ connected: true, ready: true });

describe("http routes", () => {
  it("stats routes answer {enabled:false} by default", async () => {
    const app = createApp({ qloo, cities: CITIES, health });
    for (const p of ["trust", "team", "v2"]) expect((await request(app).get(`/v1/stats/${p}`)).body).toEqual({ enabled: false });
  });
  it("tap: validates, answers enabled:false when off, logs a hashed row when on, rate limits 10 a minute", async () => {
    const off = createApp({ qloo, cities: CITIES, health });
    expect((await request(off).post("/v1/v2/tap").set("x-session-id", "s").send({ action: "going" })).body).toEqual({ enabled: false });
    const c = fake();
    const a = enabled(c);
    const app = createApp({ qloo, cities: CITIES, health, analytics: a });
    expect((await request(app).post("/v1/v2/tap").send({ action: "going" })).status).toBe(400);
    expect((await request(app).post("/v1/v2/tap").set("x-session-id", "s").send({ action: "nope" })).status).toBe(400);
    expect((await request(app).post("/v1/v2/tap").set("x-session-id", "s").send({ action: "going", experience: "Bad Id!" })).status).toBe(400);
    const ok = await request(app).post("/v1/v2/tap").set("x-session-id", "s").send({ action: "going", experience: "popup" });
    expect(ok.status).toBe(202);
    for (let i = 0; i < 9; i++) expect((await request(app).post("/v1/v2/tap").set("x-session-id", "s").send({ action: "waitlist" })).status).toBe(202);
    expect((await request(app).post("/v1/v2/tap").set("x-session-id", "s").send({ action: "waitlist" })).status).toBe(429);
    await a.flush();
    const rows = c.inserts.flatMap((i) => i.rows);
    expect(rows).toHaveLength(10);
    expect(rows[0]).toMatchObject({ session_hash: sha256("s"), experience: "popup", action: "going" });
    expect(rows[1]).toMatchObject({ experience: "listening_session" });
  });
  it("city-playbook logs one row when analytics is on and still streams", async () => {
    const c = fake();
    const a = enabled(c);
    const app = createApp({ qloo, cities: CITIES, health, analytics: a });
    const res = await request(app).get("/v1/city-playbook").set("x-session-id", "s").query({ artist: "A", artistEntityId: "E", city: "Lima", country: "PE", cityId: "123", narrative: "0" });
    expect(res.headers["content-type"]).toContain("text/event-stream");
    await a.flush();
    const rows = c.inserts.flatMap((i) => i.rows);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ city: "Lima", city_id: "123", country: "PE", narrative_status: "skipped" });
    expect(JSON.stringify(rows)).not.toContain('"A"');
  });
});

describe("collab events", () => {
  const me = { name: "Sam", role: "Manager" };
  function setup(seeded = false) {
    const c = fake();
    const a = enabled(c);
    const app = express();
    app.use(express.json());
    let n = 0;
    mountCollab(app, { store: new MemoryCollabStore(), analytics: a, cityOf: (id) => (id === "123" ? { name: "Lima", country: "PE" } : undefined), newId: () => `ws${String((n += 1)).padStart(10, "0")}` });
    const create = async () => (await request(app).post("/v1/ws").set("x-session-id", "s1").send(seeded ? { seed: { statuses: [{ cityId: "123", status: "confirmed", agoMin: 5, ...me }], threads: [{ key: "city:123", messages: [{ ...me, text: "seed note", agoMin: 4 }] }], overrides: [{ cityId: "123", field: "top_zone", value: "x", original: "y", agoMin: 3, ...me }], leads: [{ cityId: "123", text: "seed lead", agoMin: 2, ...me }] } } : {})).body.ws as string;
    const post = (ws: string, path: string, body: object) => request(app).post(`/v1/ws/${ws}/${path}`).set("x-session-id", "s1").send(body);
    const rows = async () => { await a.flush(); return c.inserts.flatMap((i) => i.rows); };
    return { create, post, rows };
  }
  it("logs a row per real write with no text or names", async () => {
    const { create, post, rows } = setup();
    const ws = await create();
    await post(ws, "status", { ...me, cityId: "123", status: "confirmed" });
    await post(ws, "message", { ...me, key: "card:123:sponsors", text: "private note text" });
    await post(ws, "override", { ...me, cityId: "123", field: "top_zone", value: "Barranco", original: "Miraflores" });
    await post(ws, "override", { ...me, cityId: "123", field: "support", value: "Local band" });
    await post(ws, "override/clear", { ...me, cityId: "123", field: "support" });
    await post(ws, "lead", { ...me, cityId: "123", text: "secret lead" });
    await post(ws, "message", { ...me, key: "city:123", text: "second" });
    await post(ws, "resolve", { ...me, key: "city:123", resolved: true });
    await post(ws, "resolve", { ...me, key: "city:123", resolved: false });
    const r = await rows();
    expect(r.map((x) => x.event)).toEqual(["status", "message", "override", "override", "override_clear", "lead", "message", "resolve"]);
    expect(r[0]).toMatchObject({ ws_hash: sha256(ws), city_id: "123", city: "Lima", country: "PE", role: "Manager", status_to: "confirmed" });
    expect(r[1]).toMatchObject({ card_kind: "sponsors", city_id: "123" });
    expect(r[2]).toMatchObject({ override_field: "top_zone", overrode_qloo: true });
    expect(r[3]).toMatchObject({ override_field: "support", overrode_qloo: false });
    const json = JSON.stringify(r);
    for (const secret of ["private note", "secret lead", "Sam", "Barranco", "Miraflores", ws]) expect(json).not.toContain(secret);
  });
  it("creating a workspace with a demo seed logs nothing", async () => {
    const { create, rows } = setup(true);
    await create();
    expect(await rows()).toEqual([]);
  });
  it("a failed write logs nothing", async () => {
    const { create, post, rows } = setup();
    const ws = await create();
    expect((await post(ws, "status", { ...me, cityId: "123", status: "bogus" })).status).toBe(400);
    expect(await rows()).toEqual([]);
  });
  it("a throwing analytics never breaks the write", async () => {
    const c = fake({ insert: async () => { throw new Error("x"); } });
    const a = enabled(c, { log: () => {}, maxBatch: 1 });
    const app = express(); app.use(express.json());
    mountCollab(app, { store: new MemoryCollabStore(), analytics: a, newId: () => "ws00000001" });
    const ws = (await request(app).post("/v1/ws").set("x-session-id", "s").send({})).body.ws;
    expect((await request(app).post(`/v1/ws/${ws}/status`).set("x-session-id", "s").send({ ...me, cityId: "1", status: "confirmed" })).status).toBe(200);
  });
});
