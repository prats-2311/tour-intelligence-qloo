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
});
