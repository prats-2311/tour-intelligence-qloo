import { describe, expect, it } from "vitest";
import { SAMPLE_CITIES } from "./fixtures/lumenVale";
import { boundsFor, cityMarkers, linear, placeLabels, verdictRegions, MAP_STYLE_URL, matrixPoints, nearestPoint, shouldRefit, tintFor } from "./geometry";

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

describe("nearestPoint hit testing", () => {
  const pts = matrixPoints(SAMPLE_CITIES, { w: 480, h: 320, pad: 36 });
  const at = (name: string) => pts.find((p) => p.name === name)!;
  it("returns the point under an exact click, even when neighbours are close", () => {
    expect(nearestPoint(pts, at("Rio de Janeiro").x, at("Rio de Janeiro").y, 30)).toBe(at("Rio de Janeiro").id);
    expect(nearestPoint(pts, at("Austin").x, at("Austin").y, 30)).toBe(at("Austin").id);
  });
  it("midway picks the nearer point", () => {
    const a = at("Rio de Janeiro"), b = at("Austin");
    expect(nearestPoint(pts, a.x + (b.x - a.x) * 0.4, a.y + (b.y - a.y) * 0.4, 100)).toBe(a.id);
    expect(nearestPoint(pts, a.x + (b.x - a.x) * 0.6, a.y + (b.y - a.y) * 0.6, 100)).toBe(b.id);
  });
  it("returns null when nothing is within maxDist", () => {
    expect(nearestPoint(pts, -500, -500, 30)).toBeNull();
    expect(nearestPoint([], 0, 0, 30)).toBeNull();
  });
});

describe("verdict regions and label placement", () => {
  const t = { playFan: 70, playAct: 28, goldmineFanMin: 45, goldmineFanMax: 70, goldmineAct: 38, deRiskFan: 70, deRiskAct: 13, considerWin: 36 };
  it("regions come from the scoring thresholds", () => {
    const r = verdictRegions(t);
    expect(r.play).toEqual({ fan: [70, 100], act: [28, 100] });
    expect(r.hidden_goldmine).toEqual({ fan: [45, 70], act: [38, 100] });
    expect(r.de_risk).toEqual({ fan: [70, 100], act: [0, 13] });
  });
  it("labels never overlap each other, and an unplaceable label is dropped (shown on hover instead)", () => {
    const pts = [
      { id: "a", name: "Los Angeles", x: 400, y: 100 },
      { id: "b", name: "Mexico City", x: 402, y: 104 },
      { id: "c", name: "Austin", x: 398, y: 108 },
      { id: "d", name: "Portland", x: 300, y: 200 },
    ];
    const placed = placeLabels(pts, { w: 480, h: 320 });
    const boxes = pts.flatMap((p) => { const l = placed.get(p.id); return l ? [l.box] : []; });
    expect(placed.get("d")).toBeTruthy();
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!, b = boxes[j]!;
      expect(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0).toBe(true);
    }
    for (const b of boxes) { expect(b.x0).toBeGreaterThanOrEqual(0); expect(b.x1).toBeLessThanOrEqual(480); }
  });
});
