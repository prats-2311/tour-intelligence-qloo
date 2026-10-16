import { describe, expect, it } from "vitest";
import { SAMPLE_CITIES } from "./fixtures/lumenVale";
import { ordinal, sortCities, summarize } from "./ranking";

describe("ranking", () => {
  it("winnability order matches the sample", () => {
    expect(sortCities(SAMPLE_CITIES, "winnability").map((c) => c.name).slice(0, 4)).toEqual(["Mexico City", "São Paulo", "Guadalajara", "Curitiba"]);
  });
  it("density-only moves Guadalajara 3rd → 6th and Curitiba 4th → 9th (signature moment)", () => {
    const names = sortCities(SAMPLE_CITIES, "density").map((c) => c.name);
    expect(names.indexOf("Guadalajara")).toBe(5);
    expect(names.indexOf("Curitiba")).toBe(8);
  });
  it("null winnability sorts last", () => {
    const broken = { ...SAMPLE_CITIES[0]!, id: "x", name: "Zed", winnability: { value: null, reason: "insufficient_data" as const, refs: [] } };
    expect(sortCities([broken, ...SAMPLE_CITIES], "winnability").at(-1)!.id).toBe("x");
  });
  it("summarize counts verdicts", () => {
    expect(summarize(SAMPLE_CITIES)).toEqual({ play: 2, hidden_goldmine: 2, de_risk: 1, consider: 3, skip: 1, insufficient_data: 1 });
  });
  it("winnability ties break by activation (Curitiba before Los Angeles)", () => {
    const names = sortCities(SAMPLE_CITIES, "winnability").map((c) => c.name);
    expect(names.indexOf("Curitiba")).toBe(3);
    expect(names.indexOf("Los Angeles")).toBe(4);
    expect(names.at(-1)).toBe("Belo Horizonte");
  });
  it("does not mutate its input", () => {
    const before = SAMPLE_CITIES.map((c) => c.id);
    sortCities(SAMPLE_CITIES, "density");
    expect(SAMPLE_CITIES.map((c) => c.id)).toEqual(before);
  });
  it("ordinal handles teens and suffixes", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual(
      ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th"]);
  });
});
