import { describe, expect, it } from "vitest";
import { decodeGeohash } from "../src/geo/geohash.js";
import { haversineKm, loadCities, metroAnchor, nearestCity, type City } from "../src/geo/cities.js";
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

describe("nearestCity bounds", () => {
  const mk = (name: string, lat: number, lon: number): City => ({ id: name, name, country: "XX", lat, lon, population: 500_000 });
  it("wraps across the antimeridian", () => {
    const cities = [mk("West", 0, -179.95)];
    expect(nearestCity(cities, { lat: 0, lon: 179.95 }, { maxKm: 50, minPopulation: 0 })?.name).toBe("West");
  });
  it("finds cities at high latitude where longitude degrees shrink", () => {
    const cities = [mk("Arctic", 78, 11.8)];
    expect(nearestCity(cities, { lat: 78, lon: 10 }, { maxKm: 50, minPopulation: 0 })?.name).toBe("Arctic");
  });
  it("does not cap maxKm at ~111 km", () => {
    const cities = [mk("Far", 21.35, 0)];
    expect(nearestCity(cities, { lat: 20, lon: 0 }, { maxKm: 200, minPopulation: 0 })?.name).toBe("Far");
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

describe("metroAnchor", () => {
  const mk = (name: string, lat: number, lon: number, population: number): City => ({ id: name, name, country: "XX", lat, lon, population });
  const opts = { maxKm: 50, minPopulation: 100_000 };
  it("prefers the most populous city in range over the nearer suburb", () => {
    const cities = [mk("Suburb", 45.5, -122.43, 110_000), mk("Metro", 45.52, -122.68, 650_000)];
    expect(metroAnchor(cities, { lat: 45.5, lon: -122.43 }, opts)?.name).toBe("Metro");
  });
  it("breaks equal populations by distance", () => {
    const cities = [mk("Far", 45.8, -122.43, 500_000), mk("Near", 45.55, -122.43, 500_000)];
    expect(metroAnchor(cities, { lat: 45.5, lon: -122.43 }, opts)?.name).toBe("Near");
  });
  it("returns null when no city of the minimum size is in range", () => {
    const cities = [mk("Small", 45.5, -122.43, 50_000), mk("Distant", 48, -122.43, 900_000)];
    expect(metroAnchor(cities, { lat: 45.5, lon: -122.43 }, opts)).toBeNull();
  });
});

describe("marketsFromHeat metro anchoring", () => {
  const cities: City[] = [
    { id: "m", name: "Metro", country: "XX", lat: 45.52, lon: -122.68, population: 650_000 },
    { id: "s", name: "Suburb", country: "XX", lat: 45.5, lon: -122.43, population: 110_000 },
  ];
  it("merges points from one metro into a single market", () => {
    const markets = marketsFromHeat([
      { lat: 45.5, lon: -122.43, affinity: 0.9, popularity: 0.2, index: 0 },
      { lat: 45.52, lon: -122.68, affinity: 0.95, popularity: 0.1, index: 1 },
    ], cities);
    expect(markets).toHaveLength(1);
    expect(markets[0]).toMatchObject({ city: { name: "Metro" }, affinity: 0.95, popularity: 0.2, pointIndexes: [0, 1] });
  });
  it("produces no market for a point with no 100k city within 50 km", () => {
    expect(marketsFromHeat([{ lat: 60, lon: 10, affinity: 1, popularity: 1, index: 0 }], cities)).toEqual([]);
  });
});

describe("marketsFromHeat on the real GeoNames dataset", () => {
  const real = loadCities();
  const nameFor = (lat: number, lon: number) => marketsFromHeat([{ lat, lon, affinity: 1, popularity: 1, index: 0 }], real)[0]?.city.name;
  it("maps suburbs seen in the live Beach House run to their tour city", () => {
    expect(nameFor(45.498, -122.431)).toBe("Portland"); // Gresham, OR
    expect(nameFor(37.688, -122.47)).toBe("San Francisco"); // Daly City, CA
    expect(nameFor(19.4, -99.015)).toBe("Mexico City"); // Nezahualcoyotl
    expect(nameFor(-22.883, -43.104)).toBe("Rio de Janeiro"); // Niteroi
  });
});
