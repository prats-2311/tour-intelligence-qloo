import { describe, expect, it } from "vitest";
import { computeMoves, reasonFor, unplacedCities, MAJOR_MARKET_SUFFIX, NO_CLEAR_DRIVER_LINE, NO_DETAIL_LINE } from "./moves";
import type { ComponentName, ScoredCity } from "./types";

const city = (id: string, fan: number | null, win: number | null, components?: Partial<Record<ComponentName, number>>, extra: Partial<ScoredCity> = {}): ScoredCity => ({
  id, name: id, country: "X", lat: 0, lon: 0,
  fanHeat: fan === null ? { value: null, reason: "insufficient_data", refs: [] } : { value: fan, refs: [] },
  activation: { value: 50, refs: [], components },
  winnability: win === null ? { value: null, reason: "insufficient_data", refs: [] } : { value: win, refs: [] },
  verdict: "consider", zones: [], warnings: [], ...extra,
});

describe("computeMoves", () => {
  const board = [city("A", 90, 40), city("B", 80, 80), city("C", 70, 90), city("D", 60, 60), city("E", null, null)];
  it("ranks only cities with both scores and orders by largest absolute move", () => {
    const moves = computeMoves(board);
    expect(moves.map((m) => m.city.id)).toEqual(["A", "C", "D", "B"]);
    const c = moves.find((m) => m.city.id === "C")!;
    expect([c.fanRank, c.winRank, c.delta]).toEqual([3, 1, 2]);
    expect(moves[0]!.delta).toBe(-3);
  });
  it("breaks ties by winnability (higher first), then name", () => {
    // fan ranks: p1 q2 r3 s4; win ranks: s1 r2 q3 p4 -> p -3, s +3 (tie on 3), q -1, r +1 (tie on 1)
    const moves = computeMoves([city("p", 90, 10), city("q", 80, 30), city("r", 70, 60), city("s", 60, 95)]);
    expect(moves.map((m) => m.city.id)).toEqual(["s", "p", "r", "q"]);
    // equal winnability and equal delta: name order
    const eq = computeMoves([city("b", 50, 50), city("a", 50, 50)]);
    expect(eq.map((m) => m.city.id)).toEqual(["a", "b"]);
  });
  it("returns all-zero deltas when the ranks agree", () => {
    const moves = computeMoves([city("A", 90, 90), city("B", 80, 80), city("C", 70, 70)]);
    expect(moves.every((m) => m.delta === 0)).toBe(true);
  });
  it("excludes unplaced cities and lists them separately", () => {
    const un = city("Ghost", null, null, undefined, { insufficientReason: "location_unresolved" });
    expect(computeMoves([city("A", 1, 1), un]).map((m) => m.city.id)).toEqual(["A"]);
    expect(unplacedCities([city("A", 1, 1), un]).map((c) => c.id)).toEqual(["Ghost"]);
  });
});

describe("reasonFor", () => {
  const mk = (id: string, fan: number, win: number, c: Partial<Record<ComponentName, number>>) => city(id, fan, win, c);
  const cities = [
    mk("up", 10, 90, { sponsor_fit: 0.9, venue_fit: 0.9, local_hooks: 0.5 }),
    mk("m1", 50, 50, { sponsor_fit: 0.5, venue_fit: 0.5, local_hooks: 0.5 }),
    mk("down", 90, 10, { sponsor_fit: 0.1, venue_fit: 0.5, local_hooks: 0.5 }),
  ];
  const move = (id: string) => computeMoves(cities).find((m) => m.city.id === id)!;
  it("uses the climb template with integers 0-100 and the board median", () => {
    expect(reasonFor(move("up"), cities)).toBe("Climbs on sponsor fit: 90 vs board median 50");
  });
  it("uses the drop template", () => {
    expect(reasonFor(move("down"), cities)).toBe("Drops on sponsor fit: 10 vs board median 50");
  });
  it("weights the gap by the scoring weight", () => {
    const weights = { sponsor_fit: 0.1, venue_fit: 1, local_hooks: 1, fan_concentration: 1 };
    expect(reasonFor(move("up"), cities, { weights })).toBe("Climbs on venue fit: 90 vs board median 50");
  });
  it("names fan concentration and local hooks in promoter words", () => {
    const cs = [mk("a", 10, 90, { fan_concentration: 0.8 }), mk("b", 50, 50, { fan_concentration: 0.4 }), mk("c", 90, 10, { local_hooks: 0.2 })];
    expect(reasonFor(computeMoves(cs).find((m) => m.city.id === "a")!, cs)).toBe("Climbs on fans packed into a few neighbourhoods: 80 vs board median 60");
    expect(reasonFor(computeMoves(cs).find((m) => m.city.id === "c")!, cs)).toBe(NO_CLEAR_DRIVER_LINE);
  });
  it("prefers a smaller gap on the move's side over a larger gap on the wrong side", () => {
    const cs = [mk("up", 10, 90, { sponsor_fit: 0.2, venue_fit: 0.6 }), mk("m", 50, 50, { sponsor_fit: 0.5, venue_fit: 0.5 }), mk("dn", 90, 10, { sponsor_fit: 0.8, venue_fit: 0.4 })];
    // sponsor_fit is 30 below the median (wrong side for a climb); venue_fit is 10 above it
    expect(reasonFor(computeMoves(cs).find((m) => m.city.id === "up")!, cs)).toBe("Climbs on venue fit: 60 vs board median 50");
  });
  it("falls back to the largest gap when nothing sits on the move's side", () => {
    const cs = [mk("up", 10, 90, { sponsor_fit: 0.2, venue_fit: 0.4 }), mk("m", 50, 50, { sponsor_fit: 0.5, venue_fit: 0.5 }), mk("dn", 90, 10, { sponsor_fit: 0.8, venue_fit: 0.6 })];
    expect(reasonFor(computeMoves(cs).find((m) => m.city.id === "up")!, cs)).toBe("Climbs on sponsor fit: 20 vs board median 50");
  });
  it("says there is no clear driver when the gap is zero", () => {
    const cs = [mk("up", 10, 90, { sponsor_fit: 0.5 }), mk("m", 50, 50, { sponsor_fit: 0.5 }), mk("dn", 90, 10, { sponsor_fit: 0.5 })];
    expect(reasonFor(computeMoves(cs).find((m) => m.city.id === "up")!, cs)).toBe("No clear driver: components sit near the board median.");
  });
  it("says so when no components were recorded", () => {
    const cs = [city("a", 10, 90), city("b", 90, 10)];
    expect(reasonFor(computeMoves(cs)[0]!, cs)).toBe(NO_DETAIL_LINE);
  });
  it("appends the major-market suffix for a floored seed", () => {
    const seed = city("s", 10, 90, { sponsor_fit: 0.9 }, { fanHeatFloor: true });
    const cs = [seed, mk("b", 50, 50, { sponsor_fit: 0.5 }), mk("c", 90, 10, { sponsor_fit: 0.2 })];
    expect(reasonFor(computeMoves(cs).find((m) => m.city.id === "s")!, cs)).toBe(`Climbs on sponsor fit: 90 vs board median 50${MAJOR_MARKET_SUFFIX}`);
    expect(MAJOR_MARKET_SUFFIX).toBe(" · major market, fan heat at the board's floor");
  });
});
