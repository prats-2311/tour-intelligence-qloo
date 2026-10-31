import { describe, expect, it } from "vitest";
import { SAMPLE_CITIES } from "./fixtures/lumenVale";
import { bookCities, defaultShortlist, ordinal, sortCities, summarize } from "./ranking";

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
  it("defaultShortlist takes Play/Hidden goldmine by winnability, capped at maxStops", () => {
    expect(defaultShortlist(SAMPLE_CITIES, 8)).toEqual(["3530597", "3448439", "4005539", "3464975"]);
    expect(defaultShortlist(SAMPLE_CITIES, 2)).toEqual(["3530597", "3448439"]);
    expect(defaultShortlist(SAMPLE_CITIES.filter((c) => c.verdict === "skip"), 8)).toEqual([]);
  });
});

describe("bookCities", () => {
  const ids = (st: Record<string, string>, max = 8) => bookCities(SAMPLE_CITIES, max, st).ids;
  it("no statuses equals defaultShortlist, unchanged", () => {
    const r = bookCities(SAMPLE_CITIES, 8, {});
    expect(r.ids).toEqual(defaultShortlist(SAMPLE_CITIES, 8));
    expect(r.changed).toBe(false);
  });
  it("excludes dropped cities", () => {
    const r = bookCities(SAMPLE_CITIES, 8, { "3530597": "dropped" });
    expect(r.ids).not.toContain("3530597");
    expect(r.changed).toBe(true);
  });
  it("includes confirmed cities even when the verdict is Skip or Consider", () => {
    const r = ids({ "4887398": "confirmed", "3451190": "confirmed" });
    expect(r).toContain("4887398");
    expect(r).toContain("3451190");
  });
  it("considering and on_hold do not change the set", () => {
    const r = bookCities(SAMPLE_CITIES, 8, { "4887398": "considering", "4671654": "on_hold" });
    expect(r.ids).toEqual(defaultShortlist(SAMPLE_CITIES, 8));
    expect(r.changed).toBe(false);
  });
  it("cap never cuts confirmed; cuts lowest-ranked non-confirmed first", () => {
    const r = ids({ "4887398": "confirmed", "3451190": "confirmed" }, 3);
    expect(r).toHaveLength(3);
    expect(r).toContain("4887398");
    expect(r).toContain("3451190");
    expect(r).toContain("3530597");
  });
  it("confirmed beyond the cap are all kept", () => {
    const r = ids({ "4887398": "confirmed", "3451190": "confirmed", "4671654": "confirmed" }, 2);
    expect(r).toHaveLength(3);
  });
  it("a city both dropped and in the default is out; ids are in ranking order", () => {
    const r = ids({ "4887398": "confirmed" });
    const order = sortCities(SAMPLE_CITIES, "winnability").map((c) => c.id);
    expect(r).toEqual(order.filter((id) => r.includes(id)));
  });
});
