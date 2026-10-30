import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountRecordings } from "./recordings.js";

let server;
async function start(opts) {
  const app = express();
  mountRecordings(app, opts);
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

const BODY = JSON.stringify({ recordedAt: "2026-01-01T00:00:00.000Z" });

describe("recordings", () => {
  it("serves the file from localDir when set", async () => {
    const readFile = vi.fn(async () => BODY);
    const base = await start({ localDir: "/data", readFile, bucket: "b" });
    const res = await fetch(`${base}/api/recordings/showcase`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(await res.text()).toBe(BODY);
    expect(readFile).toHaveBeenCalledWith("/data/showcase.json", "utf8");
  });
  it("fetches from the bucket with a bearer token when localDir is unset", async () => {
    const fetchImpl = vi.fn(async () => new Response(BODY, { status: 200 }));
    const base = await start({ bucket: "my-bucket", fetchImpl, getAccessToken: async () => "tok-123" });
    const res = await fetch(`${base}/api/recordings/backtest`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(BODY);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://storage.googleapis.com/storage/v1/b/my-bucket/o/backtest.json?alt=media");
    expect(init.headers.authorization).toBe("Bearer tok-123");
  });
  it("answers 503 on a storage 403 and never logs the token", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => new Response("denied", { status: 403 }));
    const base = await start({ bucket: "b", fetchImpl, getAccessToken: async () => "SECRET-TOKEN" });
    const res = await fetch(`${base}/api/recordings/showcase`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "recording unavailable" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET-TOKEN");
    expect(log).toHaveBeenCalled();
  });
  it("answers 503 for a corrupt body and when nothing is configured", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const base = await start({ localDir: "/d", readFile: async () => "{nope" });
    expect((await fetch(`${base}/api/recordings/showcase`)).status).toBe(503);
    await new Promise((r) => server.close(r)); server = undefined;
    const base2 = await start({ bucket: "", localDir: "" });
    expect((await fetch(`${base2}/api/recordings/showcase`)).status).toBe(503);
  });
  it("404 for traversal and unknown names", async () => {
    const readFile = vi.fn(async () => BODY);
    const base = await start({ localDir: "/data", readFile });
    expect((await fetch(`${base}/api/recordings/..%2Fetc`)).status).toBe(404);
    expect((await fetch(`${base}/api/recordings/other`)).status).toBe(404);
    expect(readFile).not.toHaveBeenCalled();
  });
  it("reuses the in-memory copy within five minutes, then refetches", async () => {
    const fetchImpl = vi.fn(async () => new Response(BODY, { status: 200 }));
    let t = 1_000;
    const base = await start({ bucket: "b", fetchImpl, getAccessToken: async () => "t", now: () => t });
    await fetch(`${base}/api/recordings/showcase`);
    t += 60_000;
    expect((await fetch(`${base}/api/recordings/showcase`)).status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    t += 5 * 60_000;
    await fetch(`${base}/api/recordings/showcase`);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("recordings token refresh", () => {
  it("on a storage 401 it asks for a fresh token and retries once", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("expired", { status: 401 }))
      .mockResolvedValueOnce(new Response(BODY, { status: 200 }));
    const getAccessToken = vi.fn(async (opts) => (opts?.force ? "fresh" : "stale"));
    const base = await start({ bucket: "b", fetchImpl, getAccessToken });
    const res = await fetch(`${base}/api/recordings/showcase`);
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][1].headers.authorization).toBe("Bearer fresh");
    expect(getAccessToken).toHaveBeenLastCalledWith({ force: true });
  });
  it("still answers 503 when the retry is also refused", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 401 }));
    const base = await start({ bucket: "b", fetchImpl, getAccessToken: async () => "t" });
    const res = await fetch(`${base}/api/recordings/showcase`);
    expect(res.status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
