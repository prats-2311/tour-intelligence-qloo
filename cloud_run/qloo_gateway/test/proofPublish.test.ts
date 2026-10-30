import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../src/backtest/proofCli.js";
import { buildProofV3, parseAmendments, type PublishInputs } from "../src/backtest/proofPublish.js";
import * as publishCli from "../src/backtest/proofPublishCli.js";
import type { CliIo } from "../src/backtest/proofCli.js";
import {
  ARMS, computeCityRankStats, computeFixedStats, type ArmName, type CatchRateSection, type CityRankArtist, type FixedCaseResult, type GroundingSection, type ProofV3Results,
} from "../src/backtest/proofResults.js";

type R = Partial<Record<ArmName, number | null>>;
function artist(position: number, name: string, r: R, N = 4, count = 10): CityRankArtist {
  const arms = Object.fromEntries(ARMS.map((a) => {
    const v = r[a];
    return [a, v === null || v === undefined ? { status: "no_answer", reason: "not_a_permutation" } : { status: "ok", ranking: [], rPrecision: v, hits: [] }];
  })) as CityRankArtist["arms"];
  return { position, artist: name, tourTitle: "T", url: "u", sessionId: `proof-v3-city-${position}`, regions: ["Mexico"], firstShowYear: 2024, playedTotal: 8, boardCount: 8, playedExtras: 1, decoyExtras: 1, boardMostlyPlayed: false, anchoring: [], boardOnly: null, candidateCount: count, n: N, chance: N / count, candidates: [], arms };
}
const base = (commit: string, stop: ProofV3Results["stop"] = { status: "complete" }): ProofV3Results => ({
  schemaVersion: 3, generatedAt: "2026-10-24T00:00:00Z", protocol: { path: "docs/qloo/proof-v3-protocol.md", commit }, calibrationVersion: "cal",
  models: { gemini: ["g1"], geminiUsed: ["g1"] }, callCounts: { qloo: 0, gemini: 0, qlooErrors: 0, geminiErrors: 0 }, geminiErrorTexts: [], stop, summary: [],
});
const batch = (n: number, artists: CityRankArtist[], commit: string, dropped: Array<{ position: number; artist: string; reason: string }> = [], stop?: ProofV3Results["stop"]): ProofV3Results =>
  ({ ...base(commit, stop), cityRank: { batch: n, plannedArtists: 6, plannedTotal: 12, artists, dropped, notRun: [], stats: computeCityRankStats(artists) } });

// 10 artists, 5 per batch: the LLM beats winnability on 6, they tie on 4 (6-0-4 -> p = 0.03125). Artist 10 has no LLM answer? No: all answered here.
const b1 = batch(1, [1, 2, 3, 4, 5].map((i) => artist(i, `Invented Act ${i}`, { winnability: 0.5, fan_heat: 0.5, llm: i <= 3 ? 0.75 : 0.5, population: 0.25 })), "aaaaaaa");
const b2 = batch(2, [6, 7, 8, 9, 10].map((i) => artist(i, `Invented Act ${i}`, { winnability: 0.5, fan_heat: 0.25, llm: i <= 9 ? (i <= 8 ? 0.75 : 0.5) : 0.5, population: 0.25 })), "bbbbbbb", [{ position: 11, artist: "Dropped Act", reason: "heat lookup unavailable" }]);

const fixedCase = (id: string, q: number, g: number, p: number): FixedCaseResult => {
  const arm = (rank: number) => ({ status: "ok" as const, ranking: [], rank, rr: 1 / rank });
  return { id, artist: "Invented Act", city: "Testville", country: "Testland", activationType: "sponsor", status: "scored", realPick: { name: "Real Pick", entityId: "00000000-0000-0000-0000-000000000001" }, candidates: [], arms: { qloo_rank: arm(q), gemini: arm(g), popularity: arm(p) } };
};
const fixedCases = [fixedCase("synth-a", 1, 2, 9), fixedCase("synth-b", 2, 1, 8), fixedCase("synth-c", 1, 1, 10)];
const fixed: ProofV3Results = { ...base("bbbbbbb"), fixedRank: { plannedCases: 4, cases: fixedCases, excluded: [{ id: "synth-d", reason: "too few candidates" }], notRun: [], stats: computeFixedStats(fixedCases) } };
const stoppedRun: ProofV3Results = { ...base("aaaaaaa", { status: "stopped", reason: "error rate 2/15 over the last 15 calls" }), callCounts: { qloo: 12, gemini: 3, qlooErrors: 0, geminiErrors: 2 }, fixedRank: { plannedCases: 4, cases: fixedCases.slice(0, 1), excluded: [], notRun: [], stats: computeFixedStats(fixedCases.slice(0, 1)) } };

