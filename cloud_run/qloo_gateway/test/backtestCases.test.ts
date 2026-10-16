// cloud_run/qloo_gateway/test/backtestCases.test.ts
import { describe, expect, it } from "vitest";
import { MIN_CASES, validateCases } from "../src/backtest/cases.js";

const ok = {
  id: "mac-demarco-gdl-vans",
  artist: "Mac DeMarco",
  city: "Guadalajara",
  country: "Mexico",
  activationType: "sponsor",
  realEntity: { name: "Vans", aliases: ["Vans Off The Wall"] },
  date: "2024-03",
  sources: ["https://example.com/article"],
  summary: "Vans sponsored the Guadalajara show.",
  review: { status: "accepted", by: "prateek", at: "2026-10-18" },
};

describe("validateCases", () => {
  it("accepts a reviewed case", () => {
    const r = validateCases([ok]);
    expect(r.errors).toEqual([]);
    expect(r.cases).toHaveLength(1);
    expect(r.skipped).toBe(0);
  });

  it("skips pending and rejected cases without error", () => {
    const r = validateCases([
      { ...ok, id: "a-pending", review: { status: "pending" } },
      { ...ok, id: "a-rejected", review: { status: "rejected", by: "prateek", at: "2026-10-18" } },
    ]);
    expect(r.cases).toEqual([]);
    expect(r.skipped).toBe(2);
    expect(r.errors).toEqual([]);
  });

  it.each([
    ["bad id", { ...ok, id: "Bad Id" }, "id"],
    ["unknown type", { ...ok, activationType: "billboard" }, "activationType"],
    ["no sources", { ...ok, sources: [] }, "sources"],
    ["http source", { ...ok, sources: ["http://example.com"] }, "sources"],
    ["date too old", { ...ok, date: "2019-05" }, "date"],
    ["date malformed", { ...ok, date: "March 2024" }, "date"],
    ["empty entity", { ...ok, realEntity: { name: " " } }, "realEntity"],
    ["accepted without reviewer", { ...ok, review: { status: "accepted", by: "", at: "2026-10-18" } }, "review"],
    ["summary too long", { ...ok, summary: "x".repeat(281) }, "summary"],
  ])("rejects %s", (_label, c, field) => {
    const r = validateCases([c]);
    expect(r.cases).toEqual([]);
    expect(r.errors.join("\n")).toContain(field);
  });

  it("rejects duplicate ids", () => {
    const r = validateCases([ok, ok]);
    expect(r.errors.join("\n")).toContain("duplicate id");
  });

  it("rejects a non-array", () => {
    expect(validateCases({}).errors).toEqual(["cases file must be a JSON array"]);
  });

  it("exports the spec floor", () => {
    expect(MIN_CASES).toBe(8);
  });
});
