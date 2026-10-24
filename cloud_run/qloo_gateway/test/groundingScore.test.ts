import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_ROOT } from "../src/backtest/proofCli.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GroundKey } from "../src/backtest/grounding.js";
import { scoreGrounding, type GroundItemsFile } from "../src/backtest/groundingScore.js";
import * as scoreCli from "../src/backtest/groundingScoreCli.js";
import type { CliIo } from "../src/backtest/proofCli.js";
import { signTest } from "../src/backtest/proofStats.js";
import type { Rating } from "../src/backtest/groundingSheet.js";

type Arm = "qloo" | "llm";
interface Spec { id: string; cityId: string; city: string; category: "venue" | "brand" | "local_act"; arms: Arm[]; rating: Rating | null }
function fixture(specs: Spec[], opts: { llmMissing?: string[] } = {}) {
  const key: GroundKey = { rows: Object.fromEntries(specs.map((s) => [s.id, { cityId: s.cityId, city: s.city, country: "MX", category: s.category, name: `n-${s.id}`, arms: s.arms }])) };
  const cityIds = [...new Set(specs.map((s) => s.cityId))];
  const items: GroundItemsFile = {
    schemaVersion: 1, generatedAt: "2026-10-24T12:00:00.000Z", protocolCommit: "abc", artist: "Test Artist", models: ["m"], geminiUsed: ["m"],
    callCounts: { qloo: 10, gemini: 4, qlooErrors: 0, geminiErrors: 0 }, stop: { status: "complete" },
    cityDifference: { missing: [], extra: [] }, excluded: [], notRun: [],
    cities: cityIds.map((id) => ({ cityId: id, city: specs.find((s) => s.cityId === id)!.city, country: "MX", qloo: "ok" as const, llm: opts.llmMissing?.includes(id) ? ("no_answer" as const) : ("ok" as const) })),
    items: [],
  };
  const ratings = new Map(specs.map((s) => [s.id, s.rating] as const));
  return { key, items, ratings };
}
let n = 0;
const s = (cityId: string, category: Spec["category"], arms: Arm[], rating: Rating | null): Spec => { n += 1; return { id: `r${String(n).padStart(3, "0")}`, cityId, city: `City${cityId}`, category, arms, rating }; };

