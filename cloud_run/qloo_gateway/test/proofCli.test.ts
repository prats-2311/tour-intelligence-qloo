import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createGatewayCaller } from "../src/backtest/cli.js";
import * as catchCli from "../src/backtest/catchRateCli.js";
import * as cityCli from "../src/backtest/cityRankCli.js";
import * as fixedCli from "../src/backtest/fixedRankCli.js";
import type { CliIo } from "../src/backtest/proofCli.js";
import { protocolCommit, REPO_ROOT } from "../src/backtest/proofCli.js";
import type { ProofV3Results } from "../src/backtest/proofResults.js";
import { SCORING } from "../src/scoring/calibration.js";

const tmp = () => mkdtempSync(join(tmpdir(), "proof-v3-"));
const noNetwork: CliIo["makeClients"] = () => { throw new Error("network clients must not be built"); };
function io(over: Partial<CliIo> = {}): CliIo & { lines: string[] } {
  const lines: string[] = [];
  return { lines, log: (l) => lines.push(l), env: {}, makeClients: noNetwork, now: () => new Date("2026-10-24T12:00:00Z"), ...over };
}

describe("createGatewayCaller noRetryStatuses", () => {
  it("fails a listed status at once; the default still retries it", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("slow down", { status: 429 }));
    const strict = createGatewayCaller({ baseUrl: "https://gw.example", token: "SECRET-TOKEN", fetchImpl, backoffMs: 0, noRetryStatuses: [429] });
    await expect(strict("qloo_describe", {}, "s")).rejects.toThrow(/HTTP 429/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const lax = createGatewayCaller({ baseUrl: "https://gw.example", token: "SECRET-TOKEN", fetchImpl, backoffMs: 0 });
    await expect(lax("qloo_describe", {}, "s")).rejects.toThrow(/HTTP 429/);
    expect(fetchImpl).toHaveBeenCalledTimes(1 + 3);
  });
});

describe("createGatewayCaller stale flag", () => {
  it("keeps the gateway's stale flag on the envelope", async () => {
    const body = (stale: boolean) => new Response(JSON.stringify({ envelope: { operation: "x", status: "ok", results: [] }, cacheKey: "k", cached: true, stale }), { status: 200 });
    const stale = createGatewayCaller({ baseUrl: "https://gw.example", token: "SECRET-TOKEN", fetchImpl: vi.fn().mockResolvedValue(body(true)) });
    expect((await stale("t", {}, "s")).stale).toBe(true);
    const fresh = createGatewayCaller({ baseUrl: "https://gw.example", token: "SECRET-TOKEN", fetchImpl: vi.fn().mockResolvedValue(body(false)) });
    expect((await fresh("t", {}, "s")).stale).toBeUndefined();
  });
});

