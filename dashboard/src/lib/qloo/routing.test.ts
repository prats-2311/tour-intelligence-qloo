import { describe, expect, it } from "vitest";
import { MAX_PASTED_CITIES, parsePastedCities, ROUTING_CAP_NOTE, routingUnmatchedText } from "./routing";

describe("parsePastedCities", () => {
  it("one city per line, City or City, Country, trimmed, blanks dropped", () => {
    const r = parsePastedCities("  Portland, US \n\n Austin\r\n   \nMexico City , MX\n");
    expect(r.cities).toEqual([{ name: "Portland", country: "US" }, { name: "Austin" }, { name: "Mexico City", country: "MX" }]);
    expect(r.capped).toBe(false);
  });
  it("splits at the last comma so a name with a comma keeps it", () => {
    expect(parsePastedCities("Washington, D.C., US").cities).toEqual([{ name: "Washington, D.C.", country: "US" }]);
  });
  it("de-duplicates ignoring case and accents, but the same name in two countries stays", () => {
    const r = parsePastedCities("Querétaro, MX\nqueretaro, mx\nSpringfield, US\nSpringfield, MX\nSpringfield, US");
    expect(r.cities.map((c) => `${c.name}|${c.country}`)).toEqual(["Querétaro|MX", "Springfield|US", "Springfield|MX"]);
  });
  it("caps at 8 unique cities, keeps the first 8 and says so", () => {
    const text = Array.from({ length: 11 }, (_, i) => `City ${i}`).join("\n");
    const r = parsePastedCities(text);
    expect(r.cities).toHaveLength(MAX_PASTED_CITIES);
    expect(r.cities[7]!.name).toBe("City 7");
    expect(r.capped).toBe(true);
    expect(parsePastedCities("A\nB\nA").capped).toBe(false); // duplicates do not count toward the cap
    expect(ROUTING_CAP_NOTE).toBe("Up to 8 cities — the first 8 will be used.");
  });
  it("empty text is no cities", () => {
    expect(parsePastedCities(" \n \n")).toEqual({ cities: [], capped: false });
  });
  it("words the unmatched banner verbatim", () => {
    expect(routingUnmatchedText(["Atlantis", "Nowhere, MX"])).toBe("Not in our city list: Atlantis, Nowhere, MX. Check the spelling or add the country.");
  });
});
