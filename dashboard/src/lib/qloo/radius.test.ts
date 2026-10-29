import { describe, expect, it } from "vitest";
import type { ScoredCity } from "./types";
import { haversineKm, radiusNote, nearestStop } from "./radius";

const c = (id: string, name: string, lat: number, lon: number) => ({ id, name, lat, lon }) as ScoredCity;
const gdl = c("1", "Guadalajara", 20.6597, -103.3496), cdmx = c("2", "Mexico City", 19.4326, -99.1332), sp = c("3", "São Paulo", -23.5505, -46.6333);

describe("radius", () => {
  it("haversine: zero for the same point and about 111 km per degree of latitude", () => {
    expect(haversineKm(10, 10, 10, 10)).toBe(0);
    expect(haversineKm(0, 0, 1, 0)).toBeGreaterThan(110); expect(haversineKm(0, 0, 1, 0)).toBeLessThan(112);
  });
  it("picks the nearest other city, rounded to the nearest 10 km", () => {
    const n = nearestStop(gdl, [gdl, sp, cdmx])!;
    expect(n.name).toBe("Mexico City");
    expect(n.km % 10).toBe(0);
    expect(n.km).toBeGreaterThan(450); expect(n.km).toBeLessThan(500);
  });
  it("rounds 114 km down and 116 km up", () => {
    expect(nearestStop(c("a", "A", 0, 0), [c("b", "B", 1.025, 0)])!.km).toBe(110);
    expect(nearestStop(c("a", "A", 0, 0), [c("b", "B", 1.05, 0)])!.km).toBe(120);
  });
  it("is null with no other city with coordinates, or when the city lacks them", () => {
    expect(nearestStop(gdl, [gdl])).toBeNull();
    expect(nearestStop(gdl, [gdl, c("x", "X", Number.NaN, 5)])).toBeNull();
    expect(nearestStop(c("y", "Y", Number.NaN, Number.NaN), [gdl, cdmx])).toBeNull();
  });
  it("words the note", () => {
    expect(radiusNote(gdl, [gdl, cdmx])).toMatch(/^Nearest other stop: Mexico City, \d+0 km — check radius clauses\.$/);
    expect(radiusNote(gdl, [gdl])).toBeNull();
  });
});
