import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { applyOp, emptyDoc, LIMITS, seedDoc, toSnapshot, WS_ID } from "../src/collab/model.js";
import { mountCollab } from "../src/collab/routes.js";
import { FirestoreCollabStore, MemoryCollabStore } from "../src/collab/store.js";
import { WindowLimiter } from "../src/collab/limits.js";
import type { TxDb } from "../src/web/usage.js";
import { createApp } from "../src/http/app.js";

const me = { name: "Sam", role: "Manager" };
const SID = { "x-session-id": "s1" };

function setup(over: Partial<Parameters<typeof mountCollab>[1]> = {}) {
  let t = 1_700_000_000_000;
  const store = new MemoryCollabStore(() => t);
  const app = express();
  app.use(express.json({ limit: "64kb" }));
  let n = 0;
  mountCollab(app, { store, now: () => t, newId: () => `ws${String((n += 1)).padStart(10, "0")}`, ...over });
  return { app, store, advance: (ms: number) => { t += ms; } };
}
const create = async (app: express.Express, body: unknown = {}) => (await request(app).post("/v1/ws").set(SID).send(body as object)).body as { ws: string };
const post = (app: express.Express, ws: string, path: string, body: object, sid = "s1") => request(app).post(`/v1/ws/${ws}/${path}`).set("x-session-id", sid).send(body);

