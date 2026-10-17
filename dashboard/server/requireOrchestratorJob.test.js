import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { requireOrchestratorJob } from "./requireOrchestratorJob.js";

let server;
async function start(url) {
  const app = express();
  app.post("/api/campaigns/:id/generate-briefs", requireOrchestratorJob(url), (req, res) => res.json({ reached: req.params.id }));
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

describe("requireOrchestratorJob", () => {
  it("answers 503 and never reaches the handler when ORCHESTRATOR_JOB_URL is unset", async () => {
    const res = await fetch(`${await start("")}/api/campaigns/c1/generate-briefs`, { method: "POST" });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "orchestrator job not configured" });
  });
  it("lets the request through when the URL is set", async () => {
    const res = await fetch(`${await start("https://run.example/jobs/x:run")}/api/campaigns/c1/generate-briefs`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reached: "c1" });
  });
});
