import { describe, expect, it } from "vitest";
import { decodeGeohash } from "../src/geo/geohash.js";
import { haversineKm, loadCities, nearestCity, type City } from "../src/geo/cities.js";
import { marketsFromHeat, zonesFromHeat } from "../src/geo/heat.js";

const CITIES: City[] = [
  { id: "1", name: "Mexico City", country: "MX", lat: 19.4326, lon: -99.1332, population: 9_000_000 },
  { id: "2", name: "Monterrey", country: "MX", lat: 25.6866, lon: -100.3161, population: 1_100_000 },
  { id: "3", name: "Coyoacan", country: "MX", lat: 19.35, lon: -99.162, population: 600_000 },
  { id: "4", name: "Tiny Town", country: "MX", lat: 25.7, lon: -100.3, population: 6_000 },
];

describe("geohash", () => {
  it("decodes a known hash", () => {
    const p = decodeGeohash("9g3w81t7j");
    expect(p.lat).toBeCloseTo(19.4326, 2);
    expect(p.lon).toBeCloseTo(-99.1332, 2);
  });
});

describe("nearestCity", () => {
  it("picks the nearest city above the population floor within range", () => {
    expect(nearestCity(CITIES, { lat: 25.69, lon: -100.31 }, { maxKm: 50, minPopulation: 100_000 })?.name).toBe("Monterrey");
    expect(nearestCity(CITIES, { lat: 0, lon: 0 }, { maxKm: 50, minPopulation: 100_000 })).toBeNull();
  });
  it("haversine is sane", () => {
    expect(haversineKm(CITIES[0]!, CITIES[1]!)).toBeGreaterThan(700);
  });
});

describe("marketsFromHeat", () => {
  it("groups points by nearest major city taking max affinity/popularity", () => {
    const markets = marketsFromHeat([
      { lat: 19.43, lon: -99.13, affinity: 0.9, popularity: 0.5, index: 0 },
      { lat: 19.36, lon: -99.16, affinity: 0.7, popularity: 0.8, index: 1 },
      { lat: 25.68, lon: -100.31, affinity: 0.6, popularity: 0.4, index: 2 },
    ], CITIES, { minPopulation: 1_000_000 });
    expect(markets.map((m) => m.city.name)).toEqual(["Mexico City", "Monterrey"]);
    expect(markets[0]).toMatchObject({ affinity: 0.9, popularity: 0.8, pointIndexes: [0, 1] });
  });
  it("drops points with no city in range (no fabricated markets)", () => {
    expect(marketsFromHeat([{ lat: 0, lon: 0, affinity: 1, popularity: 1, index: 0 }], CITIES)).toEqual([]);
  });
});

describe("zonesFromHeat", () => {
  it("labels zones by nearest locality and computes share", () => {
    const zones = zonesFromHeat([
      { lat: 19.35, lon: -99.16, affinity: 0.6, popularity: 0.1, index: 0 },
      { lat: 19.43, lon: -99.13, affinity: 0.2, popularity: 0.1, index: 1 },
    ], CITIES);
    expect(zones[0]).toMatchObject({ label: "Coyoacan" });
    expect(zones[0]?.share).toBeCloseTo(0.75, 10);
    expect(zones[1]?.label).toBe("Mexico City");
  });
  it("falls back to coordinates when no locality within 8 km", () => {
    expect(zonesFromHeat([{ lat: 10, lon: 10, affinity: 1, popularity: 0, index: 0 }], CITIES)[0]?.label).toBe("10.000, 10.000");
  });
});

describe("loadCities", () => {
  it("loads the GeoNames dataset", () => {
    expect(loadCities().length).toBeGreaterThan(50000);
  });
});
