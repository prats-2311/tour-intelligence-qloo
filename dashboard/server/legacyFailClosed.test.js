import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Boots the real server/index.js with every legacy backend URL unset (as the deploy now leaves them)
// and checks the whole legacy proxy surface fails closed while the Qloo surface keeps working.
const here = path.dirname(fileURLToPath(import.meta.url));
let child;
let base;

beforeAll(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "legacy-closed-"));
  writeFileSync(path.join(dir, "showcase.json"), JSON.stringify({ recordedAt: "2026-01-01T00:00:00.000Z" }));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const env = { ...process.env, PORT: String(port), RECORDINGS_DIR: dir };
  for (const k of ["TOUR_DATA_API_URL", "DELIGHT_RENDERER_URL", "ORCHESTRATOR_JOB_URL", "QLOO_GATEWAY_URL", "RECORDINGS_BUCKET"]) delete env[k];
  child = spawn(process.execPath, [path.join(here, "index.js")], { env, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d; });
  base = `http://127.0.0.1:${port}`;
  await new Promise((resolve, reject) => {
    child.once("exit", (code) => reject(new Error(`server exited at boot (${code}): ${stderr}`)));
    child.stdout.on("data", (d) => { if (String(d).includes("BFF listening")) resolve(); });
  });
}, 20000);

afterAll(() => { child?.kill(); });

const post = (p) => fetch(`${base}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });

describe("legacy proxy with no backend URLs configured", () => {
  it("boots without throwing", () => {
    expect(child.exitCode).toBeNull();
  });
  it.each(["/api/campaigns", "/api/cities"])("GET %s answers 503", async (p) => {
    const res = await fetch(`${base}${p}`);
    expect(res.status).toBe(503);
  });
  it.each(["/api/campaigns", "/api/campaigns/c1/generate-briefs", "/api/tour-book", "/api/rank-cities", "/api/campaigns/c1/stops"])(
    "POST %s answers 503",
    async (p) => {
      expect((await post(p)).status).toBe(503);
    },
  );
  it("POST /api/tours (legacy save) answers 503", async () => {
    expect((await post("/api/tours")).status).toBe(503);
  });
  it("still serves /api/recordings/showcase from the local dir", async () => {
    const res = await fetch(`${base}/api/recordings/showcase`);
    expect(res.status).toBe(200);
  });
  it("still routes /api/qloo/* (not the legacy 503)", async () => {
    const res = await fetch(`${base}/api/qloo/this-week`);
    expect(res.status).not.toBe(503);
  });
  it("still routes /api/qloo/advance (not the legacy 503)", async () => {
    const res = await fetch(`${base}/api/qloo/advance`);
    expect(res.status).not.toBe(503);
  });
});
