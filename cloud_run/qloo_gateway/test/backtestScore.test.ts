import { describe, expect, it } from "vitest";
import { buildResults, CUTOFF, decisionFor, findRank, lostCases, methodResult, summarise, targetType, WIDE_CUTOFF, type CaseResult } from "../src/backtest/score.js";

const items = Array.from({ length: 20 }, (_, i) => ({ name: `Brand ${i + 1}`, entityId: `ID-${i + 1}` }));

describe("findRank", () => {
  it("matches by entity id when both sides have one", () => {
    expect(findRank(items, { name: "Not The Name", entityId: "ID-7" })).toBe(7);
  });
  it("does not match a same-name item with a different id", () => {
    expect(findRank([{ name: "Vans", entityId: "OTHER" }], { name: "Vans", entityId: "ID-VANS" })).toBeNull();
  });
  it("falls back to normalised name when the target is unresolved", () => {
    expect(findRank([{ name: "Café Tacvba" }], { name: "cafe tacvba", entityId: null })).toBe(1);
  });
  it("matches an alias", () => {
    expect(findRank([{ name: "Vans Off The Wall" }], { name: "Vans", aliases: ["Vans Off The Wall"], entityId: null })).toBe(1);
  });
  it("matches by name when the item has no id (LLM list)", () => {
    expect(findRank([{ name: "Brand 3" }], { name: "Brand 3", entityId: "ID-3" })).toBe(1);
  });
  it("only looks at the first 20", () => {
    const long = [...items, { name: "Late", entityId: "ID-LATE" }];
    expect(findRank(long, { name: "Late", entityId: "ID-LATE" })).toBeNull();
  });
});

describe("mappings", () => {
  it("maps activation types to Qloo targets and promoter decisions", () => {
    expect(targetType("sponsor")).toBe("brand");
    expect(targetType("merch_collab")).toBe("brand");
    expect(targetType("local_artist")).toBe("artist");
    expect(decisionFor("sponsor")).toBe("Which sponsor to pitch");
    expect(decisionFor("merch_collab")).toBe("The merch angle");
    expect(decisionFor("local_artist")).toBe("Who goes on the bill");
  });
  it("keeps only the top 10 for display", () => {
    const r = methodResult(items, { name: "x", entityId: "ID-15" });
    expect(r).toEqual({ status: "ok", rank: 15, top: items.slice(0, CUTOFF) });
    expect(WIDE_CUTOFF).toBe(20);
  });
});

const base = (id: string, ranks: [number | null | "x", number | null | "x", number | null | "x"]): CaseResult => {
  const m = (r: number | null | "x") => (r === "x" ? { status: "unavailable" as const, reason: "error" } : { status: "ok" as const, rank: r, top: [] });
  return {
    id, artist: "A", city: "C", country: "K", activationType: "sponsor", decision: "Which sponsor to pitch",
    realEntity: { name: "E", entityId: null, resolved: false }, date: "2024-01", sources: ["https://e.com"], summary: "s",
    results: { qloo_playbook: m(ranks[0]), city_popularity: m(ranks[1]), llm_only: m(ranks[2]) },
  };
};

describe("summarise and lostCases", () => {
  const cases = [base("a", [3, 15, null]), base("b", [null, 2, "x"]), base("c", [12, null, 11]), base("d", ["x", 1, 1])];
  it("counts hits within each cut and excludes unavailable answers from the denominator", () => {
    expect(summarise(cases)).toEqual({
      qloo_playbook: { scored: 3, hit10: 1, hit20: 2 },
      city_popularity: { scored: 4, hit10: 2, hit20: 3 },
      llm_only: { scored: 3, hit10: 1, hit20: 2 },
    });
  });
  it("lists cases where a baseline ranked the entity better than the playbook", () => {
    expect(lostCases(cases)).toEqual(["b", "c"]);
  });
  it("builds a results document", () => {
    const r = buildResults(cases, { runAt: "2026-10-20T00:00:00.000Z", model: "gemini-x" });
    expect(r).toMatchObject({ schemaVersion: 1, status: "complete", cutoff: 10, wideCutoff: 20, n: 4, methods: ["qloo_playbook", "city_popularity", "llm_only"], lost: ["b", "c"] });
  });
});
