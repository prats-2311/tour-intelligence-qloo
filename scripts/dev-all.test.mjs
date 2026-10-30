import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlan, missingDeps, banner } from "./dev-all.mjs";

const root = "/repo";
test("plan starts gateway, BFF and Vite with in-memory backends and a loopback gateway URL", () => {
  const plan = buildPlan({ root, env: {} });
  assert.deepEqual(plan.services.map((s) => s.name), ["gateway", "bff", "vite"]);
  const [gw, bff, vite] = plan.services;
  assert.equal(gw.env.PORT, "8080");
  assert.equal(gw.env.QLOO_CACHE_BACKEND, "memory");
  assert.equal(gw.env.QLOO_USAGE_BACKEND, "memory");
  assert.equal(bff.env.PORT, "8787");
  assert.equal(bff.env.QLOO_GATEWAY_URL, "http://127.0.0.1:8080");
  assert.match(vite.cwd, /dashboard$/);
  assert.match(gw.cwd, /cloud_run\/qloo_gateway$/);
});
test("gateway port is configurable and the BFF follows it", () => {
  const plan = buildPlan({ root, env: { GATEWAY_PORT: "9090" } });
  assert.equal(plan.services[0].env.PORT, "9090");
  assert.equal(plan.services[1].env.QLOO_GATEWAY_URL, "http://127.0.0.1:9090");
});
test("a .env at the repo root is loaded only when it exists, via node's --env-file-if-exists", () => {
  const plan = buildPlan({ root, env: {}, exists: () => true });
  for (const s of plan.services.slice(0, 2)) assert.ok(s.args.includes("--env-file-if-exists=/repo/.env"), s.name);
});
test("with no .env the flag is omitted so node prints no 'not found' noise", () => {
  const plan = buildPlan({ root, env: {}, exists: () => false });
  for (const s of plan.services) assert.ok(!s.args.some((a) => a.startsWith("--env-file")), s.name);
});
test("the plan never carries secret values, and forces memory backends even if the shell asked for Firestore", () => {
  const plan = buildPlan({ root, env: { QLOO_API_KEY: "SECRETVAL", QLOO_CACHE_BACKEND: "firestore" } });
  assert.ok(!JSON.stringify(plan).includes("SECRETVAL"));
  assert.equal(plan.services[0].env.QLOO_CACHE_BACKEND, "memory");
});
test("missingDeps names the setup command when node_modules are absent", () => {
  const msgs = missingDeps(root, () => false);
  assert.equal(msgs.length, 2);
  assert.match(msgs[0], /npm run setup/);
});
test("banner lists the URLs to open and the sample link", () => {
  const b = banner({ gatewayPort: 8080 }).join("\n");
  assert.match(b, /http:\/\/localhost:5173\/\?sample=1/);
  assert.match(b, /http:\/\/127\.0\.0\.1:8080\/health/);
});
