import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { requireTourDataApi } from "./requireTourDataApi.js";

let server;
async function start(url) {
  const app = express();
  app.use(requireTourDataApi(url));
  app.get(/(.*)/, (req, res) => res.json({ reached: req.path }));
  await new Promise((r) => { server = app.listen(0, "127.0.0.1", r); });
  return `http://127.0.0.1:${server.address().port}`;
}
afterEach(async () => {
  const s = server;
  server = undefined;
  if (!s) return;
  s.closeAllConnections?.();
  await new Promise((r) => s.close(r));
});

describe("requireTourDataApi", () => {
  it("answers 503 on /api routes when the URL is unset", async () => {
    const res = await fetch(`${await start("")}/api/campaigns`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "tour_data_api not configured" });
  });
  it("lets /api/qloo/* through when the URL is unset", async () => {
    const res = await fetch(`${await start("")}/api/qloo/x`);
    expect(res.status).toBe(200);
  });
  it("lets /api/recordings/* through when the URL is unset", async () => {
    const res = await fetch(`${await start("")}/api/recordings/showcase`);
    expect(res.status).toBe(200);
  });
  it("lets everything through when the URL is set", async () => {
    const res = await fetch(`${await start("https://tda.test")}/api/campaigns`);
    expect(res.status).toBe(200);
  });
});
