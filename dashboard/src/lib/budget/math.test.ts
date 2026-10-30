import { describe, expect, it } from "vitest";
import { buildLegs } from "./legs";
import { SENSITIVITY, blankBudget, blankCity, breakEvenTickets, cityResult, copyCityToAll, nightsFor, parseMoney, tourResult } from "./math";

const stops = [
  { id: "a", name: "Alpha", lat: 0, lon: 0 },
  { id: "b", name: "Beta", lat: 0, lon: 3 }, // ~334 km: drive, 1 day
  { id: "c", name: "Gamma", lat: 0, lon: 30 }, // ~3,000 km: fly, 1 day
];
const filled = { ...blankCity(), artistFee: "10000", venue: "2000", production: "1000", crew: "500", marketing: "500", ticketPrice: "50", capacity: "400", sellThrough: "80", merchPerHead: "10", sponsor: "2000" };

describe("budget maths", () => {
  it("every input starts blank", () => {
    const b = blankBudget(["a", "b"]);
    expect(Object.values(b.cities.a!).every((v) => v === "")).toBe(true);
    expect([b.perDiem, b.crewSize, b.hotel, b.rooms]).toEqual(["", "", "", ""]);
    expect(b.currency).toBe("USD");
  });
  it("parseMoney: blank, junk and negatives are null, never 0", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("  ")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("-5")).toBeNull();
    expect(parseMoney("1,500.5")).toBe(1500.5);
    expect(parseMoney("0")).toBe(0);
  });
  it("nights = show days (one per city) + travel days", () => {
    expect(nightsFor(3, buildLegs(stops))).toBe(5);
    expect(nightsFor(1, [])).toBe(1);
  });
  it("blank city: no cost, income, margin or break-even (null, not 0)", () => {
    const r = cityResult(blankCity());
    expect(r).toMatchObject({ cost: null, income: null, margin: null, breakEven: null });
    expect(r.hints.income).toBe("Fill in ticket price, capacity and sell-through % to see income");
    expect(r.hints.cost).toBe("Fill in at least one cost to see cost");
  });
  it("city cost sums the five cost fields; income = tickets x (price + merch) + sponsor", () => {
    const r = cityResult(filled);
    expect(r.cost).toBe(14000);
    expect(r.income).toBe(320 * 60 + 2000); // 400 x 80% = 320 tickets
    expect(r.margin).toBe(21200 - 14000);
  });
  it("blank merch and sponsor add nothing to income but do not hide it", () => {
    expect(cityResult({ ...filled, merchPerHead: "", sponsor: "" }).income).toBe(320 * 50);
  });
  it("break-even tickets = ceil((cost - sponsor) / (ticket price + merch per head))", () => {
    expect(breakEvenTickets(filled)).toBe(Math.ceil(12000 / 60)); // 200
    expect(breakEvenTickets({ ...filled, merchPerHead: "7" })).toBe(Math.ceil(12000 / 57)); // 211
    expect(breakEvenTickets({ ...filled, sponsor: "20000" })).toBe(0); // sponsor covers the costs
    expect(breakEvenTickets({ ...filled, ticketPrice: "" })).toBeNull();
    expect(breakEvenTickets({ ...filled, ticketPrice: "0", merchPerHead: "" })).toBeNull();
    expect(breakEvenTickets({ ...blankCity(), ticketPrice: "50" })).toBeNull(); // no costs entered
  });
  it("break-even does not need capacity or sell-through, and flags a break-even above capacity", () => {
    const r = cityResult({ ...filled, capacity: "150", sellThrough: "" });
    expect(r.breakEven).toBe(200);
    expect(r.overCapacity).toBe(true);
    expect(r.income).toBeNull();
  });
  it("sensitivity at 60/80/100% sell-through per city", () => {
    expect(SENSITIVITY).toEqual([60, 80, 100]);
    const r = cityResult({ ...filled, sellThrough: "" });
    expect(r.sensitivity.map((s) => s.margin)).toEqual([240 * 60 + 2000 - 14000, 320 * 60 + 2000 - 14000, 400 * 60 + 2000 - 14000]);
  });
  it("sensitivity is null without ticket price and capacity", () => {
    expect(cityResult({ ...filled, capacity: "" }).sensitivity.every((s) => s.margin === null)).toBe(true);
  });
  it("tour totals include cities, legs, per diems and hotels", () => {
    const b = blankBudget(["a", "b", "c"]);
    b.cities.a = { ...filled }; b.cities.b = { ...filled }; b.cities.c = { ...filled };
    b.legs = { "a>b": "800", "b>c": "3000" };
    b.perDiem = "50"; b.crewSize = "10"; b.hotel = "120"; b.rooms = "5";
    const t = tourResult(b, stops);
    expect(t.nights).toBe(5);
    expect(t.legCost).toBe(3800);
    expect(t.perDiemCost).toBe(50 * 10 * 5);
    expect(t.hotelCost).toBe(120 * 5 * 5);
    expect(t.cost).toBe(3 * 14000 + 3800 + 2500 + 3000);
    expect(t.income).toBe(3 * 21200);
    expect(t.margin).toBe(3 * 21200 - (3 * 14000 + 3800 + 2500 + 3000));
    expect(t.sensitivity.map((s) => s.margin)).toEqual([0, 1, 2].map((i) => 3 * ([240, 320, 400][i]! * 60 + 2000) - (3 * 14000 + 3800 + 2500 + 3000)));
  });
  it("tour margin stays null while any city's income cannot be worked out, and says what is missing", () => {
    const b = blankBudget(["a", "b", "c"]);
    b.cities.a = { ...filled };
    const t = tourResult(b, stops);
    expect(t.income).toBeNull();
    expect(t.margin).toBeNull();
    expect(t.hints.margin).toMatch(/^Fill in ticket price, capacity and sell-through % for Beta, Gamma to see the tour margin/);
    expect(t.cost).toBe(14000);
  });
  it("an all-blank budget has no totals at all", () => {
    const t = tourResult(blankBudget(["a", "b", "c"]), stops);
    expect([t.cost, t.income, t.margin, t.legCost, t.perDiemCost, t.hotelCost]).toEqual([null, null, null, null, null, null]);
  });
  it("per diem needs both rate and crew size; hotel needs both rate and rooms", () => {
    const b = blankBudget(["a", "b", "c"]);
    b.perDiem = "50";
    expect(tourResult(b, stops).perDiemCost).toBeNull();
    expect(tourResult(b, stops).hints.perDiem).toBe("Fill in crew size to see per diems");
    b.hotel = "100";
    expect(tourResult(b, stops).hotelCost).toBeNull();
  });
  it("copy this city's values to all cities copies money fields but not the sponsor link", () => {
    const b = blankBudget(["a", "b", "c"]);
    b.cities.a = { ...filled, sponsorName: "Acme" };
    const next = copyCityToAll(b, "a");
    expect(next.cities.b).toEqual({ ...filled, sponsorName: "" });
    expect(next.cities.c!.artistFee).toBe("10000");
    expect(next.cities.a!.sponsorName).toBe("Acme");
    expect(b.cities.b!.artistFee).toBe(""); // input is not mutated
  });
});
