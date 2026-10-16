import { describe, expect, it } from "vitest";
import { SAMPLE_CITIES } from "./lumenVale";
import { samplePlaybookEvents } from "./lumenValePlaybooks";
import { SAMPLE_QUESTIONS, SAMPLE_WITHOUT_QLOO, sampleStrategistEvents } from "./strategistSample";

const numbersIn = (s: string) => (s.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
const known = new Set<number>([
  ...SAMPLE_CITIES.flatMap((c) => [c.fanHeat.value, c.activation.value, c.winnability.value]).filter((v): v is number => v !== null),
  ...JSON.stringify(samplePlaybookEvents("4005539")).match(/\d+(?:\.\d+)?/g)!.map(Number),
  ...JSON.stringify(samplePlaybookEvents("3448439")).match(/\d+(?:\.\d+)?/g)!.map(Number),
]);

describe("strategist samples", () => {
  it("has exactly three suggested questions, each ending in a message then done", () => {
    expect(SAMPLE_QUESTIONS).toHaveLength(3);
    for (const q of SAMPLE_QUESTIONS) {
      const ev = sampleStrategistEvents(q);
      expect(ev.at(-2)?.type).toBe("strategist_message");
      expect(ev.at(-1)?.type).toBe("done");
    }
  });
  it("every number in a sample answer comes from the sample data", () => {
    for (const q of SAMPLE_QUESTIONS) {
      const msg = sampleStrategistEvents(q).find((e) => e.type === "strategist_message") as { text: string };
      for (const n of numbersIn(msg.text)) expect(known.has(n)).toBe(true);
    }
  });
  it("sample answer 1 cites the in-city fan heat share from the sample data", () => {
    const msg = sampleStrategistEvents(SAMPLE_QUESTIONS[0]!).find((e) => e.type === "strategist_message") as { text: string };
    expect(msg.text).toContain("38% of in-city fan heat sits in Colonia Americana");
  });
  it("a free-typed question in sample mode is an honest unavailable state", () => {
    expect(sampleStrategistEvents("anything else")[0]).toMatchObject({ type: "strategist_error", code: "UNAVAILABLE" });
  });
  it("the sample generic ranking is a permutation of the sample cities", () => {
    if (SAMPLE_WITHOUT_QLOO.status !== "ok") throw new Error();
    expect(SAMPLE_WITHOUT_QLOO.ranked.map((c) => c.name).sort()).toEqual(SAMPLE_CITIES.map((c) => c.name).sort());
  });
});
