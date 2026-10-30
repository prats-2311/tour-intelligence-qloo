import { describe, expect, it } from "vitest";
import { callPurpose, countCalls, requestsLine, summariseCalls } from "./callSummary";
import { LUMEN_VALE_SAMPLE } from "./fixtures/lumenVale";
import { samplePlaybookEvents } from "./fixtures/lumenValePlaybooks";
import { countQlooCalls } from "./narrate";
import type { GatewayEvent } from "./types";

const call = (tool: string, args: Record<string, unknown> = {}): GatewayEvent => ({ type: "tool_call", tool, args, cached: false });
const log = (id: string): GatewayEvent[] => samplePlaybookEvents(id)!;

describe("callPurpose", () => {
  it("maps tools to the card they fed", () => {
    expect(callPurpose("qloo_where_popular", {})).toBe("promo zones and fan heat");
    expect(callPurpose("qloo_recommend", { target_type: "brand" })).toBe("sponsors");
    expect(callPurpose("qloo_recommend", { target_type: "place" })).toBe("venues");
    expect(callPurpose("qloo_rank", {})).toBe("venues");
    expect(callPurpose("qloo_compare_audiences", {})).toBe("support acts");
    expect(callPurpose("qloo_entity_tags", {})).toBe("merch");
    expect(callPurpose("qloo_describe", {})).toBe("acts fans love");
    expect(callPurpose("qloo_trends", {})).toBe("momentum");
  });
});

describe("summariseCalls", () => {
  const cities = [{ id: "a", name: "Aville", log: [call("qloo_recommend", { target_type: "brand" }), call("qloo_recommend", { target_type: "brand" }), call("qloo_rank"), call("qloo_trends")] }, { id: "b", name: "Bville", log: [call("qloo_where_popular")] }];
  const s = summariseCalls([call("qloo_describe"), call("qloo_trends"), call("qloo_entity_tags")], cities);
  it("counts tool_call events per city and for the board", () => {
    expect(s.board).toBe(3);
    expect(s.cities.map((c) => c.calls)).toEqual([4, 1]);
    expect(s.playbooks).toBe(5);
    expect(s.playbookCount).toBe(2);
    expect(s.total).toBe(8);
  });
  it("lists plain tool names once and what each decided", () => {
    expect(s.cities[0]!.tools).toEqual(["Sponsor recommendations", "Venue ranking", "Momentum trend"]);
    expect(s.cities[0]!.decided).toEqual(["sponsors", "venues", "momentum"]);
  });
  it("states the total line", () => {
    expect(requestsLine(s)).toBe("This book used 8 Qloo requests (board 3 + playbooks 5).");
  });
  it("handles one request and one playbook", () => {
    expect(requestsLine(summariseCalls([call("qloo_describe")], [{ id: "a", name: "A", log: [] }]))).toBe("This book used 1 Qloo request (board 1 + playbooks 0).");
  });
});

describe("call counts reconcile (finding 9)", () => {
  it("the board chip count plus the playbook counts equals the book total, from the same logs", () => {
    const ids = ["3530597", "3448439"];
    const s = summariseCalls(LUMEN_VALE_SAMPLE, ids.map((id) => ({ id, name: id, log: log(id) })));
    expect(s.board).toBe(countQlooCalls(LUMEN_VALE_SAMPLE).total);
    expect(s.playbooks).toBe(ids.reduce((n, id) => n + countQlooCalls(log(id)).total, 0));
    expect(s.total).toBe(s.board + s.playbooks);
    expect(s.cities.reduce((n, c) => n + c.calls, 0)).toBe(s.playbooks);
    expect(countCalls(LUMEN_VALE_SAMPLE)).toBe(s.board);
  });
});
