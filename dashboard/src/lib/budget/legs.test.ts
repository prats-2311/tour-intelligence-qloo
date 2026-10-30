import { describe, expect, it } from "vitest";
import { DRIVE_KM_PER_DAY, DRIVE_MAX_KM, buildLegs, legTotals, travelDays } from "./legs";

const la = { id: "la", name: "Los Angeles", lat: 34.0522, lon: -118.2437 };
const pdx = { id: "pdx", name: "Portland", lat: 45.5152, lon: -122.6784 };
const sea = { id: "sea", name: "Seattle", lat: 47.6062, lon: -122.3321 };
const nyc = { id: "nyc", name: "New York", lat: 40.7128, lon: -74.006 };

describe("routing legs", () => {
  it("documents the app assumptions", () => {
    expect(DRIVE_MAX_KM).toBe(600);
    expect(DRIVE_KM_PER_DAY).toBe(700);
  });
  it("uses the app's own haversine: LA to Portland is about 1,330 km", () => {
    const [leg] = buildLegs([la, pdx]);
    expect(leg!.km).toBeGreaterThan(1300);
    expect(leg!.km).toBeLessThan(1340);
  });
  it("suggests driving up to 600 km and flying beyond", () => {
    const legs = buildLegs([pdx, sea, la, nyc]);
    expect(legs[0]).toMatchObject({ from: "pdx", to: "sea", mode: "drive", days: 1 });
    expect(legs[1]!.mode).toBe("fly"); // Seattle to LA is ~1,540 km
    expect(legs[1]!.days).toBe(1);
    expect(legs[2]).toMatchObject({ mode: "fly", days: 1 });
  });
  it("travel days: drive is ceil(km/700), fly is 1", () => {
    expect(travelDays(0, "drive")).toBe(0);
    expect(travelDays(1, "drive")).toBe(1);
    expect(travelDays(700, "drive")).toBe(1);
    expect(travelDays(701, "drive")).toBe(2);
    expect(travelDays(5000, "fly")).toBe(1);
  });
  it("a leg whose city has no coordinates has no distance, mode or days (never a made-up zero)", () => {
    const [leg] = buildLegs([la, { id: "x", name: "X", lat: Number.NaN, lon: Number.NaN }]);
    expect(leg).toMatchObject({ km: null, mode: null, days: null });
  });
  it("totals km, legs and travel days; unknown legs are counted separately", () => {
    const t = legTotals(buildLegs([pdx, sea, la]));
    expect(t.legs).toBe(2);
    expect(t.km).toBeGreaterThan(1700);
    expect(t.days).toBe(2);
    expect(t.unknown).toBe(0);
    expect(legTotals(buildLegs([la, { id: "x", name: "X", lat: NaN, lon: NaN }]))).toMatchObject({ legs: 1, km: 0, days: 0, unknown: 1 });
  });
  it("one city has no legs", () => {
    expect(buildLegs([la])).toEqual([]);
  });
});
