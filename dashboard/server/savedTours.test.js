import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountSavedTours } from "./savedTours.js";

let server;
async function start(opts, { legacy } = {}) {
  const app = express();
  mountSavedTours(app, opts);
  if (legacy) legacy(app);
  await new Promise((r) => { server = app.listen(0, "127.0.0.1", r); });
  return `http://127.0.0.1:${server.address().port}`;
}
afterEach(async () => {
  vi.restoreAllMocks();
  const s = server;
  server = undefined;
  if (!s) return;
  s.closeAllConnections?.();
  await new Promise((r) => s.close(r));
});
const json = (status, body) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: status === 204 ? {} : { "content-type": "application/json" } });
const H = { "content-type": "application/json", "x-tiq-owner": "owner-token-abc", "x-session-id": "s1" };

describe("savedTours BFF proxy", () => {
  it("503 when the gateway is not configured", async () => {
    const base = await start({ gatewayUrl: undefined, getToken: async () => "t" });
    expect((await fetch(`${base}/api/owners`, { method: "POST" })).status).toBe(503);
  });
  it("POST /api/owners forwards with the IAM token and session id, returns the gateway body", async () => {
    const fetchImpl = vi.fn(async () => json(201, { ownerToken: "abc" }));
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "tok", fetchImpl });
    const res = await fetch(`${base}/api/owners`, { method: "POST", headers: { "x-session-id": "s1", "x-tiq-test": "1" } });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ownerToken: "abc" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://gw/v1/owners");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer tok");
    expect(init.headers["x-session-id"]).toBe("s1");
    expect(init.headers["x-tiq-test"]).toBe("1");
  });
  it("passes x-tiq-owner in its own header, never in authorization, and only sends x-tiq-test when exactly 1", async () => {
    const fetchImpl = vi.fn(async () => json(200, { tours: [] }));
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "tok", fetchImpl });
    await fetch(`${base}/api/tours`, { headers: H });
    await fetch(`${base}/api/tours`, { headers: { ...H, "x-tiq-test": "yes" } });
    const h0 = fetchImpl.mock.calls[0][1].headers;
    expect(h0["x-tiq-owner"]).toBe("owner-token-abc");
    expect(h0.authorization).toBe("Bearer tok");
    expect(fetchImpl.mock.calls[1][1].headers).not.toHaveProperty("x-tiq-test");
  });
  it("GET /api/tours forwards only q and status, encoded", async () => {
    const fetchImpl = vi.fn(async () => json(200, { tours: [] }));
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl });
    await fetch(`${base}/api/tours?q=s%C3%A3o%20paulo&status=final&evil=1`, { headers: H });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://gw/v1/tours?q=s%C3%A3o+paulo&status=final");
  });
  it("GET / PATCH / DELETE /api/tours/:id forward method, path and body; 204 stays empty; gateway errors pass through", async () => {
    const fetchImpl = vi.fn(async (_u, init) => init.method === "DELETE" ? json(204) : init.method === "GET" ? json(404, { error: "Tour not found" }) : json(200, { id: "abcdefgh12", updatedAt: 1 }));
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl });
    const get = await fetch(`${base}/api/tours/abcdefgh12`, { headers: H });
    expect(get.status).toBe(404);
    expect(await get.json()).toEqual({ error: "Tour not found" });
    const patch = await fetch(`${base}/api/tours/abcdefgh12`, { method: "PATCH", headers: H, body: JSON.stringify({ title: "T" }) });
    expect(patch.status).toBe(200);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ title: "T" });
    const del = await fetch(`${base}/api/tours/abcdefgh12`, { method: "DELETE", headers: H });
    expect(del.status).toBe(204);
    expect(await del.text()).toBe("");
    expect(fetchImpl.mock.calls.map((c) => [c[1].method, c[0]])).toEqual([["GET", "https://gw/v1/tours/abcdefgh12"], ["PATCH", "https://gw/v1/tours/abcdefgh12"], ["DELETE", "https://gw/v1/tours/abcdefgh12"]]);
  });
  it.each(["short", "has space1234", "abc.def.ghij", "a".repeat(41), "abc%2Fdefghij"])("400 for a bad id (%s) without calling the gateway", async (id) => {
    const fetchImpl = vi.fn(async () => json(200, {}));
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl });
    for (const method of ["GET", "PATCH", "DELETE"]) {
      const res = await fetch(`${base}/api/tours/${id}`, { method, headers: H, ...(method === "PATCH" ? { body: "{}" } : {}) });
      expect(res.status, `${method} ${id}`).toBe(400);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("POST /api/tours with x-tiq-owner is forwarded; accepts up to a 5mb body, 413 above", async () => {
    const fetchImpl = vi.fn(async () => json(201, { id: "abcdefgh12", updatedAt: 1 }));
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl });
    const big = JSON.stringify({ summary: {}, run: "x".repeat(4_500_000) });
    expect((await fetch(`${base}/api/tours`, { method: "POST", headers: H, body: big })).status).toBe(201);
    expect(fetchImpl.mock.calls[0][1].body).toBe(big);
    const tooBig = JSON.stringify({ run: "x".repeat(5_300_000) });
    expect((await fetch(`${base}/api/tours`, { method: "POST", headers: H, body: tooBig })).status).toBe(413);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("POST /api/tours WITHOUT x-tiq-owner falls through to the existing Save-as-campaign route", async () => {
    const fetchImpl = vi.fn(async () => json(201, {}));
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl }, { legacy: (app) => app.post("/api/tours", (_q, res) => res.status(201).json({ legacy: true })) });
    const res = await fetch(`${base}/api/tours`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(await res.json()).toEqual({ legacy: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("a loopback gateway and the dev (COLLAB_FAKE) url need no identity token", async () => {
    const fetchImpl = vi.fn(async () => json(201, { ownerToken: "a" }));
    const getToken = vi.fn(async () => "t");
    const base = await start({ gatewayUrl: "http://127.0.0.1:8080", getToken, fetchImpl });
    await fetch(`${base}/api/owners`, { method: "POST" });
    expect(getToken).not.toHaveBeenCalled();
    expect(fetchImpl.mock.calls[0][1].headers).not.toHaveProperty("authorization");
    await new Promise((r) => { server.closeAllConnections?.(); server.close(r); });
    const base2 = await start({ gatewayUrl: "https://gw", devUrl: "http://127.0.0.1:8094", getToken, fetchImpl });
    await fetch(`${base2}/api/owners`, { method: "POST" });
    expect(fetchImpl.mock.calls[1][0]).toBe("http://127.0.0.1:8094/v1/owners");
    expect(getToken).not.toHaveBeenCalled();
  });
  it("502 when the gateway is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl: async () => { throw new Error("boom"); } });
    expect((await fetch(`${base}/api/tours`, { headers: H })).status).toBe(502);
  });
  it("a non-JSON upstream error (Cloud Run IAM HTML 401/403) becomes 502 gateway unavailable, never passed through", async () => {
    for (const status of [401, 403, 500]) {
      const fetchImpl = vi.fn(async () => new Response("<html>Forbidden</html>", { status, headers: { "content-type": "text/html" } }));
      const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl });
      const res = await fetch(`${base}/api/tours`, { headers: H });
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ error: "gateway unavailable" });
      await new Promise((r) => { server.closeAllConnections?.(); server.close(r); });
      server = undefined;
    }
  });
  it("a JSON 401 from the gateway still passes through", async () => {
    const base = await start({ gatewayUrl: "https://gw", getToken: async () => "t", fetchImpl: async () => json(401, { error: "owner required" }) });
    const res = await fetch(`${base}/api/tours`, { headers: H });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "owner required" });
  });
});
