import { describe, expect, it } from "vitest";
import type { ScoredCity, Verdict } from "./types";
import { compareWithQloo, disagreementLine, FLAG_TEXT } from "./withoutCompare";

const score = (w: number | null) => (w === null ? { value: null, reason: "insufficient_data", refs: [] } : { value: w, confidence: 1 }) as unknown as ScoredCity["winnability"];
const city = (id: string, name: string, country: string, verdict: Verdict, w: number | null, extra: Partial<ScoredCity> = {}): ScoredCity => ({
  id, name, country, lat: 0, lon: 0, verdict,
  fanHeat: score(w), activation: score(w) as ScoredCity["activation"], winnability: score(w),
  zones: [], warnings: [], ...extra,
});
const L = (name: string, country: string) => ({ name, country });

describe("compareWithQloo", () => {
  const board = [
    city("a", "Alpha", "BR", "play", 90),
    city("b", "Bravo", "BR", "play", 80),
    city("c", "Charlie", "MX", "consider", 70),
    city("d", "Delta", "MX", "consider", 60),
    city("e", "Echo", "US", "skip", 20),
  ];

  it("keeps the LLM order and numbers it from 1", () => {
    const rows = compareWithQloo([L("Charlie", "MX"), L("Alpha", "BR")], board);
    expect(rows.map((r) => [r.llmRank, r.name])).toEqual([[1, "Charlie"], [2, "Alpha"]]);
    expect(rows[0]!.qlooRank).toBe(3);
    expect(rows[1]!.qlooRank).toBe(1);
  });
  it("agrees when the ranks are within 2", () => {
    const rows = compareWithQloo([L("Alpha", "BR"), L("Charlie", "MX"), L("Bravo", "BR")], board);
    expect(rows.map((r) => r.flag)).toEqual(["agrees", "agrees", "agrees"]);
  });
  it("flags a move of 3 or more", () => {
    const rows = compareWithQloo([L("Delta", "MX"), L("Bravo", "BR"), L("Charlie", "MX"), L("Alpha", "BR")], board);
    expect(rows[0]).toMatchObject({ flag: "moved", qlooRank: 4 }); // 1 -> 4 is a 3-place gap
    expect(rows[3]).toMatchObject({ flag: "moved", qlooRank: 1 });
    expect(rows[1]).toMatchObject({ flag: "agrees", qlooRank: 2 });
  });
  it("moved fires at exactly 3 places and says up or down", () => {
    const rows = compareWithQloo([L("Echo", "US"), L("Delta", "MX"), L("Charlie", "MX"), L("Bravo", "BR"), L("Alpha", "BR")], [
      city("a", "Alpha", "BR", "play", 90), city("b", "Bravo", "BR", "play", 80), city("c", "Charlie", "MX", "consider", 70),
      city("d", "Delta", "MX", "consider", 60), city("e", "Echo", "US", "consider", 50),
    ]);
    expect(rows[0]).toMatchObject({ flag: "moved", qlooRank: 5, direction: "down" });
    expect(rows[4]).toMatchObject({ flag: "moved", qlooRank: 1, direction: "up" });
    expect(rows[1]!.flag).toBe("agrees");
  });
  it("not_on_board when no city matches", () => {
    const [r] = compareWithQloo([L("Nowhere", "BR")], board);
    expect(r!.flag).toBe("not_on_board");
    expect(r!.city).toBeUndefined();
    expect(r!.qlooRank).toBeUndefined();
  });
  it("same name in another country is not a match", () => {
    expect(compareWithQloo([L("Alpha", "US")], board)[0]!.flag).toBe("not_on_board");
  });
  it("unplaced for location_unresolved or insufficient_data, with no rank", () => {
    const b = [city("u", "Uno", "BR", "insufficient_data", null, { insufficientReason: "location_unresolved" }), city("v", "Vee", "BR", "insufficient_data", null), city("a", "Alpha", "BR", "play", 90)];
    const rows = compareWithQloo([L("Uno", "BR"), L("Vee", "BR")], b);
    expect(rows.map((r) => r.flag)).toEqual(["unplaced", "unplaced"]);
    expect(rows[0]!.qlooRank).toBeUndefined();
  });
  it("skip beats moved, capped beats moved, and skip beats capped", () => {
    const b = [
      city("a", "Alpha", "BR", "play", 90), city("b", "Bravo", "BR", "play", 80), city("c", "Charlie", "MX", "consider", 70), city("d", "Delta", "MX", "consider", 60),
      city("s", "Skipper", "US", "skip", 10, { fanHeatFloor: true }), city("k", "Capped", "US", "consider", 5, { fanHeatFloor: true }),
    ];
    const rows = compareWithQloo([L("Skipper", "US"), L("Capped", "US")], b);
    expect(rows.map((r) => r.flag)).toEqual(["skip", "capped"]);
  });
  it("a floored city that kept a Play verdict is not capped", () => {
    const b = [city("a", "Alpha", "BR", "play", 90, { fanHeatFloor: true })];
    expect(compareWithQloo([L("Alpha", "BR")], b)[0]!.flag).toBe("agrees");
  });
  it("folds accents, case and a trailing ' city'", () => {
    const b = [city("sp", "São Paulo", "BR", "play", 90), city("ny", "New York City", "US", "consider", 50)];
    const rows = compareWithQloo([L("Sao Paulo", "br"), L("NEW YORK", "US"), L("New York City", "US")], b);
    expect(rows.map((r) => r.city?.id)).toEqual(["sp", "ny", "ny"]);
  });
  it("does not invent aliases beyond folding", () => {
    expect(compareWithQloo([L("NYC", "US")], [city("ny", "New York City", "US", "consider", 50)])[0]!.flag).toBe("not_on_board");
  });
  it("ranks only among cities with a winnability value, ties share a rank", () => {
    const b = [city("n", "Nul", "BR", "insufficient_data", null), city("a", "Alpha", "BR", "play", 50), city("b", "Bravo", "BR", "play", 50), city("c", "Charlie", "BR", "play", 40)];
    const rows = compareWithQloo([L("Alpha", "BR"), L("Bravo", "BR"), L("Charlie", "BR")], b);
    expect(rows.map((r) => r.qlooRank)).toEqual([1, 1, 3]);
  });
  it("returns [] for no LLM cities", () => {
    expect(compareWithQloo([], board)).toEqual([]);
  });
  it("has flag text for every non-agreeing flag", () => {
    expect(FLAG_TEXT.not_on_board).toBe("Not on Qloo's board");
    expect(FLAG_TEXT.unplaced).toBe("Qloo couldn't score it");
    expect(FLAG_TEXT.skip).toBe("Qloo says Skip");
    expect(FLAG_TEXT.capped).toBe("Capped: no Qloo fan-heat evidence");
  });
});

describe("disagreementLine", () => {
  const row = (flag: string) => ({ flag }) as never;
  it("agrees when nothing differs", () => {
    expect(disagreementLine([row("agrees"), row("agrees")])).toBe("Qloo agrees with this order — the difference is in each city's playbook.");
  });
  it("counts parts in a fixed order and omits zeros", () => {
    const rows = ["capped", "skip", "unplaced", "moved", "agrees", "agrees", "agrees", "agrees", "agrees", "agrees"].map(row);
    expect(disagreementLine(rows)).toBe("Qloo disagrees on 4 of 10: 1 capped, 1 Skip, 1 couldn't be scored, 1 moved.");
  });
  it("includes not-on-board and pluralises nothing awkwardly", () => {
    const rows = ["moved", "moved", "not_on_board", "agrees"].map(row);
    expect(disagreementLine(rows)).toBe("Qloo disagrees on 3 of 4: 1 not on Qloo's board, 2 moved.");
  });
});
