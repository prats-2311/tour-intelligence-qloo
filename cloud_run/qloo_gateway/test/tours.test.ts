import { createHash } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { mountTours, TOURS_JSON_LIMIT } from "../src/tours/routes.js";
import { FirestoreToursStore, MemoryToursStore, type FsLike } from "../src/tours/store.js";
import { foldText } from "../src/tours/model.js";
import { createApp } from "../src/http/app.js";

const DAY = 86_400_000;
function setup(over: Partial<Parameters<typeof mountTours>[1]> = {}) {
  let t = 1_700_000_000_000;
  const store = new MemoryToursStore();
  const app = express();
  app.use("/v1/tours", express.json({ limit: TOURS_JSON_LIMIT }));
  app.use(express.json({ limit: "64kb" }));
  let n = 0;
  mountTours(app, { store, now: () => t, newId: () => `tour${String((n += 1)).padStart(12, "0")}`, ...over });
  return { app, store, advance: (ms: number) => { t += ms; }, now: () => t };
}
type App = ReturnType<typeof setup>["app"];
const SID = { "x-session-id": "s1" };
const owner = async (app: App, sid = "s1", extra: Record<string, string> = {}) => ((await request(app).post("/v1/owners").set("x-session-id", sid).set(extra).send({})).body as { ownerToken: string }).ownerToken;
const summary = (over: Record<string, unknown> = {}) => ({ artist: "Bad Bunny", regions: ["Latin America"], cities: [{ id: "sp", name: "São Paulo", country: "Brazil", verdict: "book", score: 91 }, { id: "mx", name: "Mexico City", country: "Mexico" }], ...over });
const create = (app: App, tok: string, body: Record<string, unknown> = {}) => request(app).post("/v1/tours").set("x-tiq-owner", tok).send({ summary: summary(), run: { a: 1 }, ...body });

describe("owners", () => {
  it("creates an owner: 201 with a 43-char base64url token, only sha256(token) stored", async () => {
    const { app, store } = setup();
    const res = await request(app).post("/v1/owners").set(SID).send({});
    expect(res.status).toBe(201);
    const tok = res.body.ownerToken as string;
    expect(tok).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const hash = createHash("sha256").update(tok).digest("hex");
    expect(await store.getOwner(hash)).toMatchObject({ createdAt: expect.any(Date), lastSeenAt: expect.any(Date) });
    expect(JSON.stringify(store.dump())).not.toContain(tok);
  });
  it("401 without or with an unknown token on every tours route", async () => {
    const { app } = setup();
    for (const r of [request(app).get("/v1/tours"), request(app).post("/v1/tours").send({}), request(app).get("/v1/tours/abcdefghijklmnop"), request(app).patch("/v1/tours/abcdefghijklmnop").send({}), request(app).delete("/v1/tours/abcdefghijklmnop")]) {
      const res = await r; expect(res.status).toBe(401); expect(res.body).toEqual({ error: "owner required" });
    }
    const bad = await request(app).get("/v1/tours").set("x-tiq-owner", "nope");
    expect(bad.status).toBe(401);
  });
  it("429 after 20 owners per session per hour; other sessions unaffected", async () => {
    const { app, advance } = setup();
    for (let i = 0; i < 20; i++) expect((await request(app).post("/v1/owners").set(SID).send({})).status).toBe(201);
    expect((await request(app).post("/v1/owners").set(SID).send({})).status).toBe(429);
    expect((await request(app).post("/v1/owners").set("x-session-id", "s2").send({})).status).toBe(201);
    advance(3_600_001);
    expect((await request(app).post("/v1/owners").set(SID).send({})).status).toBe(201);
  });
  it("lastSeenAt is refreshed at most once per hour", async () => {
    const { app, store, advance, now } = setup();
    const tok = await owner(app);
    const hash = createHash("sha256").update(tok).digest("hex");
    const first = (await store.getOwner(hash))!.lastSeenAt.getTime();
    advance(10 * 60_000);
    await request(app).get("/v1/tours").set("x-tiq-owner", tok);
    expect((await store.getOwner(hash))!.lastSeenAt.getTime()).toBe(first);
    advance(61 * 60_000);
    await request(app).get("/v1/tours").set("x-tiq-owner", tok);
    expect((await store.getOwner(hash))!.lastSeenAt.getTime()).toBe(now());
  });
  it("marks test traffic on the owner", async () => {
    const { app, store } = setup();
    const tok = await owner(app, "e2e-abc");
    expect((await store.getOwner(createHash("sha256").update(tok).digest("hex")))!.test).toBe(true);
    const tok2 = await owner(app, "real", { "x-tiq-test": "1" });
    expect((await store.getOwner(createHash("sha256").update(tok2).digest("hex")))!.test).toBe(true);
    const tok3 = await owner(app, "real");
    expect((await store.getOwner(createHash("sha256").update(tok3).digest("hex")))!.test).toBeUndefined();
  });
});

