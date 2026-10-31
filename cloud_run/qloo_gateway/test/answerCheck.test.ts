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

describe("unsupportedNumbers with document citations", () => {
  const docs = [
    { id: "d1", name: "recap.txt", pages: [{ n: 1, text: "Los Angeles drew 1,200 fans." }, { n: 2, text: "Austin sold 340 tickets, 38% on presale. Longitude -118.26." }] },
    { id: "d2", name: "b.txt", pages: [{ n: 1, text: "Budget 9,000." }] },
  ];
  const check = (a: string, tool: unknown[] = [], d = docs) => unsupportedNumbers(a, tool, {}, d);
  it("passes a number found on the cited page", () => {
    expect(check("Los Angeles drew 1,200 fans [doc:d1 p.1].")).toEqual([]);
    expect(check("Austin sold 340 tickets, 38% on presale. [doc:d1 p.2]")).toEqual([]);
    expect(check("Near 118.26 west [doc:d1 p.2].")).toEqual([]);
  });
  it("flags a number that is on a different page than the one cited", () => {
    expect(check("Los Angeles drew 1,200 fans [doc:d1 p.2].")).toEqual(["1,200"]);
  });
  it("flags a number absent from the cited page and from an unknown document or page", () => {
    expect(check("They drew 5,000 fans [doc:d1 p.1].")).toEqual(["5,000"]);
    expect(check("Drew 1,200 [doc:zz p.1].")).toEqual(["1,200"]);
    expect(check("Drew 1,200 [doc:d1 p.9].")).toEqual(["1,200"]);
  });
  it("never lets tool results satisfy a document citation", () => {
    expect(check("Affinity 0.91 [doc:d1 p.1].", [[{ affinity: 0.91 }]])).toEqual(["0.91"]);
  });
  it("never lets a document satisfy an uncited number", () => {
    expect(check("Los Angeles drew 1,200 fans.")).toEqual(["1,200"]);
    expect(check("Cited 1,200 [doc:d1 p.1]. But also 340 here.")).toEqual(["340"]);
  });
  it("still checks uncited numbers against tool results", () => {
    expect(check("Fit is 0.91. Los Angeles drew 1,200 [doc:d1 p.1].", [[{ affinity: 0.91 }]])).toEqual([]);
  });
  it("does not read digits inside the doc id or page marker as claimed numbers", () => {
    expect(check("Budget 9,000 [doc:d2 p.1].")).toEqual([]);
  });
  it("keeps a citation placed after the sentence's full stop with that sentence", () => {
    expect(check("Los Angeles drew 1,200 fans. [doc:d1 p.1]")).toEqual([]);
  });
  it("accepts a sentence citing two pages if the number is on either", () => {
    expect(check("About 340 and 1,200 [doc:d1 p.1][doc:d1 p.2].")).toEqual([]);
  });
  it("keeps the old behaviour without documents", () => {
    expect(unsupportedNumbers("Expect 5,000 [doc:d1 p.1].", [], {})).toEqual(["5,000"]);
  });
  it("does not flag numbers inside brand or place names present in tool data, context or user text", () => {
    expect(unsupportedNumbers("Forever 21 fans lean young.", [[{ name: "Forever 21" }]], {})).toEqual([]);
    expect(unsupportedNumbers("Try club 33 downtown.", [], {}, [], ["what about Club 33?"])).toEqual([]);
    expect(unsupportedNumbers("Fox Theater 2 fits.", [], { cities: [{ id: "1", name: "Fox Theater 2", country: "US", verdict: "x", fanHeat: 1, activation: 1, winnability: 1 }] } as never)).toEqual([]);
    expect(unsupportedNumbers("Forever 21 has 77 stores.", [[{ name: "Forever 21" }]], {})).toEqual(["77"]);
  });
  it("accepts a number that rounds from a higher-precision supported value", () => {
    expect(unsupportedNumbers("Activation is 44.38.", [[{ a: 44.3812345 }]], {})).toEqual([]);
    expect(unsupportedNumbers("Heat 70.48 and fit 0.99.", [[{ a: 70.4823 }, { b: 0.9871 }]], {})).toEqual([]);
    expect(unsupportedNumbers("Activation is 55.5.", [[{ a: 44.3812345 }]], {})).toEqual(["55.5"]);
  });
});
