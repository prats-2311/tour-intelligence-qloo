import { describe, expect, it } from "vitest";
import { TOOL_ALLOWLIST, validateToolCall } from "../src/validate.js";

describe("validateToolCall", () => {
  it("rejects tools outside the allowlist", () => {
    expect(validateToolCall("qloo_api", {})).toEqual({ ok: false, error: "tool not allowlisted: qloo_api" });
  });
  it("allowlist has exactly the 10 harness tools", () => {
    expect([...TOOL_ALLOWLIST].sort()).toEqual([
      "qloo_audience_demographics", "qloo_capabilities", "qloo_compare_audiences", "qloo_describe",
      "qloo_entity_tags", "qloo_find_tags", "qloo_rank", "qloo_recommend", "qloo_trends", "qloo_where_popular",
    ]);
  });
  it("accepts a valid describe call", () => {
    expect(validateToolCall("qloo_describe", { entity: "Bad Bunny", type: "artist" }).ok).toBe(true);
  });
  it("rejects unknown args (Qloo silently ignores them)", () => {
    const r = validateToolCall("qloo_describe", { entity: "x", bogus: 1 });
    expect(r).toEqual({ ok: false, error: "qloo_describe: unknown argument bogus" });
  });
  it("rejects inherited prototype keys as unknown arguments", () => {
    const r = validateToolCall("qloo_describe", { entity: "x", constructor: 1 });
    expect(r).toEqual({ ok: false, error: "qloo_describe: unknown argument constructor" });
  });
  it("rejects rank with more than 10 options", () => {
    const options = Array.from({ length: 11 }, (_, i) => `Venue ${i}`);
    const r = validateToolCall("qloo_rank", { options, option_type: "place", signals: ["Bad Bunny"] });
    expect(r).toEqual({ ok: false, error: "qloo_rank: options must have 1-10 items" });
  });
  it("rejects trends with 6 entities and bad dates", () => {
    const six = ["a", "b", "c", "d", "e", "f"];
    expect(validateToolCall("qloo_trends", { entities: six, entity_type: "artist", start_date: "2026-01-01", end_date: "2026-02-01" }))
      .toEqual({ ok: false, error: "qloo_trends: entities must have 1-5 items" });
    expect(validateToolCall("qloo_trends", { entities: ["a"], entity_type: "artist", start_date: "2026-1-1", end_date: "2026-02-01" }))
      .toEqual({ ok: false, error: "qloo_trends: start_date must be YYYY-MM-DD" });
  });
  it("rejects limit outside 1-20 and bad insights type", () => {
    expect(validateToolCall("qloo_recommend", { target_type: "artist", signals: ["x"], limit: 21 }))
      .toEqual({ ok: false, error: "qloo_recommend: limit must be an integer 1-20" });
    expect(validateToolCall("qloo_recommend", { target_type: "event", signals: ["x"] }))
      .toEqual({ ok: false, error: "qloo_recommend: target_type must be one of artist, book, brand, movie, person, place, podcast, tv_show, videogame" });
  });
  it("requires within for where_popular and exactly two groups for compare", () => {
    expect(validateToolCall("qloo_where_popular", { entity: "x" })).toEqual({ ok: false, error: "qloo_where_popular: within is required" });
    expect(validateToolCall("qloo_compare_audiences", { group_a: ["x"] })).toEqual({ ok: false, error: "qloo_compare_audiences: group_b is required" });
  });
});
