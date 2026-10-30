import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { advanceCases, answerCases, documentCases, runCheckers, scoreCases, sponsorCases, type CheckerCase } from "../src/backtest/checkerCatch.js";
import { main, parseArgs } from "../src/backtest/checkerCatchCli.js";
import { REPO_ROOT } from "../src/backtest/proofCli.js";
import { numberTokens } from "../src/claims/verify.js";

const counts = (cs: CheckerCase[]) => ({ planted: cs.filter((c) => c.planted).length, controls: cs.filter((c) => !c.planted).length });

describe("generators follow Amendment 10", () => {
  it("each checker has 20 plants and 20 controls with unique ids", () => {
    for (const cs of [answerCases(), documentCases(), advanceCases(), sponsorCases().main]) {
      expect(counts(cs)).toEqual({ planted: 20, controls: 20 });
      expect(new Set(cs.map((c) => c.id)).size).toBe(40);
    }
  });
  it("is deterministic", () => {
    expect(answerCases().map((c) => c.text)).toEqual(answerCases().map((c) => c.text));
    expect(advanceCases().map((c) => c.text)).toEqual(advanceCases().map((c) => c.text));
  });
  it("10.a: group sizes and sample texts", () => {
    const cs = answerCases();
    const by = (g: string) => cs.filter((c) => c.group === g);
    expect(["absent", "absent_abs", "wrong_sign", "percent_index"].map((g) => by(g).length)).toEqual([8, 4, 4, 4]);
    expect(["present", "sign_dropped", "score_plain", "percent_non_score"].map((g) => by(g).length)).toEqual([8, 6, 3, 3]);
    expect(by("absent")[0]!.text).toBe("Attendance reached 1,007.");
    expect(by("absent_abs")[0]!.text).toBe("The venue sits near 75.11 west.");
    expect(by("wrong_sign")[1]!.text).toBe("The age band indexes at +0.11 above average.");
    expect(by("percent_index")[0]!.text).toBe("About 14% of the audience is in that band.");
    expect(by("sign_dropped")[0]!.text).toBe("The venue sits near 70.00 west.");
    expect(by("present")[1]!.text).toBe("Attendance reached 1,053.");
    expect(by("percent_non_score")[2]!.text).toBe("32% of ticket buyers used the presale.");
  });
  it("10.a: every absent plant number is on no fixture value (also by absolute value)", () => {
    const pool = new Set<number>();
    for (let k = 0; k < 20; k += 1) pool.add(1000 + 53 * k);
    for (const c of answerCases().filter((x) => x.group === "absent")) for (const t of numberTokens(c.text)) expect(pool.has(t.value)).toBe(false);
  });
  it("10.b: group sizes, wrong page is the next page, and the number is not on the cited page", () => {
    const cs = documentCases();
    const by = (g: string) => cs.filter((c) => c.group === g);
    expect(["absent_page", "wrong_page", "tool_only"].map((g) => by(g).length)).toEqual([7, 7, 6]);
    expect(by("wrong_page")[0]!.text).toBe("That date drew 341 tickets [doc:rec p.2].");
    expect(by("absent_page")[0]!.text).toBe("That date drew 350 tickets [doc:rec p.1].");
    expect(by("tool_only")[0]!.text).toBe("The fit was 7,000 [doc:rec p.1].");
    expect(cs.filter((c) => !c.planted)[10]!.text).toBe("Gross was 5,730 [doc:rec p.1].");
  });
  it("10.c: the 10 other-country sources are fixed, and the 10 number plants use the documented formulas", () => {
    const cs = advanceCases();
    const other = cs.filter((c) => c.group === "other_country");
    expect(other).toHaveLength(10);
    expect(other[0]!.text).toBe("Foreign performers in Canada may need a work permit; the fee is 155 dollars and processing takes 14 days.");
    expect(cs.filter((c) => c.group === "number_absent")[0]!.text).toBe("The fee is 154 dollars.");
    expect(cs.filter((c) => c.group === "number_other_source")[0]!.text).toBe("Allow 28 business days.");
    expect(cs.filter((c) => !c.planted)[19]!.text).toBe("Allow 67 business days and a fee of 625 dollars.");
  });
  it("10.d: names, lists of ten, and the fixed classifier table", () => {
    const s = sponsorCases();
    expect(s.main.filter((c) => c.planted).map((c) => c.text).slice(0, 2)).toEqual(["Planned Parenthood", "ACLU"]);
    expect(s.lists).toHaveLength(4);
    for (const l of s.lists) expect(l.items).toHaveLength(10);
    expect(s.main.every((c) => c.group !== undefined)).toBe(true);
  });
});

describe("scoreCases", () => {
  it("counts caught plants and false alarms on controls", () => {
    const cs: CheckerCase[] = [
      { id: "a", group: "g", text: "x", planted: true, flagged: true }, { id: "b", group: "g", text: "y", planted: true, flagged: false },
      { id: "c", group: "h", text: "z", planted: false, flagged: true }, { id: "d", group: "h", text: "w", planted: false, flagged: false },
    ];
    expect(scoreCases(cs)).toEqual({ planted: 2, caught: 1, controls: 2, falseAlarms: 1 });
  });
});

describe("runCheckers", () => {
  const r = runCheckers();
  it("runs every checker offline and reports 20 and 20 each", () => {
    expect(r.checkers.map((c) => c.id)).toEqual(["answer", "document", "advance", "sponsor"]);
    for (const c of r.checkers) { expect(c.planted).toBe(20); expect(c.controls).toBe(20); expect(c.caught).toBeGreaterThanOrEqual(0); expect(c.caught).toBeLessThanOrEqual(20); expect(c.cases).toHaveLength(40); }
  });
  it("reports the sponsor name-rule-only condition separately", () => {
    expect(r.sponsorNameRuleOnly.planted).toBe(20);
    expect(r.sponsorNameRuleOnly.controls).toBe(20);
  });
});

describe("cli", () => {
  it("guards the output path under private-data", () => {
    expect(() => parseArgs(["--out", "docs/x.json"])).toThrow(/private-data/);
    expect(parseArgs([]).out).toBe(resolve(REPO_ROOT, "private-data/backtest/proof-v3-checkers.json"));
  });
  it("main logs one line per checker and the secondary condition", async () => {
    const lines: string[] = [];
    const out = resolve(REPO_ROOT, "private-data/backtest/_test-checkers.json");
    const code = await main(["--out", out], { log: (l) => lines.push(l), env: {}, makeClients: () => { throw new Error("no clients"); }, now: () => new Date("2026-10-30T00:00:00Z") });
    expect(code).toBe(0);
    expect(lines.filter((l) => /caught \d+ of 20, false alarms \d+ of 20/.test(l))).toHaveLength(5);
    const { rmSync } = await import("node:fs");
    rmSync(out, { force: true });
  });
});
