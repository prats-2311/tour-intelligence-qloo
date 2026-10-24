import { describe, expect, it } from "vitest";
import { extractEntities, extractHeatPoints, extractIssues } from "../src/extract.js";
import { describeAmbiguous, heatMexico, recs } from "./fixtures/envelopes.js";

describe("extract", () => {
  it("extracts entities and marks a missing affinity as NaN", () => {
    const e = extractEntities(recs(["A"], [0.9]));
    expect(e[0]).toMatchObject({ entityId: "E0", name: "A", affinity: 0.9, index: 0 });
    const missing = extractEntities({ operation: "recommend", status: "ok", results: [{ entity_id: "Z", name: "Z" }] });
    expect(Number.isNaN(missing[0]!.affinity)).toBe(true);
  });
  it("extracts heat points from lat/lon or geohash", () => {
    expect(extractHeatPoints(heatMexico)[0]).toMatchObject({ lat: 19.43, lon: -99.13, affinity: 0.92, popularity: 0.7, index: 0 });
    const viaHash = extractHeatPoints({ operation: "where_popular", status: "ok", results: [{ location: { geohash: "9g3w81t7j" }, query: { affinity: 0.5, popularity: 0.1 } }] });
    expect(viaHash[0]!.lat).toBeCloseTo(19.43, 1);
  });
  it("skips malformed points instead of crashing", () => {
    expect(extractHeatPoints({ operation: "where_popular", status: "ok", results: [{ foo: 1 }, null] })).toEqual([]);
  });
  it("extracts needs_input issues and candidates", () => {
    expect(extractIssues(describeAmbiguous)).toEqual([{ field: "entity", candidates: [{ id: "P1", name: "Pedro Infante" }, { id: "P2", name: "Pedro Capó" }] }]);
  });
  it("drops entities with an empty name or empty id", () => {
    const e = extractEntities({ operation: "recommend", status: "ok", results: [
      { entity_id: "1", name: "" }, { entity_id: "2", name: "   " }, { entity_id: "", name: "NoId" }, { name: "AlsoNoId" }, { entity_id: "3", name: "Ok" },
    ] });
    expect(e.map((x) => x.name)).toEqual(["Ok"]);
  });
});

describe("extract place geocode", () => {
  it("keeps a place's geocode city and country code, and nothing when it is absent", () => {
    const e = extractEntities({ operation: "recommend", status: "ok", results: [
      { entity_id: "00000000-0000-0000-0000-000000000001", name: "Hall A", properties: { geocode: { city: "Testville", country_code: "ZZ", admin1_region: "TS" } } },
      { entity_id: "00000000-0000-0000-0000-000000000002", name: "Hall B", properties: {} },
      { entity_id: "00000000-0000-0000-0000-000000000003", name: "Hall C", properties: { geocode: { city: "", country_code: "ZZ" } } },
    ] });
    expect(e[0]!.geocode).toEqual({ city: "Testville", countryCode: "ZZ" });
    expect(e[1]!.geocode).toBeUndefined();
    expect(e[2]!.geocode).toEqual({ countryCode: "ZZ" });
  });
});
