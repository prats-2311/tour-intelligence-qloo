import { describe, expect, it } from "vitest";
import { playbookCrossDomain, toDemographicBars, toTrendSeries } from "./adapters";

describe("adapters", () => {
  it("demographic bars accept common shapes and drop junk", () => {
    expect(toDemographicBars([{ label: "≤24", index: 0.41 }, { age: "25–29", value: 0.2 }, { name: "x", affinity: "nope" }, null])).toEqual([{ label: "≤24", index: 0.41 }, { label: "25–29", index: 0.2 }]);
  });
  it("demographic bars drop non-finite and non-array input", () => {
    expect(toDemographicBars([{ label: "a", index: null }, { label: "b", index: NaN }])).toEqual([]);
    expect(toDemographicBars("x" as unknown as unknown[])).toEqual([]);
  });
  it("trend series from {series}, flat arrays and per-entity arrays, sorted", () => {
    expect(toTrendSeries({ series: [{ date: "2026-09-01", value: 2 }, { date: "2026-08-01", value: 1 }] })).toEqual([{ date: "2026-08-01", value: 1 }, { date: "2026-09-01", value: 2 }]);
    expect(toTrendSeries([{ time: "2026-08-01", popularity: 0.3 }])).toEqual([{ date: "2026-08-01", value: 0.3 }]);
    expect(toTrendSeries([{ entity: "A", series: [{ day: "2026-08-01", score: 5 }] }])).toEqual([{ date: "2026-08-01", value: 5 }]);
    expect(toTrendSeries("garbage")).toEqual([]);
    expect(toTrendSeries(null)).toEqual([]);
    expect(toTrendSeries([{ date: "2026-08-01", value: null }])).toEqual([]);
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
  it("cross-domain tolerates null affinity", () => {
    const out = playbookCrossDomain([{ kind: "sponsors", status: "ok", refs: [], warnings: [], items: [{ name: "X", affinity: null }] }]);
    expect(out).toEqual([{ category: "brand", name: "X", affinity: null }]);
  });
});
