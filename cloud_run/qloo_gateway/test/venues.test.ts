import { describe, expect, it } from "vitest";
import { sameCityVenues, venueArgs, VENUE_CATEGORY_TAGS } from "../src/pipeline/venues.js";

const v = (name: string, geocode?: { city?: string; countryCode?: string }) => ({ entityId: `00000000-${name}`, name, affinity: 0.5, popularity: 0.5, index: 0, ...(geocode ? { geocode } : {}) });

describe("venue query", () => {
  it("asks for the four music-venue categories as a union, in order, 20 deep", () => {
    expect(VENUE_CATEGORY_TAGS).toEqual([
      "urn:tag:category:place:live_music_venue", "urn:tag:category:place:concert_hall",
      "urn:tag:category:place:amphitheater", "urn:tag:category:place:performing_arts_theater",
    ]);
    expect(venueArgs("A1", "Testville, ZZ")).toEqual({
      target_type: "place", signals: ["A1"], filter_location: "Testville, ZZ",
      include_tags: [...VENUE_CATEGORY_TAGS], include_tags_operator: "union", limit: 20,
    });
  });
});

describe("sameCityVenues", () => {
  const city = { name: "Testville", country: "ZZ" };
  it("keeps only same-city, same-country venues in Qloo's order; drops other towns, other countries and no-geocode", () => {
    const out = sameCityVenues([
      v("Same 1", { city: "Testville", countryCode: "ZZ" }),
      v("Other town", { city: "Nearby", countryCode: "ZZ" }),
      v("Other country", { city: "Testville", countryCode: "YY" }),
      v("No geocode"),
      v("Same 2", { city: "Testville", countryCode: "ZZ" }),
      v("No city", { countryCode: "ZZ" }),
    ], city, "Testville, ZZ");
    expect(out.map((e) => e.name)).toEqual(["Same 1", "Same 2"]);
  });
  it("matches accent and case variants, and the resolved query's city name", () => {
    expect(sameCityVenues([v("A", { city: "TESTVÍLLE", countryCode: "zz" })], { name: "Testville", country: "ZZ" }, "Testville, ZZ")).toHaveLength(1);
    expect(sameCityVenues([v("B", { city: "Ciudad Juárez", countryCode: "ZZ" })], { name: "Ciudad Juarez", country: "ZZ" }, "Ciudad Juarez, Mexico")).toHaveLength(1);
    expect(sameCityVenues([v("C", { city: "Alias Town", countryCode: "ZZ" })], city, "Alias Town, Zedland")).toHaveLength(1);
  });
  it("caps at 10", () => {
    const many = Array.from({ length: 14 }, (_, i) => v(`V${i}`, { city: "Testville", countryCode: "ZZ" }));
    expect(sameCityVenues(many, city, "Testville, ZZ")).toHaveLength(10);
  });
});