const catchSection: CatchRateSection = {
  source: "private-data/showcase.json", claims: 30, planted: 10, caught: 10, catchRate: 1, trueClaims: 20, falseAlarms: 0, falseAlarmRate: 0,
  byType: { number_plausible: { planted: 5, caught: 5, catchRate: 1 }, number_absent: { planted: 4, caught: 4, catchRate: 1 }, entity: { planted: 1, caught: 1, catchRate: 1 } },
  falseAlarmNote: "true claims were drawn from claims the verifier already accepted.", rows: [],
};
const catchRun: ProofV3Results = { ...base("aaaaaaa"), catchRate: catchSection };

const share = (rated: number, inCity: number) => ({ rated, inCity, otherCity: rated - inCity, notExist: 0, cantTell: 1, share: rated ? inCity / rated : null });
const grounding: GroundingSection = {
  artist: "Invented Act", cities: [{ cityId: "1", city: "Testville", country: "Testland" }, { cityId: "2", city: "Mocktown", country: "Testland" }], excluded: [], notRun: [], llmNoAnswer: [], cityDifference: { missing: [], extra: [] },
  rows: { total: 40, rated: 36, unrated: 0, cantTell: 4 },
  byArm: Object.fromEntries((["qloo", "llm"] as const).map((arm) => [arm, { overall: share(18, arm === "qloo" ? 15 : 12), byCategory: { venue: share(6, 5), brand: share(6, 5), local_act: share(6, 5) } }])) as GroundingSection["byArm"],
  perCity: [{ cityId: "1", city: "Testville", qloo: 0.8, llm: 0.6 }, { cityId: "2", city: "Mocktown", qloo: 0.9, llm: 0.7 }],
  meanPerCity: { qloo: 0.85, llm: 0.65 }, signTest: { wins: 2, losses: 0, ties: 0, n: 2, p: 0.5, pairs: 2 },
  secondary: { names: { qloo: 10, llm: 10 }, perCity: [], meanPerCity: { qloo: 0.8, llm: 0.7 }, signTest: { wins: 1, losses: 0, ties: 1, n: 1, p: 1, pairs: 2 } },
};
const groundRun: ProofV3Results = { ...base("bbbbbbb"), grounding: grounding };

const inputs = (over: Partial<PublishInputs> = {}): PublishInputs => ({
  protocolCommit: "ccccccc", amendments: [{ n: 1, commit: "1111111", summary: "First change." }], batches: [b1, b2], fixed, fixedStopped: [stoppedRun], catchRate: catchRun, now: new Date("2026-10-28T00:00:00Z"), ...over,
});
const test = (p: ReturnType<typeof buildProofV3>, id: string) => p.tests.find((t) => t.id === id)!;

