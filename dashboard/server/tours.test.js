import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountTours, statusFromCallTool } from "./tours.js";

let server;
async function start(callTool) {
  const app = express();
  mountTours(app, { callTool });
  // Same order as index.js: the app-wide 100 kb parser comes after the tours route.
  app.use(express.json());
  await new Promise((r) => { server = app.listen(0, r); });
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
const post = (base, body) => fetch(`${base}/api/tours`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("POST /api/tours", () => {
  it("refuses to save a sample tour", async () => {
    const callTool = vi.fn();
    const res = await post(await start(callTool), { source: "sample", title: "x" });
    expect(res.status).toBe(403);
    expect(callTool).not.toHaveBeenCalled();
  });
  it("forwards a live tour to tour_data_api /qloo_tours without the source field and passes 201 through", async () => {
    const callTool = vi.fn(async () => ({ status: 201, json: { campaign_id: "c1", stops: 2 } }));
    const res = await post(await start(callTool), { source: "live", title: "T", artist: "A" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ campaign_id: "c1", stops: 2 });
    const [path, opts] = callTool.mock.calls[0];
    expect(path).toBe("/qloo_tours");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ title: "T", artist: "A" });
  });
  it("passes a 400 validation error through", async () => {
    const callTool = vi.fn(async () => ({ status: 400, json: { error: "cities required" } }));
    const res = await post(await start(callTool), { source: "live", title: "T" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "cities required" });
  });
  it("maps upstream failures to 502 with an error message", async () => {
    const callTool = vi.fn(async () => ({ status: 500, json: { error: "insert failed" } }));
    const res = await post(await start(callTool), { source: "live", title: "T" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "insert failed" });
  });
  it("maps a thrown call to 502", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const callTool = vi.fn(async () => { throw new Error("network down"); });
    const res = await post(await start(callTool), { source: "live", title: "T" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "tour_data_api unavailable" });
  });
});

describe("POST /api/tours body size", () => {
  it("accepts a ~150 kb Tour Book snapshot (board_json may be up to 200000 chars)", async () => {
    const callTool = vi.fn(async () => ({ status: 201, json: { campaign_id: "c1", stops: 1 } }));
    const res = await post(await start(callTool), { source: "live", title: "T", board_json: "x".repeat(150_000) });
    expect(res.status).toBe(201);
    expect(JSON.parse(callTool.mock.calls[0][1].body).board_json).toHaveLength(150_000);
  });
});

describe("statusFromCallTool", () => {
  it("returns 201 with the JSON on success", async () => {
    const wrapped = statusFromCallTool(async () => ({ campaign_id: "c1" }));
    expect(await wrapped("/qloo_tours", {})).toEqual({ status: 201, json: { campaign_id: "c1" } });
  });
  it("parses callTool's 'failed (NNN): body' error into status and JSON", async () => {
    const wrapped = statusFromCallTool(async () => { throw new Error('/qloo_tours failed (400): {"error":"cities must be 1-20 items"}'); });
    expect(await wrapped("/qloo_tours", {})).toEqual({ status: 400, json: { error: "cities must be 1-20 items" } });
  });
  it("keeps a non-JSON error body as the error text", async () => {
    const wrapped = statusFromCallTool(async () => { throw new Error("/qloo_tours failed (500): upstream\nboom"); });
    expect(await wrapped("/qloo_tours", {})).toEqual({ status: 500, json: { error: "upstream\nboom" } });
  });
  it("rethrows errors that are not HTTP failures", async () => {
    const wrapped = statusFromCallTool(async () => { throw new Error("socket hang up"); });
    await expect(wrapped("/qloo_tours", {})).rejects.toThrow("socket hang up");
  });
});

describe("tour_data_api not configured", () => {
  it("statusFromCallTool maps a 503 from callTool so POST /api/tours answers 503 with the reason", async () => {
    const callTool = statusFromCallTool(async (path) => {
      throw new Error(`${path} failed (503): ${JSON.stringify({ error: "tour_data_api not configured" })}`);
    });
    const res = await post(await start(callTool), { source: "live", title: "T" });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "tour_data_api not configured" });
  });
});
