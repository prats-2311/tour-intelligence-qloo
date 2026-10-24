import { describe, expect, it } from "vitest";
import { findCity, locationQueries, locationResolved, LOCATION_MAX_MEDIAN_KM, LOCATION_MIN_POINTS, MAX_LOCATION_ATTEMPTS } from "../src/geo/location.js";
import type { HeatPoint } from "../src/geo/heat.js";
import type { City } from "../src/geo/cities.js";

const pt = (lat: number, lon: number, index = 0): HeatPoint => ({ lat, lon, affinity: 0.8, popularity: 0.3, index });
// 1 degree of latitude is about 111 km.
const northOf = (c: { lat: number; lon: number }, km: number, i = 0) => pt(c.lat + km / 111.19, c.lon, i);
const JUAREZ = { lat: 31.72, lon: -106.46 };

describe("locationResolved", () => {
  it("exports its thresholds", () => {
    expect(LOCATION_MIN_POINTS).toBe(3);
    expect(LOCATION_MAX_MEDIAN_KM).toBe(50);
    expect(MAX_LOCATION_ATTEMPTS).toBe(3);
  });
  it("rejects Ciudad Juarez points that all sit in another metro", () => {
    const wrong = [0, 1, 2, 3, 4].map((i) => pt(19.36 + i * 0.001, -99.16, i));
    expect(locationResolved(JUAREZ, wrong)).toBe(false);
  });
  it("accepts a Cabo Frio-like spread (median 17 km, max 22 km)", () => {
    const c = { lat: -22.88, lon: -42.02 };
    expect(locationResolved(c, [12, 17, 17, 20, 22].map((km, i) => northOf(c, km, i)))).toBe(true);
  });
  it("accepts a Salvador-like spread with one far outlier", () => {
    const c = { lat: -12.97, lon: -38.5 };
    expect(locationResolved(c, [2, 3, 4, 5, 6, 78].map((km, i) => northOf(c, km, i)))).toBe(true);
  });
  it("rejects fewer than 3 points, however close", () => {
    expect(locationResolved(JUAREZ, [])).toBe(false);
    expect(locationResolved(JUAREZ, [northOf(JUAREZ, 1)])).toBe(false);
    expect(locationResolved(JUAREZ, [northOf(JUAREZ, 1), northOf(JUAREZ, 2)])).toBe(false);
    expect(locationResolved(JUAREZ, [1, 2, 3].map((km, i) => northOf(JUAREZ, km, i)))).toBe(true);
  });
  it("uses the median: more than half the points beyond 50 km fails", () => {
    expect(locationResolved(JUAREZ, [1, 60, 70, 80].map((km, i) => northOf(JUAREZ, km, i)))).toBe(false);
    expect(locationResolved(JUAREZ, [1, 2, 60, 70].map((km, i) => northOf(JUAREZ, km, i)))).toBe(true); // median (2+60)/2 = 31
  });
});

describe("locationQueries", () => {
  it("keeps the legacy string first, then adds the country's English name", () => {
    expect(locationQueries({ name: "Ciudad Juarez", country: "MX" })).toEqual(["Ciudad Juarez, MX", "Ciudad Juarez, Mexico"]);
    expect(locationQueries({ name: "Cabo Frio", country: "BR" })).toEqual(["Cabo Frio, BR", "Cabo Frio, Brazil"]);
  });
  it("never offers the bare name and never exceeds the attempt cap", () => {
    const qs = locationQueries({ name: "Reynosa", country: "MX" });
    expect(qs).not.toContain("Reynosa");
    expect(qs.length).toBeLessThanOrEqual(MAX_LOCATION_ATTEMPTS);
  });
  it("skips the long form when the country code has no English name", () => {
    expect(locationQueries({ name: "Nowhere", country: "ZZ" })).toEqual(["Nowhere, ZZ"]);
  });
});

describe("findCity", () => {
  const city = (id: string, name: string, country: string, lat: number, lon: number, population: number): City => ({ id, name, country, lat, lon, population });
  const LIST = [
    city("1", "Ciudad Juarez", "MX", 31.72, -106.46, 1_300_000),
    city("2", "Springfield", "US", 39.8, -89.65, 100_000),
    city("3", "Springfield", "US", 42.1, -72.59, 150_000),
    city("4", "Sao Paulo", "BR", -23.55, -46.63, 12_000_000),
  ];
  it("matches by id first", () => {
    expect(findCity(LIST, { id: "2", name: "Springfield", country: "US" })?.id).toBe("2");
  });
  it("ignores accents and case, and accepts ISO-2 or the English country name", () => {
    expect(findCity(LIST, { name: "ciudad juárez", country: "Mexico" })?.id).toBe("1");
    expect(findCity(LIST, { name: "SÃO PAULO", country: "br" })?.id).toBe("4");
    expect(findCity(LIST, { name: "Sao Paulo", country: "Brazil" })?.id).toBe("4");
  });
  it("returns undefined when nothing matches", () => {
    expect(findCity(LIST, { name: "Atlantis", country: "US" })).toBeUndefined();
    expect(findCity(LIST, { name: "Sao Paulo", country: "US" })).toBeUndefined();
    expect(findCity(LIST, { id: "999", name: "Atlantis", country: "US" })).toBeUndefined();
  });
  it("on a duplicate name prefers the one nearest the given coordinates, else the most populous", () => {
    expect(findCity(LIST, { name: "Springfield", country: "US", lat: 39.8, lon: -89.6 })?.id).toBe("2");
    expect(findCity(LIST, { name: "Springfield", country: "US" })?.id).toBe("3");
  });
});

import { countryCodeFor } from "../src/geo/location.js";
describe("countryCodeFor", () => {
  it("resolves English country names, case and accent-insensitively; nothing for a state or a city", () => {
    expect(countryCodeFor("United States")).toBe("US");
    expect(countryCodeFor("mexico")).toBe("MX");
    expect(countryCodeFor("Brazil")).toBe("BR");
    expect(countryCodeFor("USA")).toBe("US");
    expect(countryCodeFor("Texas")).toBeUndefined();
    expect(countryCodeFor("Texas, United States")).toBeUndefined();
    expect(countryCodeFor("")).toBeUndefined();
  });
});