describe("buildProofV3: Test A combined over both batches", () => {
  const p = buildProofV3(inputs());
  const a = test(p, "A");
  it("recomputes means over the answered artists and the known sign test (LLM beat winnability 6-0-4, p=0.03125)", () => {
    expect(a.n).toBe(10);
    const llm = a.signTests.find((s) => /generic LLM/i.test(s.label))!;
    expect(llm).toMatchObject({ wins: 0, losses: 6, ties: 4, pairs: 10 });
    expect(llm.p).toBeCloseTo(0.03125, 10);
    const row = (label: string) => a.tables[0]!.rows.find((r) => r[0] === label)!;
    expect(row("Winnability")[1]).toBe("0.50");
    expect(row("The generic LLM")[1]).toBe("0.65");
    expect(row("Chance level")[1]).toBe("0.40");
  });
  it("claim sentences come from the existing claim rule: the LLM beat winnability, fan heat vs winnability is not claimed", () => {
    expect(a.claims.join("\n")).toMatch(/The generic LLM beat winnability \(p=0\.031\)/);
    expect(a.claims.join("\n")).not.toMatch(/Winnability beat (fan heat|the generic LLM)/);
    expect(a.claims[0]).toMatch(/covers 10 of a planned 12 artists/);
  });
  it("limits hold the fixed disclosures, not the claims; the sample-size line states the actual coverage", () => {
    expect(a.limits).toContain("Sample size: 10 of a planned 12 artists completed (1 dropped by rule), a small sample, so the sign test has low power.");
    expect(a.limits.join("\n")).not.toMatch(/12 artists \(or 6\)/);
    expect(a.claims.join("\n")).not.toMatch(/Sample size/);
  });
  it("lists every artist with all four R-precisions and the chance level, and keeps drops", () => {
    expect(a.perUnit!.rows).toHaveLength(10);
    expect(a.perUnit!.columns).toEqual(["Artist", "Winnability", "Fan heat", "The generic LLM", "Population", "Chance"]);
    expect(a.perUnit!.rows[0]![0]).toBe("Invented Act 1");
    expect(a.claims.join("\n")).toMatch(/Dropped Act was dropped \(heat lookup unavailable\)/);
  });
  it("keeps each batch's protocol commit and stop status", () => {
    expect(a.runs).toEqual([
      { label: "Batch 1", commit: "aaaaaaa", status: "complete", note: "5 artists scored" },
      { label: "Batch 2", commit: "bbbbbbb", status: "complete", note: "5 artists scored, 1 dropped" },
    ]);
  });
  it("a stopped batch is reported as stopped and the status says so", () => {
    const stopped = buildProofV3(inputs({ batches: [b1, { ...b2, stop: { status: "stopped", reason: "qloo HTTP 429: x" } }] }));
    const t = test(stopped, "A");
    expect(t.runs![1]).toMatchObject({ status: "stopped" });
    expect(t.status).toMatch(/stopped/i);
  });
});