describe("collab model", () => {
  it("ws id format", () => {
    expect(WS_ID.test("abcdefghij")).toBe(true);
    expect(WS_ID.test("short")).toBe(false);
    expect(WS_ID.test("has space in it")).toBe(false);
  });
  it("ws id bounds and alphabet: 10 to 64 of A-Z a-z 0-9 _ -, nothing path-like", () => {
    expect(WS_ID.test("a".repeat(9))).toBe(false);
    expect(WS_ID.test("a".repeat(10))).toBe(true);
    expect(WS_ID.test("a".repeat(64))).toBe(true);
    expect(WS_ID.test("a".repeat(65))).toBe(false);
    for (const bad of ["abcde.fghij", "abcde/fghij", "abcde%2Ffghij", "..abcdefghij", "abcdefghi\n"]) expect(WS_ID.test(bad), bad).toBe(false);
    expect(WS_ID.test("Ab_-0123456789")).toBe(true);
  });
  it("accepts text of exactly the cap and rejects one over", () => {
    const d = emptyDoc(0);
    expect(() => applyOp(d, "message", { ...me, key: "city:1", text: "x".repeat(LIMITS.text) }, 1)).not.toThrow();
    expect(() => applyOp(d, "message", { ...me, key: "city:1", text: "x".repeat(LIMITS.text + 1) }, 1)).toThrow(/over 1000/);
  });
  it("rejects bad names, roles and text", () => {
    const d = emptyDoc(0);
    const m = (b: object) => () => applyOp(d, "message", { key: "city:1", ...b }, 1);
    expect(m({ ...me, text: "" })).toThrow(/empty/);
    expect(m({ ...me, text: "x".repeat(1001) })).toThrow(/over 1000/);
    expect(m({ name: "n".repeat(41), role: "Manager", text: "a" })).toThrow(/name/);
    expect(m({ name: "A", role: "Admin", text: "a" })).toThrow(/role/);
    expect(m({ ...me, text: "a\u0000b" })).toThrow(/control/);
    expect(() => applyOp(d, "message", { ...me, key: "bogus", text: "a" }, 1)).toThrow(/thread key/);
  });
  it("stores HTML-looking text verbatim as plain text", () => {
    const d = applyOp(emptyDoc(0), "message", { ...me, key: "city:1", text: "<b>hi</b> @Manager" }, 1);
    expect(d.threads["city:1"]!.messages[0]!.text).toBe("<b>hi</b> @Manager");
  });
  it("caps messages at 500 and activity at 200", () => {
    let d = emptyDoc(0);
    for (let i = 0; i < LIMITS.messages; i += 1) d = applyOp(d, "message", { ...me, key: `card:1:k${"a".repeat(i % 5 + 1)}`.replace(/\d/g, "1"), text: `m${i}` }, i);
    expect(d.activity).toHaveLength(LIMITS.activity);
    expect(() => applyOp(d, "message", { ...me, key: "city:1", text: "one more" }, 9)).toThrow(/full of notes/);
  });
  it("a new message reopens a resolved thread; resolve needs a thread", () => {
    let d = applyOp(emptyDoc(0), "message", { ...me, key: "city:1", text: "a" }, 1);
    d = applyOp(d, "resolve", { ...me, key: "city:1", resolved: true }, 2);
    expect(d.threads["city:1"]!.resolved).toBe(true);
    d = applyOp(d, "message", { ...me, key: "city:1", text: "b" }, 3);
    expect(d.threads["city:1"]!.resolved).toBe(false);
    expect(() => applyOp(d, "resolve", { ...me, key: "city:9", resolved: true }, 4)).toThrow(/No such thread/);
  });
  it("override keeps the first Qloo original across edits; clear removes it", () => {
    let d = applyOp(emptyDoc(0), "override", { ...me, cityId: "1", field: "best_room", value: "The Fonda", original: "Wiltern" }, 1);
    d = applyOp(d, "override", { ...me, cityId: "1", field: "best_room", value: "Roxy", original: "The Fonda" }, 2);
    expect(d.overrides["1"]!.best_room).toMatchObject({ value: "Roxy", original: "Wiltern" });
    d = applyOp(d, "override_clear", { ...me, cityId: "1", field: "best_room" }, 3);
    expect(d.overrides).toEqual({});
    expect(() => applyOp(d, "override_clear", { ...me, cityId: "1", field: "best_room" }, 4)).toThrow(/No such override/);
  });
  it("leads add and remove", () => {
    let d = applyOp(emptyDoc(0), "lead", { ...me, cityId: "1", text: "Stüssy" }, 1);
    const id = d.leads["1"]![0]!.id;
    d = applyOp(d, "lead_remove", { ...me, cityId: "1", id }, 2);
    expect(d.leads).toEqual({});
    expect(() => applyOp(d, "lead_remove", { ...me, cityId: "1", id }, 3)).toThrow(/No such lead/);
  });
  it("seed marks everything demo, plays out in time order and validates shape", () => {
    const d = seedDoc({
      statuses: [{ cityId: "1", status: "confirmed", name: "Maya", role: "Manager", agoMin: 60 }],
      threads: [
        { key: "city:1", resolved: { name: "Maya", role: "Manager", agoMin: 20 }, messages: [{ name: "Leo", role: "Booking agent", text: "hold?", agoMin: 30 }] },
        { key: "tour:board", messages: [{ name: "Maya", role: "Manager", text: "hi", agoMin: 90 }] },
      ],
      overrides: [{ cityId: "1", field: "best_room", value: "B", original: "A", name: "Maya", role: "Manager", agoMin: 40 }],
      leads: [{ cityId: "1", text: "X", name: "Priya", role: "Brand team", agoMin: 5 }],
    }, 1_000_000_000);
    expect(d.statuses["1"]!.demo).toBe(true);
    expect(d.threads["city:1"]).toMatchObject({ resolved: true });
    expect(d.threads["city:1"]!.messages[0]!.demo).toBe(true);
    expect(d.overrides["1"]!.best_room).toMatchObject({ value: "B", original: "A", demo: true });
    expect(d.leads["1"]![0]!.demo).toBe(true);
    const s = toSnapshot("w", d);
    expect(s.activity.map((e) => e.type)).toEqual(["lead", "resolve", "message", "override", "status", "message"]);
    expect(s.activity.every((e, i, a) => i === 0 || a[i - 1]!.at >= e.at)).toBe(true);
    expect(s.activity.every((e) => e.demo)).toBe(true);
    expect(() => seedDoc({ threads: "x" }, 0)).toThrow(/seed\.threads/);
    expect(() => seedDoc({ statuses: new Array(13).fill({ cityId: "1", status: "dropped", ...me }) }, 0)).toThrow(/at most/);
  });
  it("seeds a full demo discussion (tens of messages) under the document cap", () => {
    const messages = Array.from({ length: 60 }, (_, i) => ({ name: "Leo", role: "Booking agent", text: "t".repeat(180), agoMin: 4000 - i * 10 }));
    const d = seedDoc({ threads: [{ key: "tour:board", messages: messages.slice(0, 30) }, { key: "city:2", messages: messages.slice(30) }] }, 1_000_000_000);
    expect(Object.values(d.threads).reduce((n, t) => n + t.messages.length, 0)).toBe(60);
  });
});