describe("Test A CLI", () => {
  it("--batch is required and must be 1 or 2; --out defaults under private-data/backtest and refuses tracked paths", () => {
    expect(() => cityCli.parseArgs([])).toThrow(/--batch/);
    expect(() => cityCli.parseArgs(["--batch", "3"])).toThrow(/--batch/);
    const a = cityCli.parseArgs(["--batch", "2"]);
    expect(a.out).toBe(resolve(REPO_ROOT, "private-data/backtest/proof-v3-city-batch2.json"));
    expect(() => cityCli.parseArgs(["--batch", "1", "--out", "backtest/city/out.json"])).toThrow(/private-data/);
    expect(() => cityCli.parseArgs(["--batch", "1", "--out", resolve(REPO_ROOT, "docs/x.json")])).toThrow(/private-data/);
    expect(() => cityCli.parseArgs(["--batch", "1", "--out", "/var/tmp/x.json", "--allow-tracked"])).not.toThrow();
  });

  it("the plan for a batch is the fixed artist list joined with its ground truth", () => {
    const b1 = cityCli.loadPlan(1);
    expect(b1.map((c) => c.position)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(cityCli.loadPlan(2).map((c) => c.position)).toEqual([7, 8, 9, 10, 11, 12]);
    expect(b1.every((c) => c.regions.length > 0 && c.played.length >= 6)).toBe(true);
  });

  it("--dry-run prints the plan and builds no network client (zero calls)", async () => {
    const x = io();
    const code = await cityCli.main(["--batch", "1", "--dry-run"], x);
    expect(code).toBe(0);
    const text = x.lines.join("\n");
    for (const c of cityCli.loadPlan(1)) {
      expect(text).toContain(c.artist);
      expect(text).toContain(`proof-v3-city-${c.position}`);
    }
    expect(text).toMatch(/DRY RUN/);
    expect(text).toMatch(/Qloo calls/);
    expect(text).toMatch(/429/);
    expect(text).toMatch(/Amendment 2/);
    expect(text).toContain("over the last 20 Qloo calls (evaluated once 10 are seen");
    expect(text).toContain("Queens -> New York City"); // re-anchored played cities are listed up front
    expect(text).toContain("Vallejo -> Concord");
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/); // no Qloo ids
  });

  it("a 429 on the first call exits non-zero and writes partial results naming the dropped and not-run artists", async () => {
    const out = join(tmp(), "city.json");
    const calls: string[] = [];
    const x = io({ makeClients: () => ({ callTool: async (n) => { calls.push(n); throw new Error(`${n}: HTTP 429`); }, generate: async () => { throw new Error("no gemini"); }, models: ["m1", "m2"] }) });
    const code = await cityCli.main(["--batch", "1", "--out", out], x);
    expect(code).toBe(1);
    expect(calls).toEqual(["qloo_describe"]); // nothing sent after the 429
    const r = JSON.parse(readFileSync(out, "utf8")) as ProofV3Results;
    expect(r.schemaVersion).toBe(3);
    expect(r.stop.status).toBe("stopped");
    expect(r.stop.reason).toMatch(/429/);
    expect(r.cityRank!.artists).toEqual([]);
    expect(r.cityRank!.dropped.map((d) => d.position)).toEqual([1]);
    expect(r.cityRank!.notRun.map((d) => d.position)).toEqual([2, 3, 4, 5, 6]);
    expect(r.protocol.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(r.protocol.commit).toBe(protocolCommit());
    expect(r.calibrationVersion).toBe(SCORING.version);
    expect(r.models).toEqual({ gemini: ["m1", "m2"], geminiUsed: [] });
    expect(r.callCounts).toMatchObject({ qloo: 1, gemini: 0, qlooErrors: 1 });
    expect(r.summary.join(" ")).toMatch(/0 of a planned 12/);
  });
});

describe("Test B CLI", () => {
  it("defaults to the 27 reviewed cases and private-data/backtest/proof-v3-fixed.json", () => {
    const a = fixedCli.parseArgs([]);
    expect(a.out).toBe(resolve(REPO_ROOT, "private-data/backtest/proof-v3-fixed.json"));
    expect(fixedCli.loadCases(a.cases)).toHaveLength(27);
    expect(() => fixedCli.parseArgs(["--out", "backtest/x.json"])).toThrow(/private-data/);
  });
  it("--dry-run lists the cases and makes no call", async () => {
    const x = io();
    expect(await fixedCli.main(["--dry-run"], x)).toBe(0);
    expect(x.lines.join("\n")).toMatch(/27 cases/);
    expect(x.lines.join("\n")).toMatch(/DRY RUN/);
  });
  it("a 429 exits non-zero with partial results", async () => {
    const out = join(tmp(), "fixed.json");
    const x = io({ makeClients: () => ({ callTool: async () => { throw new Error("HTTP 429"); }, generate: async () => { throw new Error("x"); }, models: ["m"] }) });
    expect(await fixedCli.main(["--out", out], x)).toBe(1);
    const r = JSON.parse(readFileSync(out, "utf8")) as ProofV3Results;
    expect(r.stop.status).toBe("stopped");
    expect(r.fixedRank!.excluded).toHaveLength(1);
    expect(r.fixedRank!.notRun).toHaveLength(26);
  });
});

describe("catch-rate CLI", () => {
  it("reads a showcase path argument, runs offline and writes the results shape", async () => {
    // A tiny synthetic showcase would have too few claims, so build 4 playbooks of 10 true claims each.
    const doc: { playbooks: Record<string, unknown> } = { playbooks: {} };
    for (let p = 0; p < 4; p += 1) {
      const items = Array.from({ length: 8 }, (_, i) => ({ entityId: `00000000-p${p}i${i}`, name: `Brand${String.fromCharCode(65 + p)}${String.fromCharCode(97 + i)}x`, affinity: Math.round((0.99 - i * 0.021 - p * 0.003) * 100) / 100 }));
      const claims = Array.from({ length: 10 }, (_, k) => { const a = items[k % 8]!, b = items[(k + 3) % 8]!; return { text: `${a.name} (${a.affinity}) and ${b.name} (${b.affinity}) fit slot ${String.fromCharCode(97 + k)}.`, entities: [{ name: a.name }, { name: b.name }], numbers: [a.affinity, b.affinity], evidence_refs: [`sponsors:${k % 8}`, `sponsors:${(k + 3) % 8}`] }; });
      doc.playbooks[`${p}`] = [{ type: "playbook", playbook: { city: { name: "Testtown", country: "MX" }, cards: [{ kind: "sponsors", status: "ok", items }] } }, { type: "narrative", narrative: { status: "ok", cards: { sponsors: { verified: claims, removed: [] } } } }];
    }
    const dir = tmp();
    const input = join(dir, "showcase.json");
    writeFileSync(input, JSON.stringify(doc));
    const out = join(dir, "catch.json");
    const x = io();
    expect(await catchCli.main([input, "--out", out], x)).toBe(0);
    const r = JSON.parse(readFileSync(out, "utf8")) as ProofV3Results;
    expect(r.schemaVersion).toBe(3);
    expect(r.catchRate).toMatchObject({ claims: 30, planted: 10, trueClaims: 20 });
    expect(r.callCounts).toEqual({ qloo: 0, gemini: 0, qlooErrors: 0, geminiErrors: 0 });
    expect(x.lines.join("\n")).toMatch(/of 10 planted false claims/);
  });
  it("defaults to private-data/showcase.json in and private-data/backtest/proof-v3-catch.json out; refuses a tracked output", () => {
    const a = catchCli.parseArgs([]);
    expect(a.input).toBe(resolve(REPO_ROOT, "private-data/showcase.json"));
    expect(a.out).toBe(resolve(REPO_ROOT, "private-data/backtest/proof-v3-catch.json"));
    expect(catchCli.parseArgs(["other.json", "--out", "/var/tmp/c.json"]).input).toBe(resolve("other.json"));
    expect(() => catchCli.parseArgs(["--out", "docs/c.json"])).toThrow(/private-data/);
  });
});