describe("buildProofV3: the other tests", () => {
  const p = buildProofV3(inputs());
  it("Test B: MRR per arm with chance, claim sentences, per-case ranks, and the stopped first run kept", () => {
    const b = test(p, "B");
    expect(b.n).toBe(3);
    expect(b.tables[0]!.rows.map((r) => r[0])).toEqual(["Qloo rank", "Gemini", "Popularity", "Chance level"]);
    expect(b.claims.join("\n")).toMatch(/Popularity beat|Qloo rank beat popularity|Not significant at this sample size/);
    expect(b.perUnit!.rows[0]).toEqual(["synth-a", "#1", "#2", "#9"]);
    expect(b.runs!.map((r) => r.label)).toEqual(["Run 1 (stopped, infrastructure)", "Run 2"]);
    expect(b.runs![0]).toMatchObject({ status: "stopped" });
    expect(b.signTests.map((s) => s.label)).toEqual(["Qloo rank vs Gemini", "Qloo rank vs popularity"]);
  });
  it("Test B's sample-size line states the actual count", () => {
    expect(test(p, "B").limits).toContain("Sample size: 3 of 4 cases scored, a small sample.");
  });
  it("catch rate: counts per plant type", () => {
    const c = test(p, "catch");
    expect(c.tables[0]!.rows.map((r) => r.join("|"))).toContain("A plausible wrong number|5 of 5");
    expect(c.claims[0]).toMatch(/removed 10 of 10 planted/);
    expect(c.limits.join("\n")).toMatch(/False alarms/);
  });
  it("Test C is omitted when its file is absent and included when present, with aggregates only", () => {
    expect(p.tests.find((t) => t.id === "C")).toBeUndefined();
    const withC = buildProofV3(inputs({ grounding: groundRun }));
    const c = test(withC, "C");
    expect(c.title).toMatch(/names exist/);
    expect(c.tables[0]!.rows.length).toBeGreaterThan(0);
    expect(c.perUnit!.columns).toEqual(["City", "Qloo", "LLM-only"]);
    expect(c.claims.join("\n")).toMatch(/Share of Qloo names rated as existing in the city/);
    expect(c.limits.join("\n")).toMatch(/Disclosure/);
    expect(c.limits.join("\n")).toContain("Raters (Amendment 8): 148 of 182 rows rated by blinded AI agents");
    expect(c.limits.join("\n")).not.toMatch(/one reviewer/);
  });
  it("Test C's limits carry the stopped-run disclosure (from the stopped items file) and the author's prior exposure", () => {
    const stopped = { callCounts: { qloo: 198, gemini: 16, qlooErrors: 0, geminiErrors: 0 }, stop: { status: "stopped" as const, reason: "Qloo call ceiling of 198 reached" }, cities: new Array(9).fill({}), notRun: [{}] };
    const c = test(buildProofV3(inputs({ grounding: groundRun, groundingStopped: [stopped] })), "C");
    expect(c.limits).toContain("Run 1 stopped at the runner's 198-call ceiling after 8 of 9 cities (0 errors); per Amendment 6 the ceiling was raised and Test C re-run from the start before any rating.");
    expect(c.limits).toContain("The author, who rated 34 of the 182 rows, had seen the shipped showcase playbooks (Amendments 5 and 8).");
    expect(test(buildProofV3(inputs({ grounding: groundRun })), "C").limits.join("\n")).not.toMatch(/Run 1 stopped/);
  });
  it("adds amendments and the protocol commit", () => {
    expect(p.protocolCommit).toBe("ccccccc");
    expect(p.amendments).toEqual([{ n: 1, commit: "1111111", summary: "First change." }]);
  });
  it("never states winnability is better", () => {
    expect(JSON.stringify(p)).not.toMatch(/winnability beats|better ranking/i);
  });
});

describe("parseAmendments", () => {
  it("takes the first sentence of the Why / What happened / Question line", () => {
    const md = "## Amendment 1 (2026-10-24, before any call)\n**Why:** the list had flaws. More.\n\n## Amendment 3 (x)\n**What happened:** Test B stopped. Then more.\n\n## Amendment 4: Test C, grounding (d)\n**Question:** do names exist? We compare.\n";
    expect(parseAmendments(md, (n) => `c${n}`)).toEqual([
      { n: 1, commit: "c1", summary: "the list had flaws." }, { n: 3, commit: "c3", summary: "Test B stopped." }, { n: 4, commit: "c4", summary: "do names exist?" },
    ]);
  });
});

