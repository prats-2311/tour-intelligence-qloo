import { describe, expect, it } from "vitest";
import { CLOCK_RULE, clockLine, verdictClocks } from "./clocks";

const at = (iso: string) => new Date(`${iso}T15:30:00`);
const W = { start: "2027-03-12", end: "2027-04-18" };

describe("verdictClocks", () => {
  it("derives on-sale = start - 42, posters = start - 28, sponsor = on-sale - 7", () => {
    const c = verdictClocks(W, at("2027-01-01"))!;
    expect(c.onSale.date).toBe("2027-01-29");
    expect(c.postersBy.date).toBe("2027-02-12");
    expect(c.confirmSponsor.date).toBe("2027-01-22");
  });
  it("future: counts the days to on-sale", () => {
    expect(verdictClocks(W, at("2027-01-06"))!.onSale.days).toBe(23);
    expect(clockLine(verdictClocks(W, at("2027-01-06"))!, "en-GB")).toBe("on-sale in 23 days · posters by 12 Feb · confirm sponsor by 22 Jan");
  });
  it("today", () => {
    expect(clockLine(verdictClocks(W, at("2027-01-29"))!, "en-GB")).toContain("on-sale today");
  });
  it("tomorrow and yesterday are singular", () => {
    expect(clockLine(verdictClocks(W, at("2027-01-28"))!, "en-GB")).toContain("on-sale tomorrow");
    expect(clockLine(verdictClocks(W, at("2027-01-30"))!, "en-GB")).toContain("on-sale 1 day ago");
  });
  it("past", () => {
    expect(clockLine(verdictClocks(W, at("2027-02-03"))!, "en-GB")).toContain("on-sale 5 days ago");
  });
  it("crosses a year boundary and a leap day", () => {
    expect(verdictClocks({ start: "2028-03-10", end: "2028-03-20" }, at("2028-01-01"))!.onSale.date).toBe("2028-01-28");
    expect(verdictClocks({ start: "2028-02-10", end: "2028-03-20" }, at("2027-12-01"))!.postersBy.date).toBe("2028-01-13");
  });
  it("is null without a usable window", () => {
    expect(verdictClocks(undefined)).toBeNull();
    expect(verdictClocks({ start: "", end: "" })).toBeNull();
    expect(verdictClocks({ start: "soon", end: "later" })).toBeNull();
  });
  it("states the 6-week rule", () => {
    expect(CLOCK_RULE).toBe("Dates assume a 6-week on-sale lead before the first show; change the window in the brief.");
  });
});
