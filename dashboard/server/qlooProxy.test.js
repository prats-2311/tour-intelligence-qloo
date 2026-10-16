import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountQlooProxy } from "./qlooProxy.js";

let server;
async function start(opts) {
  const app = express();
  app.use(express.json());
  mountQlooProxy(app, opts);
  await new Promise((r) => { server = app.listen(0, r); });
  return `http://127.0.0.1:${server.address().port}`;
}
afterEach(() => server?.close());

const sse = (chunks) => new Response(new ReadableStream({ start(c) { const e = new TextEncoder(); chunks.forEach((x) => c.enqueue(e.encode(x))); c.close(); } }), { status: 200, headers: { "content-type": "text/event-stream" } });

describe("qlooProxy", () => {
  it("503 when the gateway is not configured", async () => {
    const base = await start({ gatewayUrl: undefined, getToken: async () => "t" });
    const res = await fetch(`${base}/api/qloo/tour-board`, { method: "POST" });
    expect(res.status).toBe(503);
  });
  it("streams tour-board SSE through with auth and session headers", async () => {
    const fetchImpl = vi.fn(async () => sse(['event: done\ndata: {"type":"done"}\n\n']));
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "tok", fetchImpl });
    const res = await fetch(`${base}/api/qloo/tour-board`, { method: "POST", headers: { "content-type": "application/json", "x-session-id": "s1" }, body: JSON.stringify({ artist: "A", regions: ["Mexico"], maxStops: 3 }) });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(await res.text()).toContain("event: done");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://gw/v1/tour-board");
    expect(init.headers.authorization).toBe("Bearer tok");
    expect(init.headers["x-session-id"]).toBe("s1");
    expect(JSON.parse(init.body)).toEqual({ artist: "A", regions: ["Mexico"], maxStops: 3 });
  });
  it("passes upstream JSON errors through with their status", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "bad brief" }), { status: 400, headers: { "content-type": "application/json" } }));
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl });
    const res = await fetch(`${base}/api/qloo/tour-board`, { method: "POST", headers: { "content-type": "application/json", "x-session-id": "s" }, body: "{}" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad brief" });
  });
  it("forwards city-playbook query and tools calls", async () => {
    const fetchImpl = vi.fn(async (url) => String(url).includes("/v1/tools/") ? new Response(JSON.stringify({ envelope: { status: "ok" }, cached: false, stale: false }), { status: 200, headers: { "content-type": "application/json" } }) : sse(["event: done\ndata: {}\n\n"]));
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl });
    await (await fetch(`${base}/api/qloo/city-playbook?artist=A&artistEntityId=E&city=Lima&country=PE`, { headers: { "x-session-id": "s" } })).text();
    expect(fetchImpl.mock.calls[0][0]).toBe("https://gw/v1/city-playbook?artist=A&artistEntityId=E&city=Lima&country=PE");
    const tool = await fetch(`${base}/api/qloo/tools/qloo_describe`, { method: "POST", headers: { "content-type": "application/json", "x-session-id": "s" }, body: JSON.stringify({ entity: "A" }) });
    expect(await tool.json()).toMatchObject({ envelope: { status: "ok" } });
  });
  it("502 with a generic message when the gateway is unreachable", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("ECONNREFUSED 10.0.0.1"); });
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl });
    const res = await fetch(`${base}/api/qloo/tools/qloo_describe`, { method: "POST", headers: { "content-type": "application/json", "x-session-id": "s" }, body: "{}" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Qloo gateway unavailable" });
  });
});
