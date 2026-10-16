import { describe, expect, it } from "vitest";
import { verifyWebItems } from "../src/web/verifyWeb.js";

const results = [
  { id: "w1", url: "https://a.example/1", title: "Festival de Cine en Guadalajara 2027", content: "The film festival runs 13-19 March in Guadalajara." },
  { id: "w2", url: "https://b.example/2", title: "Holidays", content: "Benito Juárez Day is observed on 15 March." },
];
const window = { start: "2027-03-12", end: "2027-04-18" };

describe("verifyWebItems", () => {
  it("keeps an item whose entities appear in a cited result and whose date is in the window", () => {
    const item = { text: "Film festival week", date: "2027-03-13", entities: ["Festival de Cine en Guadalajara"], citations: ["w1"] };
    expect(verifyWebItems([item], results, window).verified).toEqual([item]);
  });
  it("matches entities accent- and case-insensitively", () => {
    const item = { text: "Holiday", date: "2027-03-15", entities: ["benito juarez day"], citations: ["w2"] };
    expect(verifyWebItems([item], results, window).verified).toHaveLength(1);
  });
  it("removes items with no citation, an unknown citation, an unsupported entity, or a date outside the window", () => {
    const r = verifyWebItems([
      { text: "a", date: null, entities: [], citations: [] },
      { text: "b", date: null, entities: [], citations: ["w9"] },
      { text: "c", date: null, entities: ["Rival Arena"], citations: ["w1"] },
      { text: "d", date: "2027-05-01", entities: ["Festival de Cine en Guadalajara"], citations: ["w1"] },
      { text: "e", date: "13 March", entities: ["Festival de Cine en Guadalajara"], citations: ["w1"] },
    ], results, window);
    expect(r.verified).toEqual([]);
    expect(r.removed.map((x) => x.reason)).toEqual(["no citation", "unknown citation w9", "entity not in cited source: Rival Arena", "date outside window", "date not ISO"]);
  });
  it("removes an item with no entities as nothing checkable", () => {
    const r = verifyWebItems([{ text: "Something is on", date: null, entities: [], citations: ["w1"] }], results, window);
    expect(r.verified).toEqual([]);
    expect(r.removed[0]!.reason).toBe("nothing checkable");
  });
  it("removes an item whose text states a number absent from the cited source", () => {
    const item = { text: "Festival runs 13-21 March", date: "2027-03-13", entities: ["Festival de Cine en Guadalajara"], citations: ["w1"] };
    const r = verifyWebItems([item], results, window);
    expect(r.removed[0]!.reason).toBe("number not in cited source: 21");
  });
  it("keeps an item whose numbers all appear in the cited source", () => {
    const item = { text: "Festival runs 13-19 March", date: "2027-03-13", entities: ["Festival de Cine en Guadalajara"], citations: ["w1"] };
    expect(verifyWebItems([item], results, window).verified).toEqual([item]);
  });
});