describe("proofPublishCli main", () => {
  const mk = () => {
    const dir = mkdtempSync(join(tmpdir(), "proof-publish-"));
    mkdirSync(join(dir, "backtest"));
    const w = (name: string, v: unknown) => writeFileSync(join(dir, "backtest", name), JSON.stringify(v));
    w("proof-v3-city-batch1.json", b1); w("proof-v3-city-batch2.json", b2); w("proof-v3-fixed.json", fixed); w("proof-v3-fixed.stopped-1.json", stoppedRun); w("proof-v3-catch.json", catchRun);
    writeFileSync(join(dir, "backtest.json"), JSON.stringify({ runs: [{ keep: "me" }] }));
    return { dir, w };
  };
  const io = (): CliIo & { lines: string[] } => { const lines: string[] = []; return { lines, log: (l) => lines.push(l), env: {}, makeClients: () => { throw new Error("no network"); }, now: () => new Date("2026-10-28T00:00:00Z") }; };
  const deps = { amendments: () => [{ n: 1, commit: "1111111", summary: "First change." }], protocolCommit: () => "ccccccc" };

  it("writes proofV3 into backtest.json and leaves runs untouched; Test C absent -> omitted", async () => {
    const { dir } = mk();
    const i = io();
    expect(await publishCli.main(["--dir", dir], i, deps)).toBe(0);
    const out = JSON.parse(readFileSync(join(dir, "backtest.json"), "utf8"));
    expect(out.runs).toEqual([{ keep: "me" }]);
    expect(out.proofV3.tests.map((t: { id: string }) => t.id).sort()).toEqual(["A", "B", "catch"]);
    expect(i.lines.some((l) => /covers 10 of a planned 12 artists/.test(l))).toBe(true);
  });
  it("includes Test C when proof-v3-ground.json exists: data only", async () => {
    const { dir, w } = mk();
    w("proof-v3-ground.json", groundRun);
    await publishCli.main(["--dir", dir], io(), deps);
    const out = JSON.parse(readFileSync(join(dir, "backtest.json"), "utf8"));
    expect(out.proofV3.tests.map((t: { id: string }) => t.id)).toContain("C");
  });
  it("the default arguments (the real private-data/) are accepted", () => {
    expect(publishCli.parseArgs([]).dir).toBe(join(REPO_ROOT, "private-data"));
  });
  it("refuses an output path inside the repo but outside private-data/", async () => {
    const { dir } = mk();
    expect(() => publishCli.parseArgs(["--dir", dir, "--out", join(REPO_ROOT, "dashboard/backtest.json")])).toThrow(/private-data/);
    expect(() => publishCli.parseArgs(["--dir", join(REPO_ROOT, "docs")])).toThrow(/private-data/);
  });
});

// Amendment 7: Test F ------------------------------------------------------------------------------------------------------------

import type { FusionFile, FusionSummary, Subset } from "../src/backtest/fusion.js";

const fRow = (id: string, g: number, q: number, f: number) => ({ id, scores: { gemini: g, qloo_rank: q, popularity: 0.1 }, fusion: f });
const summ = (n: number, means: Record<string, number | null>, st: { wins: number; losses: number; ties: number; p: number }, claim: boolean, rows: FusionSummary["rows"] = []): FusionSummary =>
  ({ n, rows, exclusions: [], means, signTest: { ...st, n: st.wins + st.losses, pairs: n }, claim });
const emptySubset: Subset = { ...summ(0, { gemini: null, qloo_rank: null, popularity: null, fusion: null }, { wins: 0, losses: 0, ties: 0, p: 1 }, false), exploratory: true };
const fusionFile = (over: Partial<FusionFile> = {}): FusionFile => ({
  schemaVersion: 1, generatedAt: "2026-10-29T00:00:00Z", rule: { name: "rrf", k: 60, tieBreak: "llm-rank" }, sanity: { testB: "passed", testA: "passed" },
  testB: {
    planned: 27, scored: 3,
    full: summ(3, { gemini: 0.5, qloo_rank: 0.4, popularity: 0.1, fusion: 0.45 }, { wins: 1, losses: 2, ties: 0, p: 1 }, false, [fRow("synth-a", 0.5, 1, 0.5), fRow("synth-b", 1, 0.5, 0.5), fRow("synth-c", 0.25, 0.25, 0.25)]),
    postCutoff: { ...summ(2, { gemini: 0.3, qloo_rank: 0.4, popularity: 0.1, fusion: 0.5 }, { wins: 2, losses: 0, ties: 0, p: 0.5 }, false), exploratory: true },
  },
  testA: {
    artists: 10,
    full: summ(10, { llm: 0.8, winnability: 0.6, fan_heat: 0.6, population: 0.7, fusion: 0.75 }, { wins: 0, losses: 4, ties: 6, p: 0.125 }, false, [{ id: "Invented Act 1", scores: { llm: 0.8, winnability: 0.6, fan_heat: 0.6, population: 0.7 }, fusion: 0.75 }]),
    postCutoff: emptySubset,
  },
  ...over,
});

