import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/backtest/cli.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

describe("backtest CLI output location (Qloo data policy)", () => {
  it("defaults --out under private-data/backtest/", () => {
    const a = parseArgs([]);
    expect(resolve(a.out).startsWith(resolve(repoRoot, "private-data/backtest") + "/")).toBe(true);
    expect(a.out).toMatch(/results-[^/]+\.json$/);
    expect(a.cases).toMatch(/backtest\/cases\.json$/);
  });
  it("names the default file after --run", () => {
    expect(parseArgs(["--run", "run3"]).out).toMatch(/private-data\/backtest\/results-run3\.json$/);
  });
  it("refuses a tracked location unless --allow-tracked", () => {
    expect(() => parseArgs(["--out", "backtest/results.json"])).toThrow("results contain Qloo data; write them under private-data/");
    expect(() => parseArgs(["--out", resolve(repoRoot, "backtest/results.json")])).toThrow(/private-data/);
    expect(parseArgs(["--out", resolve(repoRoot, "backtest/results.json"), "--allow-tracked"]).allowTracked).toBe(true);
  });
  it("allows private-data/ and paths outside the repo", () => {
    expect(() => parseArgs(["--out", resolve(repoRoot, "private-data/x/results.json")])).not.toThrow();
    expect(() => parseArgs(["--out", "/var/tmp/results.json"])).not.toThrow();
  });
});
