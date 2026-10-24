import type { QlooEnvelope } from "../../src/types.js";

export const describeOk: QlooEnvelope = {
  operation: "describe", status: "ok",
  results: [{ entity_id: "A1", name: "Test Artist", type: "urn:entity", subtype: "urn:entity:artist", popularity: 0.9 }],
};
export const describeAmbiguous: QlooEnvelope = {
  operation: "describe", status: "needs_input", summary: "Choose the intended Qloo entity.",
  issues: [{ input: "Pedro", kind: "ambiguous", field: "entity", candidates: [{ id: "P1", name: "Pedro Infante" }, { id: "P2", name: "Pedro Capó" }] }],
};
export const heatMexico: QlooEnvelope = {
  operation: "where_popular", status: "ok",
  results: [
    { location: { latitude: 19.43, longitude: -99.13 }, query: { affinity: 0.92, popularity: 0.7 } },
    { location: { latitude: 25.68, longitude: -100.31 }, query: { affinity: 0.66, popularity: 0.4 } },
  ],
};
export const heatEmpty: QlooEnvelope = { operation: "where_popular", status: "empty", results: [] };
export const recs = (names: string[], affinities: number[]): QlooEnvelope => ({
  operation: "recommend", status: "ok",
  results: names.map((name, i) => ({ entity_id: `E${i}`, name, affinity: affinities[i] ?? 0, popularity: 0.5 })),
});
export const cityHeat: QlooEnvelope = {
  operation: "where_popular", status: "ok",
  results: [
    { location: { latitude: 19.35, longitude: -99.16 }, query: { affinity: 0.6, popularity: 0.2 } },
    { location: { latitude: 19.43, longitude: -99.13 }, query: { affinity: 0.3, popularity: 0.2 } },
    { location: { latitude: 19.40, longitude: -99.20 }, query: { affinity: 0.1, popularity: 0.2 } },
  ],
};
/** Place recommendations whose geocode puts them in the queried city ("<city>, <ISO-2>"), as Qloo's same-city venues do. */
export const placesIn = (where: unknown, names: string[], affinities: number[]): QlooEnvelope => {
  const [city, country_code] = String(where).split(", ");
  return {
    operation: "recommend", status: "ok",
    results: names.map((name, i) => ({ entity_id: `E${i}`, name, affinity: affinities[i] ?? 0, popularity: 0.5, properties: { geocode: { city, country_code } } })),
  };
};
