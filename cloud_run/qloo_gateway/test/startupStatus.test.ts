import { describe, expect, it } from "vitest";
import { startupStatus } from "../src/startupStatus.js";

const gem = { provider: "none" as const, note: "gemini note" };
describe("startupStatus", () => {
  it("with nothing set, names every optional service that is off and what still works", () => {
    const text = startupStatus({}, gem).join("\n");
    expect(text).toContain("QLOO_API_KEY not set: live runs disabled; the sample tour still works");
    expect(text).toContain("gemini note");
    expect(text).toMatch(/TAVILY_API_KEY not set/);
    expect(text).toMatch(/BigQuery analytics off/);
    expect(text).toMatch(/in-memory/);
  });
  it("reports on when configured, never printing values", () => {
    const text = startupStatus({ QLOO_API_KEY: "SECRETQ", TAVILY_API_KEY: "SECRETT", BQ_DATASET: "ds", GOOGLE_CLOUD_PROJECT: "p", QLOO_CACHE_BACKEND: "firestore" }, { provider: "aistudio", note: "Gemini via Google AI Studio" }).join("\n");
    expect(text).not.toContain("SECRETQ");
    expect(text).not.toContain("SECRETT");
    expect(text).not.toMatch(/QLOO_API_KEY not set/);
    expect(text).toMatch(/Tavily web lookups on/);
    expect(text).toMatch(/BigQuery analytics on/);
    expect(text).toMatch(/Firestore/);
  });
  it("blank values count as unset", () => {
    expect(startupStatus({ QLOO_API_KEY: "  " }, gem).join("\n")).toMatch(/QLOO_API_KEY not set/);
  });
});

import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findOnPath } from "../src/startupStatus.js";

describe("findOnPath / harness state", () => {
  it("finds an executable on PATH and reports absence", () => {
    const dir = mkdtempSync(join(tmpdir(), "bin-"));
    const f = join(dir, "qloo"); writeFileSync(f, "#!/bin/sh\n"); chmodSync(f, 0o755);
    expect(findOnPath("qloo", dir)).toBe(f);
    expect(findOnPath("qloo", "/nonexistent-dir")).toBeUndefined();
    expect(findOnPath("/abs/missing/qloo", "")).toBeUndefined();
  });
  it("key set but harness missing says so; key + harness says ready to try", () => {
    const miss = startupStatus({ QLOO_API_KEY: "k" }, gem, { harnessFound: false }).join("\n");
    expect(miss).toMatch(/qloo harness not found/);
    expect(miss).toMatch(/npm i -g @qloo\/qloo-harness/);
    expect(startupStatus({ QLOO_API_KEY: "k" }, gem, { harnessFound: true }).join("\n")).toMatch(/harness found/);
  });
});
