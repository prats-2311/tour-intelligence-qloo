import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountQlooProxy } from "./qlooProxy.js";

let server;
async function start(opts) {
  const app = express();
  app.use(express.json());
  mountQlooProxy(app, opts);
  await new Promise((r) => { server = app.listen(0, "127.0.0.1", r); });
  return `http://127.0.0.1:${server.address().port}`;
}
// Bind to loopback explicitly. On macOS a wildcard listen(0) can be handed a port that another process
// (a parallel test worker) already holds on 127.0.0.1, and requests to 127.0.0.1:port then reach THAT server
// (the flaky 404 for "400 for missing x-session-id"). A specific-address bind fails with EADDRINUSE instead of coexisting.
// Await the close: an unawaited close lets the next test's listen(0) be handed the same ephemeral port
// while undici still holds a keep-alive socket to the old server, so a request can land on the wrong listener.
afterEach(async () => {
  vi.restoreAllMocks();
  const s = server;
  server = undefined;
  if (!s) return;
  s.closeAllConnections?.();
  await new Promise((r) => s.close(r));
});

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
    const tool = await fetch(`${base}/api/qloo/tools/qloo_compare_audiences`, { method: "POST", headers: { "content-type": "application/json", "x-session-id": "s" }, body: JSON.stringify({ group_a: ["A"], group_b: ["B"] }) });
    expect(await tool.json()).toMatchObject({ envelope: { status: "ok" } });
    expect(fetchImpl.mock.calls[1][0]).toBe("https://gw/v1/tools/qloo_compare_audiences");
  });
  it("502 with a generic message when the gateway is unreachable", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("ECONNREFUSED 10.0.0.1"); });
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl });
    const res = await fetch(`${base}/api/qloo/tools/qloo_compare_audiences`, { method: "POST", headers: { "content-type": "application/json", "x-session-id": "s" }, body: JSON.stringify({ group_a: ["A"], group_b: ["B"] }) });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Qloo gateway unavailable" });
  });
  it("aborts the upstream request when the client disconnects mid-stream", async () => {
    let signal;
    const fetchImpl = vi.fn(async (u, init) => {
      if (String(u).includes("/v1/tools/")) return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      signal = init.signal;
      return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("event: tick\ndata: {}\n\n")); } }), { status: 200, headers: { "content-type": "text/event-stream" } });
    });
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl });
    const ac = new AbortController();
    const res = await fetch(`${base}/api/qloo/tour-board`, { method: "POST", signal: ac.signal, headers: { "content-type": "application/json", "x-session-id": "s" }, body: "{}" });
    await res.body.getReader().read();
    ac.abort();
    await vi.waitFor(() => expect(signal.aborted).toBe(true));
    const next = await fetch(`${base}/api/qloo/tools/qloo_compare_audiences`, { method: "POST", headers: { "content-type": "application/json", "x-session-id": "s" }, body: JSON.stringify({ group_a: ["A"], group_b: ["B"] }) });
    expect(next.status).toBe(200);
  });
  it("ends the response cleanly when the upstream stream errors mid-way", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("event: a\ndata: {}\n\n")); setTimeout(() => c.error(new Error("boom")), 10); } }), { status: 200, headers: { "content-type": "text/event-stream" } }));
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl });
    const res = await fetch(`${base}/api/qloo/tour-board`, { method: "POST", headers: { "content-type": "application/json", "x-session-id": "s" }, body: "{}" });
    await res.text().catch(() => {});
    const again = await fetch(`${base}/api/qloo/tools/qloo_compare_audiences`, { method: "POST", headers: { "content-type": "application/json", "x-session-id": "s" }, body: JSON.stringify({ group_a: ["A"], group_b: ["B"] }) });
    expect(again.status).toBeGreaterThan(0);
    expect(err).toHaveBeenCalledWith("[qlooProxy]", "tour-board", "boom");
  });
  it("502 and logs when getToken throws", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn();
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => { throw new Error("no creds"); }, fetchImpl });
    const res = await fetch(`${base}/api/qloo/tools/qloo_compare_audiences`, { method: "POST", headers: { "content-type": "application/json", "x-session-id": "s" }, body: JSON.stringify({ group_a: ["A"], group_b: ["B"] }) });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Qloo gateway unavailable" });
    expect(err).toHaveBeenCalledWith("[qlooProxy]", "tools", "no creds");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it.each([["missing", undefined], ["empty", ""], ["too long", "x".repeat(129)]])("400 for %s x-session-id without calling getToken", async (_n, v) => {
    const getToken = vi.fn(async () => "t");
    const fetchImpl = vi.fn();
    const base = await start({ gatewayUrl: "https://gw", getToken, fetchImpl });
    const res = await fetch(`${base}/api/qloo/tour-board`, { method: "POST", headers: { "content-type": "application/json", ...(v === undefined ? {} : { "x-session-id": v }) }, body: "{}" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "x-session-id header required (1-128 chars)" });
    expect(getToken).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("forwards the city id and coordinates the gateway needs to check a playbook location", async () => {
    const fetchImpl = vi.fn(async () => sse(["event: done\ndata: {}\n\n"]));
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl });
    await (await fetch(`${base}/api/qloo/city-playbook?artist=A&city=Lima&cityId=7&lat=-12.04&lon=-77.03`, { headers: { "x-session-id": "s" } })).text();
    expect(fetchImpl.mock.calls[0][0]).toBe("https://gw/v1/city-playbook?artist=A&city=Lima&cityId=7&lat=-12.04&lon=-77.03");
  });
  it("forwards artistPopularity on city-playbook", async () => {
    const fetchImpl = vi.fn(async () => sse(["event: done\ndata: {}\n\n"]));
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl });
    await (await fetch(`${base}/api/qloo/city-playbook?artist=A&artistEntityId=E&artistPopularity=0.62&city=Lima&country=PE`, { headers: { "x-session-id": "s" } })).text();
    expect(fetchImpl.mock.calls[0][0]).toBe("https://gw/v1/city-playbook?artist=A&artistEntityId=E&artistPopularity=0.62&city=Lima&country=PE");
  });
  it("forwards only whitelisted string city-playbook params", async () => {
    const fetchImpl = vi.fn(async () => sse(["event: done\ndata: {}\n\n"]));
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl });
    await (await fetch(`${base}/api/qloo/city-playbook?artist=A&city=Lima&evil=1&country=PE&country=MX`, { headers: { "x-session-id": "s" } })).text();
    expect(fetchImpl.mock.calls[0][0]).toBe("https://gw/v1/city-playbook?artist=A&city=Lima");
  });
  it.each(["qloo_describe", "qloo_recommend", "qloo_where_popular", "x"])("404 for non-public tool %s before getToken", async (name) => {
    const getToken = vi.fn(async () => "t");
    const fetchImpl = vi.fn();
    const base = await start({ gatewayUrl: "https://gw", getToken, fetchImpl });
    const res = await fetch(`${base}/api/qloo/tools/${name}`, { method: "POST", headers: { "content-type": "application/json", "x-session-id": "s" }, body: JSON.stringify({ entity: "A" }) });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Unknown tool" });
    expect(getToken).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it.each([["group_a", { group_a: ["1", "2", "3", "4"], group_b: ["B"] }], ["group_b", { group_a: ["A"], group_b: ["1", "2", "3", "4"] }]])("400 when %s has more than 3 entries", async (_k, body) => {
    const getToken = vi.fn(async () => "t");
    const fetchImpl = vi.fn();
    const base = await start({ gatewayUrl: "https://gw", getToken, fetchImpl });
    const res = await fetch(`${base}/api/qloo/tools/qloo_compare_audiences`, { method: "POST", headers: { "content-type": "application/json", "x-session-id": "s" }, body: JSON.stringify(body) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "group_a and group_b allow at most 3 entries" });
    expect(getToken).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("allows compare_audiences with exactly 3 entries per group", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ envelope: { status: "ok" } }), { status: 200, headers: { "content-type": "application/json" } }));
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl });
    const res = await fetch(`${base}/api/qloo/tools/qloo_compare_audiences`, { method: "POST", headers: { "content-type": "application/json", "x-session-id": "s" }, body: JSON.stringify({ group_a: ["1", "2", "3"], group_b: ["4", "5", "6"] }) });
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("maps a non-OK non-JSON upstream body to a JSON error with the upstream status", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>Bad Gateway</html>", { status: 503, headers: { "content-type": "text/html" } }));
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl });
    const res = await fetch(`${base}/api/qloo/tools/qloo_compare_audiences`, { method: "POST", headers: { "content-type": "application/json", "x-session-id": "s" }, body: JSON.stringify({ group_a: ["A"], group_b: ["B"] }) });
    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ error: "Qloo gateway unavailable" });
  });
  it("maps a non-OK non-JSON upstream body on the stream route too", async () => {
    const fetchImpl = vi.fn(async () => new Response("upstream timeout", { status: 504, headers: { "content-type": "text/plain" } }));
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl });
    const res = await fetch(`${base}/api/qloo/tour-board`, { method: "POST", headers: { "content-type": "application/json", "x-session-id": "s" }, body: "{}" });
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: "Qloo gateway unavailable" });
  });
  it("forwards only allowlisted this-week params and rejects long or missing values", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: { "content-type": "application/json" } }));
    const getToken = vi.fn(async () => "t");
    const base = await start({ gatewayUrl: "https://gw", getToken, fetchImpl });
    const ok = await fetch(`${base}/api/qloo/this-week?city=Guadalajara&country=MX&start=2027-03-12&end=2027-04-18&evil=1`, { headers: { "x-session-id": "s" } });
    expect(await ok.json()).toEqual({ status: "ok" });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://gw/v1/this-week?city=Guadalajara&country=MX&start=2027-03-12&end=2027-04-18");
    for (const qs of [`city=${"x".repeat(81)}&country=MX&start=2027-03-12&end=2027-04-18`, "city=G&country=MX&start=2027-03-12"]) {
      const res = await fetch(`${base}/api/qloo/this-week?${qs}`, { headers: { "x-session-id": "s" } });
      expect(res.status).toBe(400);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("forwards only allowlisted sponsor-segments params and rejects missing or long values", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status: "no_skew", indexes: {}, bands: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl });
    const ok = await fetch(`${base}/api/qloo/sponsor-segments?artistId=A1&artist=Mac&city=Los%20Angeles&country=US&cityId=7&lat=34&lon=-118&evil=1`, { headers: { "x-session-id": "s" } });
    expect(await ok.json()).toEqual({ status: "no_skew", indexes: {}, bands: [] });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://gw/v1/sponsor-segments?artistId=A1&city=Los+Angeles&country=US&artist=Mac&cityId=7&lat=34&lon=-118");
    for (const qs of [`artistId=${"x".repeat(81)}&city=G&country=US`, "artistId=A1&city=G", "city=G&country=US"]) {
      expect((await fetch(`${base}/api/qloo/sponsor-segments?${qs}`, { headers: { "x-session-id": "s" } })).status).toBe(400);
    }
    expect((await fetch(`${base}/api/qloo/sponsor-segments?artistId=A1&city=G&country=US`)).status).toBe(400); // session header required
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("forwards the narrative flag on city-playbook", async () => {
    const fetchImpl = vi.fn(async () => sse(["event: done\ndata: {}\n\n"]));
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl });
    await (await fetch(`${base}/api/qloo/city-playbook?artist=A&narrative=0`, { headers: { "x-session-id": "s" } })).text();
    expect(fetchImpl.mock.calls[0][0]).toBe("https://gw/v1/city-playbook?artist=A&narrative=0");
  });
  it("streams /api/qloo/strategist and rejects bad bodies before forwarding", async () => {
    const fetchImpl = vi.fn(async () => sse(["event: done\ndata: {}\n\n"]));
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl });
    const post = (body) => fetch(`${base}/api/qloo/strategist`, { method: "POST", headers: { "content-type": "application/json", "x-session-id": "s" }, body: JSON.stringify(body) });
    expect((await post({ messages: Array.from({ length: 13 }, () => ({ role: "user", text: "x" })) })).status).toBe(400);
    expect((await post({ messages: "nope" })).status).toBe(400);
    expect((await post({ messages: [{ role: "user", text: "x".repeat(70_000) }] })).status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
    const ok = await post({ messages: [{ role: "user", text: "hi" }], context: {} });
    expect(ok.headers.get("content-type")).toContain("text/event-stream");
    await ok.text();
    expect(fetchImpl.mock.calls[0][0]).toBe("https://gw/v1/strategist");
  });
  it("forwards /api/qloo/without-qloo as JSON and rejects bodies over 16 KB", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status: "ok", ranked: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl });
    const post = (body) => fetch(`${base}/api/qloo/without-qloo`, { method: "POST", headers: { "content-type": "application/json", "x-session-id": "s" }, body: JSON.stringify(body) });
    const big = await post({ artist: "x".repeat(17 * 1024), regions: ["Mexico"], cities: [] });
    expect(big.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
    const body = { artist: "A", regions: ["Mexico"], cities: [{ name: "Guadalajara", country: "MX" }] };
    const ok = await post(body);
    expect(await ok.json()).toEqual({ status: "ok", ranked: [] });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://gw/v1/without-qloo");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual(body);
  });
});
