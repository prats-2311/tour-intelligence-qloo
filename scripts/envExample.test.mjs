import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IGNORE = new Set(["NODE_ENV", "PATH"]);

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n === "dist" || n === "tests" || n === "test") continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else if (/\.(ts|js|mjs|py)$/.test(n) && !/\.test\.|test_/.test(n)) out.push(p);
  }
  return out;
}
function envNamesRead() {
  const names = new Set();
  for (const d of ["cloud_run/qloo_gateway/src", "dashboard/server", "cloud_run/agent_mcp_server"]) {
    for (const f of walk(join(root, d))) {
      const s = readFileSync(f, "utf8");
      for (const m of s.matchAll(/(?:process\.env|\benv)\.([A-Z][A-Z0-9_]{2,})/g)) names.add(m[1]);
      for (const m of s.matchAll(/environ(?:\.get)?[(\[]\s*["']([A-Z][A-Z0-9_]+)["']/g)) names.add(m[1]);
    }
  }
  return [...names].filter((n) => !IGNORE.has(n));
}

test(".env.example documents every environment variable the gateway, BFF and MCP server read", () => {
  const text = readFileSync(join(root, ".env.example"), "utf8");
  const documented = new Set([...text.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]));
  const missing = envNamesRead().filter((n) => !documented.has(n));
  assert.deepEqual(missing, []);
});
test(".env.example holds names only: no value after any =", () => {
  const text = readFileSync(join(root, ".env.example"), "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^#?\s*[A-Z][A-Z0-9_]+=(.*)$/);
    if (m) assert.match(m[1].trim(), /^$|^(memory|firestore|1|0|aistudio|vertex|qloo|http:\/\/127\.0\.0\.1:\d+|\d+)$/, line);
  }
});
test(".env.example is not swallowed by .gitignore", () => {
  assert.match(readFileSync(join(root, ".gitignore"), "utf8"), /^!\.env\.example$/m);
});