describe("scoreGrounding", () => {
  it("computes the in-city share per arm and category, excluding cant_tell from the denominator and counting it", () => {
    n = 0;
    const f = fixture([
      s("1", "venue", ["qloo"], "in_city"), s("1", "venue", ["qloo"], "in_city"), s("1", "venue", ["qloo"], "not_exist"), s("1", "venue", ["qloo"], "cant_tell"),
      s("1", "venue", ["llm"], "other_city"), s("1", "venue", ["llm"], "in_city"),
      s("1", "brand", ["qloo"], "in_city"), s("1", "brand", ["llm"], "not_exist"),
    ]);
    const r = scoreGrounding(f);
    const qv = r.byArm.qloo.byCategory.venue;
    expect(qv).toMatchObject({ rated: 3, inCity: 2, otherCity: 0, notExist: 1, cantTell: 1 });
    expect(qv.share).toBeCloseTo(2 / 3, 10);
    expect(r.byArm.llm.byCategory.venue.share).toBeCloseTo(0.5, 10);
    expect(r.byArm.llm.byCategory.local_act.share).toBeNull();
    expect(r.byArm.qloo.overall.share).toBeCloseTo(3 / 4, 10);
  });
  it("credits a shared row to both arms", () => {
    n = 0;
    const r = scoreGrounding(fixture([s("1", "venue", ["llm", "qloo"], "in_city"), s("1", "venue", ["qloo"], "not_exist")]));
    expect(r.byArm.llm.byCategory.venue).toMatchObject({ rated: 1, inCity: 1 });
    expect(r.byArm.qloo.byCategory.venue).toMatchObject({ rated: 2, inCity: 1 });
  });
  it("per-city shares and the paired two-sided exact sign test, ties dropped", () => {
    n = 0;
    const specs: Spec[] = [];
    // 8 cities: qloo wins 6, loses 1, ties 1.
    const outcomes: Array<[Rating, Rating]> = [
      ["in_city", "not_exist"], ["in_city", "not_exist"], ["in_city", "not_exist"], ["in_city", "other_city"], ["in_city", "not_exist"], ["in_city", "not_exist"],
      ["not_exist", "in_city"], ["in_city", "in_city"],
    ];
    outcomes.forEach(([q, l], i) => { specs.push(s(String(i + 1), "venue", ["qloo"], q), s(String(i + 1), "venue", ["llm"], l)); });
    const r = scoreGrounding(fixture(specs));
    expect(r.signTest).toMatchObject({ wins: 6, losses: 1, ties: 1, n: 7, pairs: 8 });
    expect(r.signTest.p).toBeCloseTo(signTest([[1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [0, 1]]).p, 12);
    expect(r.signTest.p).toBeCloseTo(0.125, 10); // 2 * (1 + 7) / 128
    expect(r.perCity).toHaveLength(8);
    expect(r.perCity[0]).toMatchObject({ cityId: "1", qloo: 1, llm: 0 });
    // 6 wins to 1 loss, p = 0.125: not significant.
    expect(r.summary.join(" ")).toMatch(/Not significant at this sample size/);
  });
  it("applies the claim rule: a higher mean, more wins and p < 0.05 gives 'beat'; a significant loss is stated as plainly", () => {
    n = 0;
    const specs: Spec[] = [];
    for (let i = 1; i <= 7; i += 1) specs.push(s(String(i), "venue", ["qloo"], "in_city"), s(String(i), "venue", ["llm"], "not_exist"));
    const win = scoreGrounding(fixture(specs));
    expect(win.signTest.p).toBeCloseTo(2 / 128, 10);
    expect(win.summary.some((l) => /^Qloo beat the LLM-only playbook \(p=0\.016\)/.test(l))).toBe(true);
    n = 0;
    const lose: Spec[] = [];
    for (let i = 1; i <= 7; i += 1) lose.push(s(String(i), "venue", ["qloo"], "not_exist"), s(String(i), "venue", ["llm"], "in_city"));
    expect(scoreGrounding(fixture(lose)).summary.some((l) => /^The LLM-only playbook beat Qloo/.test(l))).toBe(true);
  });
  it("a city where an arm has no answer or no rated rows is not paired", () => {
    n = 0;
    const specs = [s("1", "venue", ["qloo"], "in_city"), s("2", "venue", ["qloo"], "in_city"), s("2", "venue", ["llm"], "not_exist"), s("3", "venue", ["qloo"], "in_city"), s("3", "venue", ["llm"], "cant_tell")];
    const r = scoreGrounding(fixture(specs, { llmMissing: ["1"] }));
    expect(r.signTest.pairs).toBe(1);
    expect(r.perCity.find((c) => c.cityId === "3")).toMatchObject({ llm: null });
  });
  it("reports unrated rows and refuses above 5% unless allowed", () => {
    n = 0;
    const specs: Spec[] = [];
    for (let i = 0; i < 18; i += 1) specs.push(s("1", "venue", ["qloo"], "in_city"));
    specs.push(s("1", "venue", ["llm"], null), s("1", "venue", ["llm"], null)); // 2 of 20 = 10%
    const f = fixture(specs);
    expect(() => scoreGrounding(f)).toThrow(/unrated/i);
    const ok = scoreGrounding(f, { allowPartial: true });
    expect(ok.rows).toMatchObject({ total: 20, unrated: 2, rated: 18 });
    // Exactly 5% passes.
    n = 0;
    const edge: Spec[] = [];
    for (let i = 0; i < 19; i += 1) edge.push(s("1", "venue", ["qloo"], "in_city"));
    edge.push(s("1", "venue", ["llm"], null));
    expect(scoreGrounding(fixture(edge)).rows.unrated).toBe(1);
  });
  it("refuses ratings for unknown row ids and keys whose rows are missing from the CSV", () => {
    n = 0;
    const f = fixture([s("1", "venue", ["qloo"], "in_city")]);
    f.ratings.set("r999", "in_city");
    expect(() => scoreGrounding(f)).toThrow(/r999/);
    n = 0;
    const g = fixture([s("1", "venue", ["qloo"], "in_city")]);
    g.ratings.delete("r001");
    expect(() => scoreGrounding(g)).toThrow(/r001/);
  });
  it("summary sentences carry no row names", () => {
    n = 0;
    const r = scoreGrounding(fixture([s("1", "venue", ["qloo"], "in_city"), s("1", "venue", ["llm"], "not_exist")]));
    expect(r.summary.join(" ")).not.toMatch(/n-r00/);
  });
});

describe("score CLI", () => {
  const noNetwork: CliIo["makeClients"] = () => { throw new Error("no network"); };
  const io = (): CliIo & { lines: string[] } => { const lines: string[] = []; return { lines, log: (l) => lines.push(l), env: {}, makeClients: noNetwork, now: () => new Date("2026-10-24T12:00:00Z") }; };
  it("reads key, items and CSV and writes a ProofV3Results file with a grounding section, only under private-data", async () => {
    n = 0;
    const f = fixture([s("1", "venue", ["qloo"], "in_city"), s("1", "venue", ["llm"], "not_exist")]);
    const dir = mkdtempSync(join(tmpdir(), "gscore-"));
    writeFileSync(join(dir, "key.json"), JSON.stringify(f.key));
    writeFileSync(join(dir, "items.json"), JSON.stringify(f.items));
    writeFileSync(join(dir, "ratings.csv"), "row_id,rating\nr001,in_city\nr002,not_exist\n");
    expect(() => scoreCli.parseArgs(["--csv", join(dir, "ratings.csv"), "--out", resolve(REPO_ROOT, "docs/x.json")])).toThrow(/private-data/);
    const a = scoreCli.parseArgs(["--csv", "ratings.csv"]);
    expect(a.out).toMatch(/private-data\/backtest\/proof-v3-ground\.json$/);
    const out = join(dir, "out.json");
    const code = await scoreCli.run({ csv: join(dir, "ratings.csv"), key: join(dir, "key.json"), items: join(dir, "items.json"), out, allowPartial: false }, io());
    expect(code).toBe(0);
    const res = JSON.parse(readFileSync(out, "utf8"));
    expect(res.schemaVersion).toBe(3);
    expect(res.grounding.byArm.qloo.overall.share).toBe(1);
    expect(res.summary.length).toBeGreaterThan(0);
  });
});
