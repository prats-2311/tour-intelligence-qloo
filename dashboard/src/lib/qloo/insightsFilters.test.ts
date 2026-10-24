import { describe, expect, it } from "vitest";
import type { Verdict } from "./types";
import { LUMEN_VALE_SAMPLE, SAMPLE_CITIES } from "./fixtures/lumenVale";
import { dataQuality } from "./geometry";
import { activeFilterCount, applyFilters, boxscoreCsv, byActivation, csvFilename, defaultFilters } from "./insightsFilters";

describe("insights filters", () => {
  it("defaults include everything", () => {
    expect(applyFilters(SAMPLE_CITIES, defaultFilters())).toHaveLength(10);
  });
  it("filters by verdict, country and min activation", () => {
    const f = { ...defaultFilters(), excludedVerdicts: ["play", "de_risk", "consider", "skip", "insufficient_data"] as Verdict[], excludedCountries: ["BR", "US"], minActivation: 80 };
    expect(applyFilters(SAMPLE_CITIES, f).map((c) => c.name)).toEqual(["Guadalajara"]);
  });
  it("data quality counts come only from the log", () => {
    expect(dataQuality(LUMEN_VALE_SAMPLE)).toEqual({ calls: 17, cached: 17, partial: 0, empty: 0, errors: 0 });
  });
  it("new countries are included by default (exclusion model)", () => {
    const f = { ...defaultFilters(), excludedCountries: ["MX"] };
    expect(applyFilters(SAMPLE_CITIES, f).some((c) => c.country === "MX")).toBe(false);
    expect(applyFilters(SAMPLE_CITIES, f).some((c) => c.country === "US")).toBe(true);
  });
  it("source filter: fresh = no stale warning, stale = has one", () => {
    const stale = { ...SAMPLE_CITIES[0]!, warnings: [{ tool: "t", kind: "stale" as const }] };
    const all = [stale, SAMPLE_CITIES[1]!];
    expect(applyFilters(all, { ...defaultFilters(), source: "stale" })).toEqual([stale]);
    expect(applyFilters(all, { ...defaultFilters(), source: "fresh" })).toEqual([SAMPLE_CITIES[1]]);
  });
  it("counts active filter groups", () => {
    expect(activeFilterCount(defaultFilters())).toBe(0);
    expect(activeFilterCount({ ...defaultFilters(), excludedVerdicts: ["play"], minActivation: 50 })).toBe(2);
  });
  it("byActivation sorts desc with nulls last", () => {
    const sorted = [...SAMPLE_CITIES].sort(byActivation);
    expect(sorted[0]!.name).toBe("Guadalajara");
    expect(sorted[9]!.name).toBe("Belo Horizonte");
  });
});

describe("boxscore CSV", () => {
  it("has a header, sorted-by-activation rows, empty cells for nulls", () => {
    const csv = boxscoreCsv(SAMPLE_CITIES);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const rows = csv.slice(1).split("\r\n");
    expect(rows[0]).toBe("City,Country,Sponsor fit,Local hooks,Fan concentration,Venue fit,Activation,Verdict");
    expect(rows[1]).toBe("Guadalajara,MX,0.84,0.79,0.81,0.86,82,Hidden goldmine");
    expect(rows).toHaveLength(11);
    expect(rows[10]).toBe("Belo Horizonte,BR,,,0.52,,,Not enough data");
  });
  it("a city Qloo could not place (no components at all) exports empty cells instead of throwing", () => {
    const { components: _drop, ...activation } = SAMPLE_CITIES[0]!.activation;
    const c = { ...SAMPLE_CITIES[0]!, activation } as unknown as (typeof SAMPLE_CITIES)[number];
    expect(boxscoreCsv([c]).slice(1).split("\r\n")[1]).toMatch(/^Mexico City,MX,,,,,/);
  });
  it("escapes commas, quotes and newlines", () => {
    const c = { ...SAMPLE_CITIES[0]!, name: 'Foo, "Bar"\nBaz' };
    expect(boxscoreCsv([c]).slice(1).split("\r\n")[1]!.startsWith('"Foo, ""Bar""\nBaz",MX')).toBe(true);
  });
  it("neutralises spreadsheet formula injection in text cells", () => {
    for (const bad of ["=SUM(A1)", "+1", "-2", "@x", "\tx", "\rx"]) {
      const row = boxscoreCsv([{ ...SAMPLE_CITIES[0]!, name: bad }]).slice(1).split("\r\n")[1]!;
      expect(row.replace(/^"/, "").startsWith("'")).toBe(true);
    }
  });
  it("filename includes a slug of the artist", () => {
    expect(csvFilename("Lumen Vale")).toBe("taste-insights-lumen-vale.csv");
    expect(csvFilename(undefined)).toBe("taste-insights.csv");
  });
});