describe("collab routes", () => {
  it("creates a workspace with an unguessable id and returns a snapshot", async () => {
    const { app } = setup({ newId: undefined });
    const r = await request(app).post("/v1/ws").set(SID).send({});
    expect(r.status).toBe(201);
    expect(r.body.ws).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(r.body.snapshot).toMatchObject({ ws: r.body.ws, statuses: {}, threads: {}, overrides: {}, leads: {}, activity: [] });
  });
  it("needs x-session-id and a valid seed", async () => {
    const { app } = setup();
    expect((await request(app).post("/v1/ws").send({})).status).toBe(400);
    expect((await request(app).post("/v1/ws").set(SID).send({ seed: { threads: 5 } })).status).toBe(400);
  });
  it("snapshot: 400 bad id, 404 unknown, 200 with the full shape", async () => {
    const { app } = setup();
    expect((await request(app).get("/v1/ws/short")).status).toBe(400);
    expect((await request(app).get("/v1/ws/abcdefghijklmnop")).status).toBe(404);
    const { ws } = await create(app);
    const r = await request(app).get(`/v1/ws/${ws}`);
    expect(Object.keys(r.body).sort()).toEqual(["activity", "createdAt", "leads", "overrides", "rev", "statuses", "threads", "ws"]);
  });
  it("runs each operation and shows newest-first activity", async () => {
    const { app, advance } = setup();
    const { ws } = await create(app);
    let r = await post(app, ws, "status", { ...me, cityId: "5368361", status: "confirmed" });
    expect(r.body.statuses["5368361"]).toMatchObject({ status: "confirmed", name: "Sam", role: "Manager" });
    advance(1000);
    r = await post(app, ws, "message", { ...me, key: "card:5368361:sponsors", text: "Hello" });
    expect(r.body.threads["card:5368361:sponsors"].messages).toHaveLength(1);
    r = await post(app, ws, "resolve", { ...me, key: "card:5368361:sponsors", resolved: true });
    expect(r.body.threads["card:5368361:sponsors"].resolved).toBe(true);
    r = await post(app, ws, "resolve", { ...me, key: "card:5368361:sponsors", resolved: false });
    expect(r.body.threads["card:5368361:sponsors"].resolved).toBe(false);
    r = await post(app, ws, "override", { ...me, cityId: "5368361", field: "top_zone", value: "Silver Lake", original: "Echo Park" });
    expect(r.body.overrides["5368361"].top_zone.original).toBe("Echo Park");
    r = await post(app, ws, "override/clear", { ...me, cityId: "5368361", field: "top_zone" });
    expect(r.body.overrides).toEqual({});
    r = await post(app, ws, "lead", { ...me, cityId: "5368361", text: "Stüssy" });
    const id = r.body.leads["5368361"][0].id as string;
    r = await post(app, ws, "lead/remove", { ...me, cityId: "5368361", id });
    expect(r.body.leads).toEqual({});
    expect(r.body.activity.map((e: { type: string }) => e.type)).toEqual(["lead_remove", "lead", "override_clear", "override", "reopen", "resolve", "message", "status"]);
    expect(r.body.rev).toBe(8);
  });
  it("404 for unknown ws and expired ws; 400 for bad body", async () => {
    const { app, advance } = setup();
    expect((await post(app, "abcdefghijklmnop", "status", { ...me, cityId: "1", status: "dropped" })).status).toBe(404);
    const { ws } = await create(app);
    expect((await post(app, ws, "status", { ...me, cityId: "1", status: "bogus" })).status).toBe(400);
    expect((await request(app).post(`/v1/ws/${ws}/status`).set(SID).send([1])).status).toBe(400);
    advance(31 * 86_400_000);
    expect((await request(app).get(`/v1/ws/${ws}`)).status).toBe(404);
  });
  it("writes need an x-session-id of 1 to 128 characters", async () => {
    const { app } = setup();
    const { ws } = await create(app);
    const body = { ...me, key: "city:1", text: "hi" };
    expect((await request(app).post(`/v1/ws/${ws}/message`).send(body)).status).toBe(400);
    expect((await post(app, ws, "message", body, "s".repeat(129))).status).toBe(400);
    expect((await post(app, ws, "message", body, "s".repeat(128))).status).toBe(200);
  });
  it("sets expiresAt 30 days after createdAt", async () => {
    const { app, store } = setup();
    const { ws } = await create(app);
    const d = (await store.get(ws))!;
    expect(d.expiresAt.getTime() - d.createdAt.getTime()).toBe(30 * 86_400_000);
  });
  it("rate limits writes per workspace and per session, and creates per session", async () => {
    const a = setup({ wsWritesPerMin: 3 });
    const { ws } = await create(a.app);
    const codes: number[] = [];
    for (let i = 0; i < 5; i += 1) codes.push((await post(a.app, ws, "message", { ...me, key: "city:1", text: `m${i}` })).status);
    expect(codes).toEqual([200, 200, 200, 429, 429]);
    a.advance(61_000);
    expect((await post(a.app, ws, "message", { ...me, key: "city:1", text: "later" })).status).toBe(200);
    const b = setup({ sessionWritesPerMin: 2 });
    const w2 = (await create(b.app)).ws;
    expect((await post(b.app, w2, "status", { ...me, cityId: "1", status: "dropped" }, "other")).status).toBe(200);
    await post(b.app, w2, "status", { ...me, cityId: "1", status: "dropped" });
    await post(b.app, w2, "status", { ...me, cityId: "1", status: "dropped" });
    expect((await post(b.app, w2, "status", { ...me, cityId: "1", status: "dropped" })).status).toBe(429);
    const c = setup({ createsPerHour: 2 });
    await create(c.app); await create(c.app);
    expect((await request(c.app).post("/v1/ws").set(SID).send({})).status).toBe(429);
  });
  it("answers 409 when the notes cap is reached", async () => {
    const { app, store } = setup({ wsWritesPerMin: 10_000, sessionWritesPerMin: 10_000 });
    const { ws } = await create(app);
    await store.update(ws, (d) => { d.threads["city:1"] = { resolved: false, messages: Array.from({ length: LIMITS.messages }, (_, i) => ({ id: `m${i}`, ...me, role: "Manager" as const, text: "x", at: 1 })) }; return d; }, 0);
    const r = await post(app, ws, "message", { ...me, key: "city:1", text: "x" });
    expect(r.status).toBe(409);
  });
  it("a failed write leaves the stored doc untouched", async () => {
    const { app, store } = setup();
    const { ws } = await create(app);
    await post(app, ws, "message", { ...me, key: "city:1", text: "" });
    expect((await store.get(ws))!.rev).toBe(0);
  });
  it("is mounted by createApp only when given a store", async () => {
    const base = { qloo: { call: async () => ({}) } as never, cities: [], health: async () => ({ connected: true, ready: true }) };
    expect((await request(createApp(base)).get("/v1/ws/abcdefghijklmnop")).status).toBe(404);
    const app = createApp({ ...base, collab: { store: new MemoryCollabStore() } });
    expect((await request(app).post("/v1/ws").set(SID).send({})).status).toBe(201);
  });
});

