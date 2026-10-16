import { describe, expect, it } from "vitest";
import { SAMPLE_CITIES } from "./fixtures/lumenVale";
import { boundsFor, cityMarkers } from "./geometry";

describe("map geometry", () => {
  it("markers use lon,lat and label only play/goldmine", () => {
    const m = cityMarkers(SAMPLE_CITIES);
    expect(m[0]).toEqual({ id: SAMPLE_CITIES[0]!.id, lngLat: [-99.1332, 19.4326], verdict: "play", label: "Mexico City" });
    expect(m.find((x) => x.verdict === "de_risk")!.label).toBeNull();
    expect(m.filter((x) => x.label).map((x) => x.label)).toEqual(["Mexico City", "São Paulo", "Guadalajara", "Curitiba"]);
  });
  it("bounds pad the extent and ignore non-finite coordinates", () => {
    const b = boundsFor([...SAMPLE_CITIES, { ...SAMPLE_CITIES[0]!, id: "bad", lat: Number.NaN }])!;
    expect(b[0][0]).toBeLessThan(-118.2437);
    expect(b[1][1]).toBeGreaterThan(41.8781);
  });
  it("bounds is null with no cities (Review Focus 3)", () => {
    expect(boundsFor([])).toBeNull();
  });
});
