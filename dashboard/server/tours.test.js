import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountTours } from "./tours.js";

let server;
async function start(callTool) {
  const app = express();
  app.use(express.json());
  mountTours(app, { callTool });
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
