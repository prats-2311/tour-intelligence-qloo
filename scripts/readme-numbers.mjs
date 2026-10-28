#!/usr/bin/env node
// Prints the numbers pasted into README.md. Reads private-data/ (never committed); prints aggregates only.
// Run from the worktree root: node scripts/readme-numbers.mjs
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const out = [];
const line = (k, v) => out.push(`${k}: ${v}`);

if (existsSync("private-data/backtest.json")) {
  const p = read("private-data/backtest.json").proofV3;
  line("proofV3.protocolCommit", p.protocolCommit);
  line("proofV3.generatedAt", p.generatedAt);
  line("proofV3.amendments", p.amendments.length);
  for (const t of p.tests) {
    line(`test ${t.id} n`, t.n);
    for (const c of t.claims.slice(0, 5)) line(`test ${t.id} claim`, c);
  }
} else line("proofV3", "private-data/backtest.json missing");

if (existsSync("private-data/showcase.json")) {
  const s = read("private-data/showcase.json");
  line("showcase.artist", s.artist);
  line("showcase.recordedAt", s.recordedAt);
  line("showcase.boardEvents", s.boardEvents.length);
  line("showcase.playbooks (cities)", Object.keys(s.playbooks).length);
  line("showcase.strategist answers", s.strategist.length);
} else line("showcase", "private-data/showcase.json missing");

line("commits since 2026-10-16", execSync("git rev-list --count --since=2026-10-16 HEAD").toString().trim());
console.log(out.join("\n"));
