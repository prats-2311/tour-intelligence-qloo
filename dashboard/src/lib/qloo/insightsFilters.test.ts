import { describe, expect, it } from "vitest";
import { LUMEN_VALE_SAMPLE, SAMPLE_CITIES } from "./fixtures/lumenVale";
import { dataQuality } from "./geometry";
import { activeFilterCount, applyFilters, boxscoreCsv, csvFilename, defaultFilters } from "./insightsFilters";

describe("insights filters", () => {
  it("defaults include everything", () => {
    expect(applyFilters(SAMPLE_CITIES, defaultFilters(SAMPLE_CITIES))).toHaveLength(10);
  });
  it("filters by verdict, country and min activation", () => {
    const f = { ...defaultFilters(SAMPLE_CITIES), verdicts: ["hidden_goldmine" as const], countries: ["MX"], minActivation: 80 };
    expect(applyFilters(SAMPLE_CITIES, f).map((c) => c.name)).toEqual(["Guadalajara"]);
  });
  it("data quality counts come only from the log", () => {
    expect(dataQuality(LUMEN_VALE_SAMPLE)).toEqual({ calls: 17, cached: 17, partial: 0, empty: 0, errors: 0 });
  });
  it("counts active filters against the defaults", () => {
    const d = defaultFilters(SAMPLE_CITIES);
    expect(activeFilterCount(d, d)).toBe(0);
    expect(activeFilterCount({ ...d, verdicts: ["play"], minActivation: 50 }, d)).toBe(2);
  });
});

describe("boxscore CSV", () => {
  it("has a header, sorted-by-activation rows, empty cells for nulls", () => {
    const rows = boxscoreCsv(SAMPLE_CITIES).split("\r\n");
    expect(rows[0]).toBe("City,Country,Sponsor fit,Local hooks,Fan concentration,Venue fit,Activation,Verdict");
    expect(rows[1]).toBe("Guadalajara,MX,0.84,0.79,0.81,0.86,82,Hidden goldmine");
    expect(rows).toHaveLength(11);
    expect(rows[10]).toBe("Belo Horizonte,BR,,,0.52,,,Not enough data");
  });
  it("escapes commas, quotes and newlines", () => {
    const c = { ...SAMPLE_CITIES[0]!, name: 'Foo, "Bar"\nBaz' };
    expect(boxscoreCsv([c]).split("\r\n")[1]!.startsWith('"Foo, ""Bar""\nBaz",MX')).toBe(true);
  });
  it("filename includes a slug of the artist", () => {
    expect(csvFilename("Lumen Vale")).toBe("taste-insights-lumen-vale.csv");
    expect(csvFilename(undefined)).toBe("taste-insights.csv");
  });
});