describe("buildProofV3: Test F (Amendment 7)", () => {
  const withF = buildProofV3(inputs({ fusion: fusionFile() }));
  const F = test(withF, "F");
  it("leaves Tests A, B and catch exactly as published when F is added", () => {
    const without = buildProofV3(inputs());
    for (const id of ["A", "B", "catch"]) expect(JSON.stringify(test(withF, id))).toBe(JSON.stringify(test(without, id)));
    expect(without.tests.map((t) => t.id)).not.toContain("F");
  });
  it("has the Amendment 7 title and question and the fused tables", () => {
    expect(F.title).toBe("Gemini + Qloo combined (Amendment 7)");
    expect(F.question).toBe("Does Gemini's ranking get better when Qloo's ranking is fused in?");
    const rows = F.tables.flatMap((t) => t.rows.map((r) => r.join("|")));
    expect(rows.some((r) => /Gemini \+ Qloo\|0\.45/.test(r))).toBe(true);
    expect(rows.some((r) => /0\.75/.test(r))).toBe(true);
  });
  it("sign tests: fusion vs Gemini and vs the LLM, and the exploratory ones labelled", () => {
    const labels = F.signTests.map((s) => s.label);
    expect(labels.filter((l) => /exploratory/.test(l)).length).toBe(2);
    expect(labels.some((l) => /vs Gemini/.test(l) && !/exploratory/.test(l))).toBe(true);
    expect(labels.some((l) => /vs the generic LLM/.test(l) && !/exploratory/.test(l))).toBe(true);
  });
  it("no claim when the rule is not met: states the plain, not-significant result", () => {
    expect(F.claims.join(" ")).not.toMatch(/ranked the real tour's pick better/);
    expect(F.claims.join(" ")).toMatch(/Not significant at this sample size/);
  });
  it("a Test B claim uses the protocol's wording when the claim rule is met", () => {
    const f = fusionFile();
    f.testB.full = summ(10, { gemini: 0.4, qloo_rank: 0.4, popularity: 0.1, fusion: 0.6 }, { wins: 9, losses: 1, ties: 0, p: 0.0215 }, true);
    expect(test(buildProofV3(inputs({ fusion: f })), "F").claims.join(" ")).toMatch(/^Gemini \+ Qloo ranked the real tour's pick better than Gemini alone \(p=0\.021/m);
  });
  it("limits carry the disclosure, the fixed rule, and exploratory / small n; an empty subset is reported as empty", () => {
    const l = F.limits.join("\n");
    expect(l).toMatch(/Disclosure/);
    expect(l).toMatch(/29 October 2026/);
    expect(l).toMatch(/k = 60/);
    expect(l).toMatch(/exploratory, small n/i);
    expect(l).toMatch(/Test A[^.]*n = 0|no Test A artist/i);
  });
  it("per-unit rows list cases and artists with aggregates only", () => {
    expect(F.perUnit!.rows.length).toBe(4);
    expect(F.perUnit!.rows[0]![0]).toBe("B");
  });
});

describe("proofPublishCli main with the fusion file", () => {
  it("adds F only when proof-v3-fusion.json exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "proof-publish-f-"));
    mkdirSync(join(dir, "backtest"));
    const w = (name: string, v: unknown) => writeFileSync(join(dir, "backtest", name), JSON.stringify(v));
    w("proof-v3-city-batch1.json", b1); w("proof-v3-city-batch2.json", b2); w("proof-v3-fixed.json", fixed); w("proof-v3-catch.json", catchRun);
    const lines: string[] = [];
    const io: CliIo = { log: (l) => lines.push(l), env: {}, makeClients: () => { throw new Error("no network"); }, now: () => new Date("2026-10-29T00:00:00Z") };
    const deps = { amendments: () => [], protocolCommit: () => "ccccccc" };
    await publishCli.main(["--dir", dir], io, deps);
    expect(JSON.parse(readFileSync(join(dir, "backtest.json"), "utf8")).proofV3.tests.map((t: { id: string }) => t.id)).not.toContain("F");
    w("proof-v3-fusion.json", fusionFile());
    await publishCli.main(["--dir", dir], io, deps);
    expect(JSON.parse(readFileSync(join(dir, "backtest.json"), "utf8")).proofV3.tests.map((t: { id: string }) => t.id)).toContain("F");
  });
});