describe("tours CRUD", () => {
  it("round trip create / list / get / patch / delete", async () => {
    const { app, advance, store } = setup();
    const tok = await owner(app);
    const c = await create(app, tok, { run: { board: [1, 2, 3], note: "ünï" } });
    expect(c.status).toBe(201);
    expect(c.body).toEqual({ id: "tour000000000001", updatedAt: 1_700_000_000_000 });
    const list = await request(app).get("/v1/tours").set("x-tiq-owner", tok);
    expect(list.body.tours).toHaveLength(1);
    expect(list.body.tours[0]).toMatchObject({ id: c.body.id, title: "Bad Bunny · São Paulo, Mexico City", status: "draft", artist: "Bad Bunny", regions: ["Latin America"], createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000, runBytes: expect.any(Number) });
    expect(list.body.tours[0]).not.toHaveProperty("run");
    const got = await request(app).get(`/v1/tours/${c.body.id}`).set("x-tiq-owner", tok);
    expect(got.status).toBe(200);
    expect(got.body.run).toEqual({ board: [1, 2, 3], note: "ünï" });
    expect(got.body.cities[0]).toMatchObject({ id: "sp", verdict: "book", score: 91 });
    // chunks are ASCII-only (non-ASCII is \\u-escaped) so 700,000 chars never exceed Firestore's 1 MiB document limit
    expect((await store.readChunks(c.body.id)).join("")).toMatch(/^[\x00-\x7f]*$/);
    advance(5000);
    const p = await request(app).patch(`/v1/tours/${c.body.id}`).set("x-tiq-owner", tok).send({ title: "Final", status: "final", run: { x: 2 } });
    expect(p.status).toBe(200);
    expect(p.body).toEqual({ id: c.body.id, updatedAt: 1_700_000_005_000 });
    const got2 = await request(app).get(`/v1/tours/${c.body.id}`).set("x-tiq-owner", tok);
    expect(got2.body).toMatchObject({ title: "Final", status: "final", run: { x: 2 }, createdAt: 1_700_000_000_000 });
    expect((await request(app).delete(`/v1/tours/${c.body.id}`).set("x-tiq-owner", tok)).status).toBe(204);
    expect((await request(app).get(`/v1/tours/${c.body.id}`).set("x-tiq-owner", tok)).status).toBe(404);
    expect((await request(app).get("/v1/tours").set("x-tiq-owner", tok)).body.tours).toEqual([]);
  });
  it("lists newest updated first", async () => {
    const { app, advance } = setup();
    const tok = await owner(app);
    const a = (await create(app, tok)).body.id; advance(1000);
    const b = (await create(app, tok)).body.id; advance(1000);
    await request(app).patch(`/v1/tours/${a}`).set("x-tiq-owner", tok).send({ title: "bump" });
    const ids = (await request(app).get("/v1/tours").set("x-tiq-owner", tok)).body.tours.map((x: { id: string }) => x.id);
    expect(ids).toEqual([a, b]);
  });
  it("chunks a 1.6M-char run into 3 chunks of at most 700,000 chars and reassembles it identically", async () => {
    const { app, store } = setup();
    const tok = await owner(app);
    const run = { blob: "e".repeat(1_600_000 - 11) };
    const serialized = JSON.stringify(run);
    expect(serialized.length).toBe(1_600_000);
    const c = await create(app, tok, { run });
    expect(c.status).toBe(201);
    const chunks = await store.readChunks(c.body.id);
    expect(chunks.map((x) => x.length)).toEqual([700_000, 700_000, 200_000]);
    expect(chunks.join("")).toBe(serialized);
    const got = await request(app).get(`/v1/tours/${c.body.id}`).set("x-tiq-owner", tok);
    expect(got.body.run).toEqual(run);
    expect((await store.getTour(c.body.id))!.chunkCount).toBe(3);
    // a smaller run on PATCH deletes the stale chunks
    await request(app).patch(`/v1/tours/${c.body.id}`).set("x-tiq-owner", tok).send({ run: { small: 1 } });
    expect(await store.readChunks(c.body.id)).toHaveLength(1);
  });
  it("413 over 4,000,000 serialized chars; exactly the cap is accepted", async () => {
    const { app } = setup();
    const tok = await owner(app);
    const at = await create(app, tok, { run: { b: "x".repeat(4_000_000 - 8) } });
    expect(at.status).toBe(201);
    const over = await create(app, tok, { run: { b: "x".repeat(4_000_000 - 7) } });
    expect(over.status).toBe(413);
    const patchOver = await request(app).patch(`/v1/tours/${at.body.id}`).set("x-tiq-owner", tok).send({ run: { b: "x".repeat(4_000_000) } });
    expect(patchOver.status).toBe(413);
  });
  it("409 on the 51st tour; deleting frees a slot", async () => {
    const { app } = setup();
    const tok = await owner(app);
    let first = "";
    for (let i = 0; i < 50; i++) { const r = await create(app, tok); expect(r.status).toBe(201); first ||= r.body.id; }
    const r51 = await create(app, tok);
    expect(r51.status).toBe(409);
    expect(r51.body).toEqual({ error: "tour limit reached (50)" });
    await request(app).delete(`/v1/tours/${first}`).set("x-tiq-owner", tok);
    expect((await create(app, tok)).status).toBe(201);
  });
  it("another owner's GET / PATCH / DELETE are 404 and change nothing; their list is empty", async () => {
    const { app } = setup();
    const a = await owner(app), b = await owner(app, "s2");
    const id = (await create(app, a)).body.id;
    expect((await request(app).get(`/v1/tours/${id}`).set("x-tiq-owner", b)).status).toBe(404);
    expect((await request(app).patch(`/v1/tours/${id}`).set("x-tiq-owner", b).send({ title: "hax" })).status).toBe(404);
    expect((await request(app).delete(`/v1/tours/${id}`).set("x-tiq-owner", b)).status).toBe(404);
    expect((await request(app).get("/v1/tours").set("x-tiq-owner", b)).body.tours).toEqual([]);
    expect((await request(app).get(`/v1/tours/${id}`).set("x-tiq-owner", a)).body.title).not.toBe("hax");
    expect((await request(app).get("/v1/tours/doesnotexist1234").set("x-tiq-owner", a)).status).toBe(404);
  });
  it("search folds accents and case; status filter", async () => {
    const { app } = setup();
    const tok = await owner(app);
    const sp = (await create(app, tok)).body.id;
    await create(app, tok, { status: "final", summary: summary({ artist: "Rosalía", cities: [{ id: "bcn", name: "Barcelona", country: "Spain" }] }) });
    const q = async (qs: string) => (await request(app).get(`/v1/tours?${qs}`).set("x-tiq-owner", tok)).body.tours as Array<{ id: string; artist: string }>;
    expect((await q("q=sao")).map((t) => t.id)).toEqual([sp]);
    expect((await q("q=S%C3%83O%20pau")).map((t) => t.id)).toEqual([sp]);
    expect((await q("q=rosalia")).map((t) => t.artist)).toEqual(["Rosalía"]);
    expect((await q("q=brazil")).map((t) => t.id)).toEqual([sp]);
    expect(await q("q=nomatch")).toEqual([]);
    expect((await q("status=final")).map((t) => t.artist)).toEqual(["Rosalía"]);
    expect((await q("status=draft")).map((t) => t.id)).toEqual([sp]);
    expect((await q("status=draft&q=rosalia"))).toEqual([]);
    expect((await q("")).length).toBe(2);
  });
  it("foldText strips accents and lowercases", () => {
    expect(foldText("São Paulo · Zürich ÉCOLE")).toBe("sao paulo · zurich ecole");
  });
  it("stores test: true for test traffic only, and expiresAt = updatedAt + 180 days", async () => {
    const { app, store, advance } = setup();
    const tok = await owner(app);
    const real = (await create(app, tok)).body.id;
    const tst = (await request(app).post("/v1/tours").set("x-tiq-owner", tok).set("x-tiq-test", "1").send({ summary: summary(), run: {} })).body.id;
    const sess = (await request(app).post("/v1/tours").set("x-tiq-owner", tok).set("x-session-id", "e2e-1").send({ summary: summary(), run: {} })).body.id;
    expect((await store.getTour(real))!.test).toBeUndefined();
    expect((await store.getTour(tst))!.test).toBe(true);
    expect((await store.getTour(sess))!.test).toBe(true);
    const d = (await store.getTour(real))!;
    expect(d.expiresAt).toBeInstanceOf(Date);
    expect(d.expiresAt.getTime()).toBe(d.updatedAt.getTime() + 180 * DAY);
    advance(DAY);
    await request(app).patch(`/v1/tours/${real}`).set("x-tiq-owner", tok).send({ title: "t" });
    const d2 = (await store.getTour(real))!;
    expect(d2.expiresAt.getTime()).toBe(d2.updatedAt.getTime() + 180 * DAY);
    expect(d2.ownerHash).toBe(createHash("sha256").update(tok).digest("hex"));
  });
  it("validates input: 400 for bad shapes", async () => {
    const { app } = setup();
    const tok = await owner(app);
    const bad: Array<Record<string, unknown>> = [
      { summary: summary({ artist: "" }) }, { summary: summary({ artist: "x".repeat(121) }) }, { title: "x".repeat(121) }, { status: "weird" },
      { summary: summary({ cities: Array.from({ length: 41 }, (_, i) => ({ id: `c${i}`, name: "N", country: "C" })) }) },
      { summary: summary({ cities: [{ id: "a", name: 5, country: "C" }] }) }, { summary: summary({ cities: "no" }) }, { summary: summary({ regions: [1] }) },
      { summary: undefined }, { run: undefined },
    ];
    for (const b of bad) { const r = await request(app).post("/v1/tours").set("x-tiq-owner", tok).send({ summary: summary(), run: {}, ...b }); expect(r.status, JSON.stringify(b).slice(0, 80)).toBe(400); }
    expect((await request(app).patch("/v1/tours/abcdefghijklmnop").set("x-tiq-owner", tok).send({ status: "weird" })).status).toBe(400);
    expect((await request(app).get("/v1/tours/bad%20id").set("x-tiq-owner", tok)).status).toBe(400);
  });
  it("is mounted by createApp when given a tours store (404 otherwise), with the 5mb parser", async () => {
    const base = { qloo: { call: async () => ({}) } as never, cities: [], health: async () => ({ connected: true, ready: true }) };
    expect((await request(createApp(base)).post("/v1/owners").set(SID).send({})).status).toBe(404);
    const app = createApp({ ...base, tours: { store: new MemoryToursStore() } });
    const tok = (await request(app).post("/v1/owners").set(SID).send({})).body.ownerToken;
    const r = await request(app).post("/v1/tours").set("x-tiq-owner", tok).send({ summary: summary(), run: { b: "x".repeat(1_000_000) } });
    expect(r.status).toBe(201);
  });
});

