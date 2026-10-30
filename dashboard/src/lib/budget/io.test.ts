// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { exampleBudget, EXAMPLE_BANNER } from "./example";
import { budgetCsv } from "./csv";
import { blankBudget } from "./math";
import { clearBudget, loadBudget, saveBudget, storageKey } from "./storage";

const stops = [
  { id: "a", name: "Alpha, Inc", lat: 0, lon: 0 },
  { id: "b", name: "Beta", lat: 0, lon: 3 },
];
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe("budget persistence", () => {
  it("keys storage per tour", () => {
    expect(storageKey("showcase|Mac")).toBe("tiq.budget.showcase|Mac");
  });
  it("round-trips a budget", () => {
    const b = blankBudget(["a", "b"]); b.cities.a!.artistFee = "123"; b.currency = "BRL";
    saveBudget("t1", b);
    expect(loadBudget("t1", ["a", "b"])).toEqual(b);
    expect(loadBudget("t2", ["a", "b"])).toEqual(blankBudget(["a", "b"]));
  });
  it("adds blank rows for cities that were not there when it was saved", () => {
    saveBudget("t1", blankBudget(["a"]));
    expect(Object.keys(loadBudget("t1", ["a", "b"]).cities)).toEqual(["a", "b"]);
  });
  it("ignores corrupt storage and a blocked localStorage", () => {
    localStorage.setItem("tiq.budget.t1", "{not json");
    expect(loadBudget("t1", ["a"])).toEqual(blankBudget(["a"]));
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(loadBudget("t1", ["a"])).toEqual(blankBudget(["a"]));
    expect(() => saveBudget("t1", blankBudget(["a"]))).not.toThrow();
  });
  it("clear removes the saved budget", () => {
    saveBudget("t1", blankBudget(["a"]));
    clearBudget("t1");
    expect(localStorage.getItem("tiq.budget.t1")).toBeNull();
  });
});

describe("example budget", () => {
  it("is flagged, uses round placeholder numbers and says so", () => {
    const b = exampleBudget(["a", "b"], ["a>b"]);
    expect(b.example).toBe(true);
    expect(EXAMPLE_BANNER).toBe("Example budget with fictional figures — replace with your own.");
    for (const v of [b.cities.a!.artistFee, b.cities.a!.ticketPrice, b.cities.a!.capacity, b.legs["a>b"]!, b.perDiem, b.hotel]) { expect(v).toMatch(/^\d+$/); expect(Number(v) % 5).toBe(0); }
    expect(b.cities.a!.artistFee).toBe("10000");
  });
});

describe("CSV", () => {
  it("lists cities, legs and tour totals; blanks stay empty; commas are quoted", () => {
    const b = blankBudget(["a", "b"]);
    b.cities.a = { ...b.cities.a!, artistFee: "1000", ticketPrice: "50", capacity: "100", sellThrough: "50" };
    b.legs["a>b"] = "200";
    const lines = budgetCsv(b, stops).split("\n");
    expect(lines[0]).toBe("City,Currency,Artist fee,Venue,Production,Local crew,Marketing,Ticket price,Capacity,Sell-through %,Merch per head,Sponsor,Sponsor name,Cost,Income,Margin,Break-even tickets");
    expect(lines[1]).toBe('"Alpha, Inc",USD,1000,,,,,50,100,50,,,,1000,2500,1500,20');
    expect(lines[2]).toBe("Beta,USD,,,,,,,,,,,,,,,");
    expect(lines).toContain("Leg,From,To,Km,Mode,Travel days,Travel cost");
    expect(lines).toContain("1,Alpha Inc".replace(" ", ", ") && '1,"Alpha, Inc",Beta,334,drive,1,200');
    expect(lines.some((l) => l.startsWith("Tour,Currency") || l.startsWith("Tour total"))).toBe(true);
  });
});
