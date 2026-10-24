import { describe, expect, it } from "vitest";
import { LUMEN_VALE_SAMPLE } from "./fixtures/lumenVale";
import { countQlooCalls, narrate } from "./narrate";
import type { GatewayEvent } from "./types";

describe("narrate", () => {
  it("turns a where_popular call+result into one completed sentence", () => {
    const steps = narrate([
      { type: "tool_call", tool: "qloo_where_popular", args: { within: "Brazil" }, cached: false },
      { type: "tool_result", tool: "qloo_where_popular", status: "ok", resultCount: 14, cacheKey: "k", stale: false },
    ]);
    expect(steps).toEqual([{ id: "0", sentence: "Finding where fans concentrate in Brazil", tool: "qloo_where_popular", status: "success", detail: "14 hotspots", cached: false, stale: false }]);
  });
  it("labels cached and stale results", () => {
    const [s] = narrate([
      { type: "tool_call", tool: "qloo_recommend", args: { target_type: "brand", signal_location: "São Paulo, BR" }, cached: true },
      { type: "tool_result", tool: "qloo_recommend", status: "ok", resultCount: 10, cacheKey: "k", stale: true },
    ]);
    expect(s).toMatchObject({ sentence: "Checking sponsor fit in São Paulo, BR", detail: "10 brands", cached: true, stale: true });
  });
  it("an unanswered call stays active", () => {
    expect(narrate([{ type: "tool_call", tool: "qloo_trends", args: {}, cached: false }])[0]!.status).toBe("active");
  });
  it("error results and events are errors with honest text", () => {
    const steps = narrate([
      { type: "tool_call", tool: "qloo_rank", args: {}, cached: false },
      { type: "tool_result", tool: "qloo_rank", status: "error", resultCount: 0, cacheKey: "k", stale: false },
      { type: "error", code: "BUDGET", message: "Session limit reached — try the showcase tour." },
    ]);
    expect(steps.map((s) => s.status)).toEqual(["error", "error"]);
    expect(steps[1]!.sentence).toBe("Session limit reached — try the showcase tour.");
  });
  it("narrates resolve, empty regions and scored cities", () => {
    const steps = narrate([
      { type: "resolve", entity: { entityId: "e", name: "Lumen Vale" } },
      { type: "region_empty", region: "Atlantis" },
      { type: "city_scored", city: (LUMEN_VALE_SAMPLE.find((e) => e.type === "city_scored") as Extract<GatewayEvent, { type: "city_scored" }>).city },
    ]);
    expect(steps.map((s) => s.sentence)).toEqual(["Matched artist: Lumen Vale", "No Qloo signal in Atlantis", "Scored Mexico City — Play, winnability 84"]);
  });
  it("counts Qloo calls and cache hits", () => {
    expect(countQlooCalls(LUMEN_VALE_SAMPLE)).toEqual({ total: 17, cached: 17 });
  });
  it("marks partial/degraded results with a detail suffix (R11)", () => {
    const steps = narrate([
      { type: "tool_call", tool: "qloo_recommend", args: { target_type: "brand", signal_location: "Seattle, US" }, cached: false },
      { type: "tool_result", tool: "qloo_recommend", status: "partial", resultCount: 3, cacheKey: "k", stale: false },
    ]);
    expect(steps[0]!.detail).toBe("3 brands · partial result");
  });
  it("marks degraded results with a detail suffix", () => {
    const steps = narrate([
      { type: "tool_call", tool: "qloo_where_popular", args: { within: "Argentina" }, cached: false },
      { type: "tool_result", tool: "qloo_where_popular", status: "degraded", resultCount: 5, cacheKey: "k", stale: false },
    ]);
    expect(steps[0]!.detail).toBe("5 hotspots · degraded");
  });
  it("ok with resultCount 0 is 'done', not 'no results' (gateway counts non-array results as 0)", () => {
    const steps = narrate([
      { type: "tool_call", tool: "qloo_audience_demographics", args: {}, cached: false },
      { type: "tool_result", tool: "qloo_audience_demographics", status: "ok", resultCount: 0, cacheKey: "k", stale: false },
    ]);
    expect(steps[0]!.status).toBe("success");
    expect(steps[0]!.detail).toBe("done");
  });
  it("an empty momentum answer says so instead of 'done'", () => {
    const steps = narrate([
      { type: "tool_call", tool: "qloo_trends", args: {}, cached: false },
      { type: "tool_result", tool: "qloo_trends", status: "ok", resultCount: 0, cacheKey: "k", stale: false },
    ]);
    expect(steps[0]!.detail).toBe("no trend data this quarter");
    expect(steps[0]!.detail).not.toBe("done");
  });
  it("only status 'empty' produces 'no results'", () => {
    const steps = narrate([
      { type: "tool_call", tool: "qloo_trends", args: {}, cached: false },
      { type: "tool_result", tool: "qloo_trends", status: "empty", resultCount: 0, cacheKey: "k", stale: false },
    ]);
    expect(steps[0]!.detail).toBe("no results");
  });
  it("needs_input event becomes info 'needs a choice'", () => {
    const steps = narrate([
      { type: "needs_input", field: "artist", candidates: [{ id: "1", name: "Lumen Vale" }], summary: "Which one?" },
    ]);
    expect(steps[0]).toMatchObject({ sentence: "Several artists match — needs a choice", status: "info" });
  });
  it("pairs tool calls by FIFO per tool (R11)", () => {
    const steps = narrate([
      { type: "tool_call", tool: "qloo_where_popular", args: { within: "A" }, cached: false },
      { type: "tool_call", tool: "qloo_where_popular", args: { within: "B" }, cached: false },
      { type: "tool_result", tool: "qloo_where_popular", status: "ok", resultCount: 10, cacheKey: "k", stale: false },
      { type: "tool_result", tool: "qloo_where_popular", status: "ok", resultCount: 20, cacheKey: "k2", stale: false },
    ]);
    expect(steps.map((s) => s.sentence)).toEqual([
      "Finding where fans concentrate in A",
      "Finding where fans concentrate in B",
    ]);
    expect(steps.map((s) => s.detail)).toEqual(["10 hotspots", "20 hotspots"]);
  });
  it("orphan tool_result creates info step instead of being dropped", () => {
    const steps = narrate([
      { type: "tool_result", tool: "qloo_rank", status: "ok", resultCount: 5, cacheKey: "k", stale: false },
    ]);
    expect(steps[0]).toMatchObject({ sentence: "Received Qloo: venue ranking result", status: "info" });
  });
  it("pluralizes chip label correctly", () => {
    // This is tested in AgentLog.test.tsx but verify the count function
    expect(countQlooCalls([{ type: "tool_call", tool: "qloo_describe", args: {}, cached: false }])).toEqual({
      total: 1,
      cached: 0,
    });
    expect(countQlooCalls([
      { type: "tool_call", tool: "qloo_describe", args: {}, cached: false },
      { type: "tool_call", tool: "qloo_trends", args: {}, cached: false },
    ])).toEqual({ total: 2, cached: 0 });
  });
  it("tool_result with needs_input status becomes info 'needs a choice' (not success)", () => {
    const steps = narrate([
      { type: "tool_call", tool: "qloo_recommend", args: { target_type: "brand", signal_location: "Boston" }, cached: false },
      { type: "tool_result", tool: "qloo_recommend", status: "needs_input", resultCount: 5, cacheKey: "k", stale: false },
    ]);
    expect(steps[0]).toMatchObject({
      sentence: "Checking sponsor fit in Boston",
      status: "info",
      detail: "needs a choice",
    });
  });
});

describe("narrate plain tool names", () => {
  it("never prints a raw tool id for an unknown tool call or an orphan result", () => {
    const steps = narrate([
      { type: "tool_call", tool: "qloo_future_thing", args: {}, cached: false },
      { type: "tool_result", tool: "qloo_other_thing", status: "ok", resultCount: 1, refs: [] },
    ] as never);
    expect(steps.map((s) => s.sentence).join(" ")).not.toMatch(/qloo_/);
    expect(steps[0]!.sentence).toBe("Calling Qloo: future thing");
  });
});