// A minimal fake of the Firestore API subset FirestoreToursStore uses.
function fakeFs(): { fs: FsLike; docs: Map<string, Record<string, unknown>> } {
  const docs = new Map<string, Record<string, unknown>>();
  const snap = (path: string) => { const d = docs.get(path); return { exists: !!d, id: path.split("/").pop()!, data: () => d }; };
  const ref = (path: string) => ({
    path,
    get: async () => snap(path),
    set: async (d: Record<string, unknown>) => void docs.set(path, structuredClone(d)),
    delete: async () => void docs.delete(path),
  });
  const fs: FsLike = {
    doc: ref,
    collection: (p) => {
      const q = (filter?: [string, unknown]) => ({
        where: (f: string, _op: "==", v: unknown) => q([f, v]),
        get: async () => ({ docs: [...docs.keys()].filter((k) => k.startsWith(`${p}/`) && !k.slice(p.length + 1).includes("/") && (!filter || docs.get(k)![filter[0]] === filter[1])).map(snap) }),
      });
      return q();
    },
    batch: () => { const ops: Array<() => void> = []; return { set: (r, d) => void ops.push(() => docs.set((r as { path: string }).path, structuredClone(d))), delete: (r) => void ops.push(() => docs.delete((r as { path: string }).path)), commit: async () => void ops.forEach((o) => o()) }; },
  };
  return { fs, docs };
}

