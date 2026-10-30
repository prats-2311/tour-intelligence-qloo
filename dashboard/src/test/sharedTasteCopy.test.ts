import { describe, expect, it } from "vitest";
import { coBillLine } from "@/components/playbook/format";

// Shared taste is a 0..1 similarity score (mean of the top-5 shared-tag query.score), and "the city likes them" is Qloo's 0..1 affinity score.
// Neither is a share of fans, so no copy may print them as a percent (audit A, shared-taste copy rule).
const raw = import.meta.glob(["../**/*.ts", "../**/*.tsx", "../../server/**/*.js", "../../public/**/*.txt"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const sources = Object.entries(raw).filter(([p]) => !/\.test\.|\/fixtures\/|\.synthetic\./.test(p) && !p.includes("sharedTasteCopy"));

describe("shared taste is shown as a 0..1 score, never a percent", () => {
  it("scans the real sources", () => { expect(sources.length).toBeGreaterThan(100); });
  it("no source builds 'share taste NN%' or turns sharedTaste / localAffinity into a percent", () => {
    const hits: string[] = [];
    for (const [path, text] of sources) {
      text.split("\n").forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        if (/share[sd]? taste[^"`']{0,60}(\d+\s?%|\}\s?%)/i.test(line) || /(sharedTaste|localAffinity)[^"`']{0,40}\*\s*100/.test(line) || /(sharedTaste|localAffinity)[^"`']{0,60}\}\s?%/.test(line) || /city likes them[^"`']{0,40}\}\s?%/i.test(line)) hits.push(`${path}:${i + 1} ${line.trim().slice(0, 140)}`);
      });
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });
  it("the co-billing line shows both numbers as scores", () => {
    expect(coBillLine(0.99, 0.98)).toBe("Shared taste 0.99 · the city likes them 0.98");
    expect(coBillLine(0.344, 0.876)).not.toContain("%");
  });
  it("the pattern the rule forbids is caught", () => {
    expect(/share[sd]? taste[^"`']{0,60}(\d+\s?%|\}\s?%)/i.test("Fans share taste 34% · the city")).toBe(true);
  });
});
