import { describe, expect, it } from "vitest";
import type { SegmentBand, SponsorSegments } from "./segments";
import type { SegmentState } from "./segmentStore";
import { buildAgeMatrix, indexRangeText, matrixSummary, type CityInput } from "./ageMatrix";

const band = (b: SegmentBand["band"], index: number, names: string[], over: Partial<SegmentBand> = {}): SegmentBand => ({
  band: b, phrase: "", index, status: "ok", hiddenCount: 0, newInTop5: 2, lifted: false,
  items: names.map((name, i) => ({ name, entityId: `${b}-${i}`, artistRank: i + 1, cityRank: null })), ...over,
});
const ok = (...bands: SegmentBand[]): SegmentState => ({ status: "done", data: { status: "ok", indexes: {}, bands } satisfies SponsorSegments });
const allFans = (...names: string[]) => names.map((name, i) => ({ name, fanRank: i + 1, cityRank: null as number | null }));
const city = (id: string, segments: CityInput["segments"], fans: CityInput["allFans"] = allFans("Stüssy", "HUF", "OBEY", "Vans", "Palace")): CityInput => ({ id, name: id.toUpperCase(), segments, allFans: fans });

describe("indexRangeText", () => {
  it("is a signed range vs the average audience, never a percent", () => {
    expect(indexRangeText(0.78, 0.91)).toBe("(+0.78 to +0.91 vs average audience)");
    expect(indexRangeText(0.91, 0.91)).toBe("(+0.91 vs average audience)");
    expect(indexRangeText(-0.2, 0.4)).not.toContain("%");
  });
});

describe("buildAgeMatrix", () => {
  const la = city("la", ok(band("25_to_29", 0.91, ["Off-white", "OBEY"], { lifted: true, items: [{ name: "Off-white", entityId: "1", artistRank: 1, cityRank: null }, { name: "OBEY", entityId: "2", artistRank: 2, cityRank: 5 }] }), band("55_and_older", 0.78, ["Stüssy", "Vans"])));
  const mx = city("mx", ok(band("25_to_29", 0.8, ["Cerro Alto"]), band("35_to_44", 0.85, ["Brisa"])));
  it("unions the age bands present in any city, youngest to oldest", () => {
    expect(buildAgeMatrix([la, mx]).columns).toEqual(["25_to_29", "35_to_44", "55_and_older"]);
  });
  it("keeps row order as given and reports each band's index range across cities", () => {
    const m = buildAgeMatrix([la, mx]);
    expect(m.rows.map((r) => r.cityId)).toEqual(["la", "mx"]);
    expect(m.ranges["25_to_29"]).toEqual({ min: 0.8, max: 0.91 });
    expect(m.ranges["55_and_older"]).toEqual({ min: 0.78, max: 0.78 });
  });
  it("cell = top brand with fan rank, the not-in-city-top-20 flag only when lifted, and a unique badge when outside the all-fans top 5", () => {
    const m = buildAgeMatrix([la, mx]);
    const c = m.rows[0]!.cells["25_to_29"]!;
    expect(c).toMatchObject({ brand: "Off-white", fanRank: 1, offCityTop20: true, unique: true });
    expect(m.rows[0]!.cells["55_and_older"]).toMatchObject({ brand: "Stüssy", unique: false, offCityTop20: false });
    expect(m.rows[0]!.cells["25_to_29"]!.top5.map((t) => t.name)).toEqual(["Off-white", "OBEY"]);
  });
  it("omits the unique badge (null) when the all-fans card is not available", () => {
    const m = buildAgeMatrix([city("x", ok(band("25_to_29", 0.9, ["A"])), null)]);
    expect(m.rows[0]!.cells["25_to_29"]!.unique).toBeNull();
    expect(m.rows[0]!.allFansTop).toBeNull();
  });
  it("all-fans column takes the card's first brand; matching ignores case and accents", () => {
    const m = buildAgeMatrix([city("x", ok(band("25_to_29", 0.9, ["STUSSY"])))]);
    expect(m.rows[0]!.allFansTop).toMatchObject({ brand: "Stüssy", fanRank: 1 });
    expect(m.rows[0]!.cells["25_to_29"]!.unique).toBe(false);
  });
  it("display filters: non-sponsors and the do-not-book act never appear; the next brand takes the top slot", () => {
    const m = buildAgeMatrix([city("x", ok(band("25_to_29", 0.9, ["Ariel Pink", "Red Cross", "Real Brand", "Other"])), allFans("Ariel Pink", "Real Brand"))]);
    const r = m.rows[0]!;
    expect(r.cells["25_to_29"]!.brand).toBe("Real Brand");
    expect(r.cells["25_to_29"]!.top5.map((t) => t.name)).toEqual(["Real Brand", "Other"]);
    expect(r.allFansTop!.brand).toBe("Real Brand");
    expect(JSON.stringify(m)).not.toContain("Ariel Pink");
    expect(JSON.stringify(m)).not.toContain("Red Cross");
  });
  it("row states: no_skew, unavailable, loading, idle; their cells are empty", () => {
    const m = buildAgeMatrix([
      city("a", { status: "done", data: { status: "no_skew", indexes: {}, bands: [] } }),
      city("b", { status: "done", data: { status: "unavailable", reason: "error", indexes: {}, bands: [] } }),
      city("c", { status: "loading" }), city("d", { status: "idle" }),
    ]);
    expect(m.rows.map((r) => r.state)).toEqual(["no_skew", "unavailable", "loading", "idle"]);
    expect(m.columns).toEqual([]);
  });
  it("a band whose own status is unavailable or empty gives no cell brand", () => {
    const m = buildAgeMatrix([city("x", ok(band("25_to_29", 0.9, [], { status: "empty" })))]);
    expect(m.rows[0]!.cells["25_to_29"]).toMatchObject({ brand: null });
  });
});

describe("matrixSummary", () => {
  it("counts cities where the oldest and youngest group's top brand differs from all fans', over cities with data to compare", () => {
    const m = buildAgeMatrix([
      city("a", ok(band("25_to_29", 0.9, ["Stüssy"]), band("55_and_older", 0.8, ["Other"]))),
      city("b", ok(band("25_to_29", 0.9, ["New"]), band("55_and_older", 0.8, ["Stüssy"]))),
      city("c", ok(band("25_to_29", 0.9, ["Stüssy"]), band("55_and_older", 0.8, ["Stüssy"]))),
      city("d", { status: "idle" }),
    ]);
    expect(matrixSummary(m)).toBe("In 1 of 3 cities, the oldest over-indexed group's top brand differs from all fans'. In 1 of 3 cities, the youngest over-indexed group's top brand differs from all fans'.");
  });
  it("one band per city: a single sentence about the over-indexed group", () => {
    const m = buildAgeMatrix([city("a", ok(band("25_to_29", 0.9, ["New"]))), city("b", ok(band("35_to_44", 0.9, ["Stüssy"])))]);
    expect(matrixSummary(m)).toBe("In 1 of 2 cities, the over-indexed group's top brand differs from all fans'.");
  });
  it("makes no claim when nothing can be compared", () => {
    expect(matrixSummary(buildAgeMatrix([city("a", { status: "idle" }), city("b", ok(band("25_to_29", 0.9, ["A"])), null)]))).toBeNull();
  });
});
