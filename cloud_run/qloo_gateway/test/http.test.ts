import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/http/app.js";
import type { QlooCaller } from "../src/qlooCall.js";
import { describeOk, heatMexico, recs, cityHeat } from "./fixtures/envelopes.js";
import { ValidationError } from "../src/qlooCall.js";
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
  it.each(["/health", "/healthz"])("%s answers capabilities and process state", async (path) => {
    expect((await request(app).get(path)).body).toEqual({ connected: true, ready: true });
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
    const bad: QlooCaller = { async call() { throw new ValidationError("tool not allowlisted: qloo_api"); } };
    const res = await request(createApp({ qloo: bad, cities: CITIES, health: async () => ({ connected: true, ready: true }) }))
      .post("/v1/tools/qloo_api").set("x-session-id", "s").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not allowlisted");
  });
  it("returns JSON 400 for malformed JSON bodies", async () => {
    const res = await request(app).post("/v1/tour-board").set("x-session-id", "s").set("content-type", "application/json").send("{bad json");
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(typeof res.body.error).toBe("string");
  });
  it("returns JSON 500 when health rejects", async () => {
    const res = await request(createApp({ qloo, cities: CITIES, health: async () => { throw new Error("secret stack"); } })).get("/health");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "internal error" });
  });
  it("maps non-validation tool errors to 500", async () => {
    const boom: QlooCaller = { async call() { throw new Error("db exploded"); } };
    const res = await request(createApp({ qloo: boom, cities: CITIES, health: async () => ({ connected: true, ready: true }) }))
      .post("/v1/tools/qloo_describe").set("x-session-id", "s").send({});
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "internal error" });
  });
  it("calls narrate once by default and not at all with narrative=0", async () => {
    const narrate = vi.fn(async () => ({ status: "unavailable" as const, reason: "disabled" as const, message: "m" }));
    const withNarrate = createApp({ qloo, cities: CITIES, health: async () => ({ connected: true, ready: true }), narrate });
    const q = "/v1/city-playbook?artist=A&artistEntityId=A1&city=Mexico%20City&country=MX";
    const off = await request(withNarrate).get(`${q}&narrative=0`).set("x-session-id", "s");
    expect(off.text).toContain("event: playbook");
    expect(narrate).not.toHaveBeenCalled();
    const on = await request(withNarrate).get(q).set("x-session-id", "s");
    expect(on.text).toContain("event: playbook");
    expect(on.text).toContain("event: narrative");
    expect(narrate).toHaveBeenCalledTimes(1);
  });
  it("rejects over-long session ids on all routes", async () => {
    const long = "x".repeat(200);
    expect((await request(app).post("/v1/tour-board").set("x-session-id", long).send({ artist: "A", regions: ["Mexico"], maxStops: 3 })).status).toBe(400);
    expect((await request(app).get("/v1/city-playbook").set("x-session-id", long).query({ artist: "a", artistEntityId: "b", city: "c", country: "d" })).status).toBe(400);
    expect((await request(app).post("/v1/tools/qloo_describe").set("x-session-id", long).send({})).status).toBe(400);
  });
  it("stops issuing Qloo calls when the client disconnects (Review Focus 3)", async () => {
    let starts = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const blocking: QlooCaller = { async call(tool, args) { starts += 1; await gate; return qloo.call(tool, args, "s"); } };
    const server = createApp({ qloo: blocking, cities: CITIES, health: async () => ({ connected: true, ready: true }) }).listen(0);
    try {
      const port = (server.address() as { port: number }).port;
      const controller = new AbortController();
      const res = fetch(`http://127.0.0.1:${port}/v1/tour-board`, {
        method: "POST", signal: controller.signal, headers: { "content-type": "application/json", "x-session-id": "s" },
        body: JSON.stringify({ artist: "Test Artist", regions: ["Mexico"], maxStops: 4 }),
      }).catch(() => undefined);
      for (let i = 0; i < 200 && starts === 0; i++) await new Promise((r) => setTimeout(r, 10));
      expect(starts).toBeGreaterThan(0);
      controller.abort();
      await res;
      await new Promise((r) => setTimeout(r, 100)); // let the server observe the socket close
      const startsAtRelease = starts;
      release();
      await new Promise((r) => setTimeout(r, 200));
      expect(starts).toBe(startsAtRelease); // nothing new started after disconnect
    } finally {
      release();
      server.close();
    }
  });
  it("rejects a this-week request with a reversed or over-long window", async () => {
    const app = createApp({ qloo, cities: CITIES, health: async () => ({ connected: true, ready: true }), thisWeek: async () => ({ status: "unavailable", reason: "no_key", message: "x" }) });
    const bad = await request(app).get("/v1/this-week?city=G&country=MX&start=2027-03-20&end=2027-03-12").set("x-session-id", "s");
    expect(bad.status).toBe(400);
    const long = await request(app).get("/v1/this-week?city=G&country=MX&start=2027-01-01&end=2027-04-01").set("x-session-id", "s");
    expect(long.status).toBe(400);
    const impossible = await request(app).get("/v1/this-week?city=G&country=MX&start=2027-13-45&end=2027-14-01").set("x-session-id", "s");
    expect(impossible.status).toBe(400);
    const ok = await request(app).get("/v1/this-week?city=G&country=MX&start=2027-03-12&end=2027-04-12").set("x-session-id", "s");
    expect(ok.body).toEqual({ status: "unavailable", reason: "no_key", message: "x" });
  });
});

describe("strategist route", () => {
  const base = { qloo, cities: CITIES, health: async () => ({ connected: true, ready: true }) };
  it("POST /v1/strategist validates messages and streams events", async () => {
    const strategist = vi.fn(async function* () { yield { type: "strategist_message", text: "hi", unsupportedNumbers: [], stoppedEarly: false, model: "m" } as const; yield { type: "done", summary: {} } as const; });
    const app = createApp({ ...base, strategist });
    expect((await request(app).post("/v1/strategist").set("x-session-id", "s").send({ messages: [] })).status).toBe(400);
    expect((await request(app).post("/v1/strategist").set("x-session-id", "s").send({ messages: [{ role: "user", text: "hi" }], context: { cities: "x" } })).status).toBe(400);
    expect((await request(app).post("/v1/strategist").send({ messages: [{ role: "user", text: "hi" }] })).status).toBe(400);
    const ok = await request(app).post("/v1/strategist").set("x-session-id", "s").send({ messages: [{ role: "user", text: "hi" }] });
    expect(ok.headers["content-type"]).toContain("text/event-stream");
    expect(ok.text).toContain("event: strategist_message");
  });
  it("streams UNAVAILABLE then done when the strategist is not configured", async () => {
    const res = await request(createApp(base)).post("/v1/strategist").set("x-session-id", "s").send({ messages: [{ role: "user", text: "hi" }] });
    expect(res.text).toContain("event: strategist_error");
    expect(res.text).toContain("UNAVAILABLE");
    expect(res.text).toContain("event: done");
  });
});
