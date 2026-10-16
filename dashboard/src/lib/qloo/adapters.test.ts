import { describe, expect, it } from "vitest";
import { extractSharedTaste, playbookCrossDomain, toDemographicBars, toTrendSeries } from "./adapters";

describe("adapters", () => {
  const demo = [{ entity_id: "E", query: { age: { "24_and_younger": 0.18, "25_to_29": -0.08, "30_to_34": -0.76, "35_to_44": 0.27, "45_to_54": -0.59, "55_and_older": -0.6 }, gender: { male: -0.2, female: 0.2 } } }];
  it("demographic bars read the live age and gender index maps in display order", () => {
    expect(toDemographicBars(demo)).toEqual([
      { group: "age", label: "24 and under", index: 0.18 }, { group: "age", label: "25–29", index: -0.08 }, { group: "age", label: "30–34", index: -0.76 },
      { group: "age", label: "35–44", index: 0.27 }, { group: "age", label: "45–54", index: -0.59 }, { group: "age", label: "55+", index: -0.6 },
      { group: "gender", label: "Men", index: -0.2 }, { group: "gender", label: "Women", index: 0.2 },
    ]);
  });
  it("demographic bars render the parts present and drop junk", () => {
    expect(toDemographicBars([{ query: { gender: { male: 0.1, female: null } } }])).toEqual([{ group: "gender", label: "Men", index: 0.1 }]);
    expect(toDemographicBars([{ query: { age: { "25_to_29": NaN, "55_and_older": 0.3 } } }])).toEqual([{ group: "age", label: "55+", index: 0.3 }]);
    expect(toDemographicBars([{ query: {} }, null])).toEqual([]);
    expect(toDemographicBars([])).toEqual([]);
    expect(toDemographicBars("x")).toEqual([]);
    expect(toDemographicBars(null)).toEqual([]);
  });
  it("trend series from the gateway points array, sorted; empty and junk give an empty series", () => {
    expect(toTrendSeries([{ date: "2026-09-01", value: 2 }, { date: "2026-08-01", value: 1 }])).toEqual([{ date: "2026-08-01", value: 1 }, { date: "2026-09-01", value: 2 }]);
    expect(toTrendSeries([])).toEqual([]);
    expect(toTrendSeries("garbage")).toEqual([]);
    expect(toTrendSeries(null)).toEqual([]);
    expect(toTrendSeries([{ date: "2026-08-01", value: null }, { value: 1 }, null])).toEqual([]);
  });
  it("shared taste is the mean of the top-5 tag scores with the top-3 names", () => {
    const tags = [0.9, 0.8, 0.7, 0.6, 0.5, 0.1].map((score, i) => ({ name: `t${i}`, query: { score } }));
    const out = extractSharedTaste({ results: { a: [], b: [], tags } });
    expect(out.value).toBeCloseTo(0.7, 10);
    expect(out.tags).toEqual(["t0", "t1", "t2"]);
  });
  it("shared taste is null (never NaN) with no usable tags", () => {
    expect(extractSharedTaste({ results: { tags: [] } })).toEqual({ value: null, tags: [] });
    expect(extractSharedTaste({ results: [{ overlap: 0.4 }] })).toEqual({ value: null, tags: [] });
    expect(extractSharedTaste({ results: { tags: [{ name: "x", query: { score: "n" } }, { query: { score: 0.5 } }] } })).toEqual({ value: null, tags: [] });
    expect(extractSharedTaste(null)).toEqual({ value: null, tags: [] });
  });
  it("a single shared tag still gives a value", () => {
    expect(extractSharedTaste({ results: { tags: [{ name: "x", query: { score: 0.4 } }] } })).toEqual({ value: 0.4, tags: ["x"] });
  });
  it("cross-domain items come from local_moment and sponsors cards", () => {
    const out = playbookCrossDomain([
      { kind: "local_moment", status: "ok", refs: [], warnings: [], items: [{ name: "Bruma Nocturna", type: "urn:entity:artist", affinity: 0.9 }, { name: "Cine Foro", subtype: "urn:entity:place", affinity: 0.7 }] },
      { kind: "sponsors", status: "ok", refs: [], warnings: [], items: [{ name: "Cerro Alto Mezcal", affinity: 0.91 }] },
    ]);
    expect(out).toEqual([
      { category: "artist", name: "Bruma Nocturna", affinity: 0.9 },
      { category: "place", name: "Cine Foro", affinity: 0.7 },
      { category: "brand", name: "Cerro Alto Mezcal", affinity: 0.91 },
    ]);
  });
  it("cross-domain reads category first", () => {
    const out = playbookCrossDomain([{ kind: "local_moment", status: "ok", refs: [], warnings: [], items: [{ name: "Cine Foro", type: "urn:entity", category: "place", affinity: 0.7 }, { name: "Show", category: "tv_show", affinity: 0.5 }] }]);
    expect(out.map((o) => o.category)).toEqual(["place", "tv_show"]);
  });
  it("cross-domain tolerates null affinity", () => {
    const out = playbookCrossDomain([{ kind: "sponsors", status: "ok", refs: [], warnings: [], items: [{ name: "X", affinity: null }] }]);
    expect(out).toEqual([{ category: "brand", name: "X", affinity: null }]);
  });
});
