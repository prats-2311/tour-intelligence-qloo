// @ts-expect-error plain .mjs script without types
import { synthesizeFixture } from "../scripts/synthesize-fixture.mjs";
import { describe, expect, it } from "vitest";

const ID = ["3460E83E", "DCD5", "4D1B", "B3BF", "1B6C1D6D2BB8"].join("-");
const input = {
  status: "ok",
  results: [
    { entity_id: ID, name: "Real Band", subtype: "urn:entity:artist", popularity: 0.87654321, affinity: 0.76543219, properties: { description: "About Real Band", image: { url: `https://images.qloo.com/i/${ID}-420x-auto.jpg` } } },
    { location: { latitude: 20.667343, longitude: -103.35045, geohash: "9ewt84q" }, query: { affinity: 0.912345, popularity: 0.8123 } },
  ],
};

describe("synthesize-fixture", () => {
  const out = synthesizeFixture(input);
  const text = JSON.stringify(out);
  it("keeps the shape and drops every original name, id and Qloo number", () => {
    expect(out.results).toHaveLength(2);
    for (const s of ["Real Band", ID, "3460E83E", "0.87654321", "0.76543219", "0.912345", "0.8123", "images.qloo.com"]) expect(text).not.toContain(s);
    expect(out.results[0].entity_id).toMatch(/^00000000-/);
  });
  it("moves heat-point coordinates by at most 0.02 degrees and recomputes a same-length geohash", () => {
    const loc = out.results[1].location;
    expect(loc.latitude).not.toBe(20.667343);
    expect(loc.longitude).not.toBe(-103.35045);
    expect(Math.abs(loc.latitude - 20.667343)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(loc.longitude + 103.35045)).toBeLessThanOrEqual(0.02);
    expect(loc.geohash).toHaveLength(7);
    expect(loc.geohash).not.toBe("9ewt84q");
  });
  it("is deterministic", () => { expect(JSON.stringify(synthesizeFixture(input))).toBe(text); });
});
