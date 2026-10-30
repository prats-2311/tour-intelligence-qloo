import { describe, expect, it } from "vitest";
import { unsupportedNumbers } from "../src/strategist/answerCheck.js";

describe("unsupportedNumbers", () => {
  const ctx = { cities: [{ id: "1", name: "Guadalajara", country: "MX", verdict: "hidden_goldmine", fanHeat: 62, activation: 82, winnability: 72 }] };
  it("accepts numbers present in tool data or the board context, incl. percent of a share", () => {
    expect(unsupportedNumbers("Guadalajara scores 72; Cerro Alto fits at 0.91 and Colonia Americana holds 38%.", [[{ affinity: 0.91 }, { share: 0.38 }]], ctx)).toEqual([]);
  });
  it("flags numbers found nowhere", () => {
    expect(unsupportedNumbers("Expect 5,000 fans and a 0.97 fit.", [[{ affinity: 0.91 }]], ctx)).toEqual(["5,000", "0.97"]);
  });
  it("flags scaled numbers whose scaled value is absent", () => {
    expect(unsupportedNumbers("About 1.2k fans", [[{ affinity: 1.2 }]], {})).toEqual(["1.2k"]);
  });
  it("treats a percent rendering of a demographics or shared-taste value as unsupported", () => {
    const demo = [{ entity_id: "A", query: { age: { "24_and_younger": 0.18, "25_to_29": -0.08 }, gender: { female: 0.2 } } }];
    expect(unsupportedNumbers("About 18% of the audience is young.", [demo], {})).toEqual(["18%"]);
    expect(unsupportedNumbers("The youngest band indexes at 0.18 vs average.", [demo], {})).toEqual([]);
    expect(unsupportedNumbers("They share 50% of taste.", [{ sharedTaste: 0.5, sharedTags: ["Pop"] }], {})).toEqual(["50%"]);
    expect(unsupportedNumbers("Shared taste is 0.5.", [{ sharedTaste: 0.5, sharedTags: ["Pop"] }], {})).toEqual([]);
  });
  it("still accepts a percent of a non-score value", () => {
    expect(unsupportedNumbers("Holds 38%.", [[{ share: 0.38 }], [{ query: { age: { x: 0.18 } } }]], {})).toEqual([]);
  });
  it("does not count list markers or step ordinals as claimed numbers", () => {
    const text = "Plan:\n1. Lead with Guadalajara at 72.\n2) Hold the second slot.\n  3. Confirm.\n- 4. nested\n**5.** bold marker\nStep 6: wrap up. Then step 7 follows.";
    expect(unsupportedNumbers(text, [], ctx)).toEqual([]);
  });
  it("still flags a real number that sits inside a list item", () => {
    expect(unsupportedNumbers("1. Expect 5,000 fans.\n2. Fit is 0.97.", [], {})).toEqual(["5,000", "0.97"]);
  });
  it("still flags a number that starts a sentence mid-line", () => {
    expect(unsupportedNumbers("Top picks: 2. Then 3 more.", [], {})).toEqual(["2", "3"]);
  });
  it("matches a number by absolute value when prose drops the minus sign (longitudes)", () => {
    const data = [[{ name: "Echo Park", lat: 34.07, lon: -118.26 }, { name: "Silver Lake", lat: 34.08, lon: -118.24 }]];
    expect(unsupportedNumbers("Venues sit near 118.26 and 118.24 west.", data, {})).toEqual([]);
    expect(unsupportedNumbers("Also at 118.99 west.", data, {})).toEqual(["118.99"]);
  });
  it("does not let a negative over/under-index score support its positive spelling", () => {
    const demo = [{ entity_id: "A", query: { age: { "25_to_29": -0.08 } } }];
    expect(unsupportedNumbers("Indexes at 0.08.", [demo], {})).toEqual(["0.08"]);
  });
});
