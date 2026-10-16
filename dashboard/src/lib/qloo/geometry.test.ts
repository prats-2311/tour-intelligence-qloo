import { describe, expect, it } from "vitest";
import { SAMPLE_CITIES } from "./fixtures/lumenVale";
import { boundsFor, cityMarkers, linear, MAP_STYLE_URL, matrixPoints, shouldRefit, tintFor } from "./geometry";

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
  it("uses OpenFreeMap's keyless dark style, not CARTO", () => {
    expect(MAP_STYLE_URL).toBe("https://tiles.openfreemap.org/styles/dark");
    expect(MAP_STYLE_URL).not.toMatch(/carto/i);
  });
  it("warm tint maps layers to canvas tones and hides labels except country names", () => {
    expect(tintFor({ id: "background", type: "background" })).toEqual({ paint: { "background-color": "#151410" } });
    expect(tintFor({ id: "water", type: "fill" })).toEqual({ paint: { "fill-color": "#12110e" } });
    expect(tintFor({ id: "waterway", type: "line" })).toEqual({ paint: { "line-color": "#12110e" } });
    expect(tintFor({ id: "landuse_park", type: "fill" })).toEqual({ paint: { "fill-color": "#1c1b18" } });
    expect(tintFor({ id: "highway_minor", type: "line" })).toEqual({ paint: { "line-color": "#2a2924" } });
    expect(tintFor({ id: "highway_name_motorway", type: "symbol" })).toEqual({ hide: true });
    expect(tintFor({ id: "place_city", type: "symbol" })).toEqual({ hide: true });
    const country = tintFor({ id: "place_country_major", type: "symbol" });
    expect(country.hide).toBeUndefined();
    expect(country.paint?.["text-opacity"]).toBeLessThan(1);
  });
  it("shouldRefit only for a real, non-empty size change", () => {
    expect(shouldRefit({ w: 0, h: 0 }, { w: 600, h: 460 })).toBe(true);
    expect(shouldRefit({ w: 600, h: 460 }, { w: 600, h: 460 })).toBe(false);
    expect(shouldRefit({ w: 600, h: 460 }, { w: 600.4, h: 460 })).toBe(false);
    expect(shouldRefit({ w: 600, h: 460 }, { w: 0, h: 460 })).toBe(false);
    expect(shouldRefit({ w: 600, h: 460 }, { w: 320, h: 460 })).toBe(true);
  });
});

describe("chart geometry", () => {
  it("linear maps domain to range", () => { expect(linear([0, 100], [0, 200])(50)).toBe(100); });
  it("matrix points invert y and skip nulls", () => {
    const pts = matrixPoints([SAMPLE_CITIES[2]!, { ...SAMPLE_CITIES[0]!, id: "n", activation: { value: null, reason: "insufficient_data", refs: [], components: {} } }], { w: 220, h: 220, pad: 10 });
    expect(pts).toHaveLength(1);
    expect(pts[0]).toMatchObject({ name: "Guadalajara", verdict: "hidden_goldmine" });
    expect(pts[0]!.x).toBeCloseTo(134);
    expect(pts[0]!.y).toBeCloseTo(46);
  });
});