describe("limiter and firestore store", () => {
  it("window limiter slides", () => {
    let t = 0;
    const l = new WindowLimiter(2, 1000, () => t);
    expect([l.take("a"), l.take("a"), l.take("a"), l.take("b")]).toEqual([true, true, false, true]);
    t = 1001;
    expect(l.take("a")).toBe(true);
  });
  it("firestore store round-trips through a transaction and treats expired docs as missing", async () => {
    const docs = new Map<string, Record<string, unknown>>();
    const db: TxDb = {
      doc: (path) => ({ path }),
      async runTransaction(fn) { return fn({ async get(r) { const d = docs.get((r as { path: string }).path); return { exists: !!d, data: () => d }; }, set(r, data) { docs.set((r as { path: string }).path, data); } }); },
    };
    const s = new FirestoreCollabStore({ db });
    const doc = emptyDoc(Date.now());
    expect(await s.create("abcdefghij", doc)).toBe(true);
    expect(await s.create("abcdefghij", doc)).toBe(false);
    const got = await s.update("abcdefghij", (d) => applyOp(d, "status", { ...me, cityId: "1", status: "on_hold" }, Date.now()), Date.now());
    expect(got!.statuses["1"]!.status).toBe("on_hold");
    expect(docs.get("collab_workspaces/abcdefghij")!.expiresAt).toBeInstanceOf(Date);
    docs.set("collab_workspaces/old", { ...doc, expiresAt: { toDate: () => new Date(1) }, createdAt: { toDate: () => new Date(0) } });
    expect(await s.get("old")).toBeNull();
    expect(await s.update("missing12345", (d) => d, 1)).toBeNull();
  });
});