describe("FirestoreToursStore", () => {
  it("runs the same routes against a fake Firestore: owners by hash, tours + chunk subcollection, delete clears chunks", async () => {
    const { fs, docs } = fakeFs();
    const { app } = setup({ store: new FirestoreToursStore({ db: fs }) });
    const tok = await owner(app);
    const hash = createHash("sha256").update(tok).digest("hex");
    expect(docs.has(`tour_owners/${hash}`)).toBe(true);
    expect([...docs.keys()].some((k) => k.includes(tok))).toBe(false);
    const run = { blob: "z".repeat(1_500_000) };
    const id = (await create(app, tok, { run })).body.id;
    expect(docs.get(`user_tours/${id}`)).toMatchObject({ ownerHash: hash, chunkCount: 3, artistLower: "bad bunny" });
    expect(docs.get(`user_tours/${id}`)!.expiresAt).toBeInstanceOf(Date);
    expect([...docs.keys()].filter((k) => k.startsWith(`user_tours/${id}/chunks/`))).toHaveLength(3);
    expect((await request(app).get(`/v1/tours/${id}`).set("x-tiq-owner", tok)).body.run).toEqual(run);
    expect((await request(app).get("/v1/tours?q=sao").set("x-tiq-owner", tok)).body.tours).toHaveLength(1);
    await request(app).patch(`/v1/tours/${id}`).set("x-tiq-owner", tok).send({ run: { s: 1 } });
    expect([...docs.keys()].filter((k) => k.startsWith(`user_tours/${id}/chunks/`))).toHaveLength(1);
    const other = await owner(app, "s9");
    expect((await request(app).delete(`/v1/tours/${id}`).set("x-tiq-owner", other)).status).toBe(404);
    expect((await request(app).delete(`/v1/tours/${id}`).set("x-tiq-owner", tok)).status).toBe(204);
    expect([...docs.keys()].filter((k) => k.startsWith("user_tours/"))).toEqual([]);
  });
});
