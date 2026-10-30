#!/usr/bin/env node
// One command for a local run: gateway (in-memory backends) + dashboard BFF + Vite. Works with no keys (sample mode).
// Optional keys come from the shell or a repo-root .env (see .env.example). Values are never printed.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function buildPlan({ root, env, exists = existsSync }) {
  const gatewayPort = String(env.GATEWAY_PORT || "8080");
  const envArgs = exists(join(root, ".env")) ? [`--env-file-if-exists=${join(root, '.env')}`] : [];
  return {
    gatewayPort: Number(gatewayPort),
    services: [
      { name: "gateway", cwd: join(root, "cloud_run/qloo_gateway"), cmd: process.execPath, args: [...envArgs, "dist/server.js"],
        env: { PORT: gatewayPort, QLOO_CACHE_BACKEND: "memory", QLOO_USAGE_BACKEND: "memory" } },
      { name: "bff", cwd: join(root, "dashboard"), cmd: process.execPath, args: [...envArgs, "server/index.js"],
        env: { PORT: "8787", QLOO_GATEWAY_URL: `http://127.0.0.1:${gatewayPort}` } },
      { name: "vite", cwd: join(root, "dashboard"), cmd: process.execPath, args: ["node_modules/vite/bin/vite.js"], env: {} },
    ],
  };
}

export function missingDeps(root, exists = existsSync) {
  return ["cloud_run/qloo_gateway", "dashboard"]
    .filter((d) => !exists(join(root, d, "node_modules")))
    .map((d) => `${d}/node_modules is missing: run \`npm run setup\` first`);
}

export function banner({ gatewayPort }) {
  return [
    "",
    "Local run is starting. Open:",
    "  http://localhost:5173/?sample=1     the sample tour (no keys needed)",
    `  http://127.0.0.1:${gatewayPort}/health   gateway state (connected:true once a live Qloo call has worked)`,
    "Live Qloo and Gemini need keys: see .env.example and the README Configuration table. Ctrl+C stops everything.",
    "",
  ];
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22) { console.error(`Node 22 or newer is required (this is ${process.versions.node}).`); process.exit(1); }
  const missing = missingDeps(root);
  if (missing.length) { missing.forEach((m) => console.error(m)); process.exit(1); }
  const plan = buildPlan({ root, env: process.env });
  console.log("[dev] building the gateway ...");
  const build = spawnSync("npm", ["run", "build"], { cwd: join(root, "cloud_run/qloo_gateway"), stdio: "inherit" });
  if (build.status !== 0) { console.error("[dev] gateway build failed"); process.exit(1); }
  const children = plan.services.map((s) => {
    const child = spawn(s.cmd, s.args, { cwd: s.cwd, env: { ...process.env, ...s.env }, stdio: ["ignore", "pipe", "pipe"] });
    const tag = `[${s.name}]`.padEnd(10);
    for (const stream of [child.stdout, child.stderr]) {
      let buf = "";
      stream.on("data", (d) => { buf += d; const lines = buf.split("\n"); buf = lines.pop(); lines.forEach((l) => console.log(`${tag}${l}`)); });
    }
    child.on("exit", (code) => { if (!stopping) { console.error(`${tag}exited (${code}); stopping the rest`); stop(1); } });
    return child;
  });
  let stopping = false;
  function stop(code) { stopping = true; children.forEach((c) => c.kill("SIGTERM")); setTimeout(() => process.exit(code), 500); }
  process.on("SIGINT", () => stop(0));
  process.on("SIGTERM", () => stop(0));
  setTimeout(() => banner(plan).forEach((l) => console.log(l)), 2500);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
