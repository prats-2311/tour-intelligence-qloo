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
  it("lets a metro core city beat a larger non-core city in range", () => {
    const core: City = { ...mk("Core", 45.52, -122.68, 300_000), id: "4005539" };
    const cities = [mk("Bigger", 45.5, -122.43, 900_000), core];
    expect(metroAnchor(cities, { lat: 45.5, lon: -122.43 }, opts)?.name).toBe("Core");
  });
  it("ignores a metro core below the minimum population or out of range", () => {
    const small: City = { ...mk("Core", 45.52, -122.68, 50_000), id: "4005539" };
    expect(metroAnchor([mk("Bigger", 45.5, -122.43, 900_000), small], { lat: 45.5, lon: -122.43 }, opts)?.name).toBe("Bigger");
    const far: City = { ...mk("Core", 47, -122.43, 300_000), id: "4005539" };
    expect(metroAnchor([mk("Bigger", 45.5, -122.43, 900_000), far], { lat: 45.5, lon: -122.43 }, opts)?.name).toBe("Bigger");
  });
  it("without a core in range the most populous city still wins", () => {
    const cities = [mk("Small", 45.5, -122.43, 200_000), mk("Bigger", 45.52, -122.5, 900_000)];
    expect(metroAnchor(cities, { lat: 45.5, lon: -122.43 }, opts)?.name).toBe("Bigger");
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
  it("falls back to the nearest 100k city within 50 km when none is within 30 km", () => {
    const far: City[] = [
      { id: "big", name: "Big", country: "XX", lat: 45.0, lon: -122.0, population: 5_000_000 },
      { id: "mid", name: "Mid", country: "XX", lat: 45.4, lon: -122.0, population: 150_000 },
    ];
    // ~40 km from Mid (Big is ~88 km away)
    const markets = marketsFromHeat([{ lat: 45.76, lon: -122.0, affinity: 1, popularity: 1, index: 0 }], far);
    expect(markets.map((m) => m.city.name)).toEqual(["Mid"]);
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
  it("anchors Zapopan's coordinates to Guadalajara via the metro core override", () => {
    expect(metroAnchor(real, { lat: 20.72111, lon: -103.38742 }, { maxKm: 30, minPopulation: 100_000 })?.id).toBe("4005539");
    expect(nameFor(20.72111, -103.38742)).toBe("Guadalajara");
  });
  it("keeps cross-border and GeoNames-artefact metros on their home-country tour city", () => {
    expect(nameFor(35.14953, -90.04898)).toBe("Memphis"); // over New South Memphis
    expect(nameFor(32.71571, -117.16472)).toBe("San Diego"); // over Tijuana, 28 km away
    expect(nameFor(31.75872, -106.48693)).toBe("El Paso"); // over Ciudad Juarez
  });
  it("anchors the outer rings of huge metros to the capital core, not to a suburb", () => {
    const o = { maxKm: 30, minPopulation: 100_000 };
    expect(metroAnchor(real, { lat: 19.6018, lon: -99.0507 }, o)?.id).toBe("3530597"); // Ecatepec de Morelos
    expect(metroAnchor(real, { lat: 19.7, lon: -99.03 }, o)?.id).toBe("3530597"); // north Ecatepec, 32 km out
    expect(metroAnchor(real, { lat: -23.5325, lon: -46.7917 }, o)?.id).toBe("3448439"); // Osasco
    expect(nameFor(-23.45, -46.95)).toBe("Sao Paulo"); // west of Osasco, 34 km out
    expect(nameFor(19.5, -98.85)).toBe("Mexico City"); // Iztapalapa side, 30 km out
  });
  it("keeps distinct neighbouring cities on their own names", () => {
    const own = (name: string, country: string) => { const c = real.find((x) => x.name === name && x.country === country)!; return nameFor(c.lat, c.lon); };
    expect(own("Jundiai", "BR")).toBe("Jundiai");
    expect(own("Petropolis", "BR")).toBe("Petropolis");
    expect(own("Toluca", "MX")).toBe("Toluca");
    expect(own("Rosarito", "MX")).not.toBe("San Diego"); // stays a Mexican market (Tijuana, by the largest-city rule)
  });
  it("resolves each capital core id to the expected city", () => {
    const want: Record<string, string> = { "3530597": "Mexico City", "3448439": "Sao Paulo", "3451190": "Rio de Janeiro", "3995465": "Monterrey", "3435910": "Buenos Aires", "3871336": "Santiago", "3688689": "Bogota", "3936456": "Lima" };
    for (const [id, name] of Object.entries(want)) expect(real.find((c) => c.id === id)?.name).toBe(name);
  });
  it("does not label the Santos/Guaruja coast as the Sao Paulo suburb Sao Bernardo do Campo", () => {
    const name = nameFor(-23.994, -46.23);
    expect(name).not.toBe("Sao Bernardo do Campo");
    expect(["Santos", "Guarujá"]).toContain(name);
  });
});
