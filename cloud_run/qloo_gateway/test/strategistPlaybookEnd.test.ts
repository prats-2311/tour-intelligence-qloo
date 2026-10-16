import { describe, expect, it, vi } from "vitest";
import type { QlooCaller } from "../src/qlooCall.js";
import { executeTool } from "../src/strategist/tools.js";

vi.mock("../src/pipeline/cityPlaybook.js", () => ({ runCityPlaybook: async function* () { yield { type: "done", summary: {} }; } }));

describe("get_city_playbook stream without results", () => {
  it("returns error when the stream ends with no playbook and no error event", async () => {
    const qloo: QlooCaller = { call: vi.fn() } as unknown as QlooCaller;
    expect(await executeTool({ name: "get_city_playbook", args: { artist: "A", artistEntityId: "Q1", city: "Lima", country: "PE" } }, { qloo, cities: [], sessionId: "s" }))
      .toEqual({ name: "get_city_playbook", status: "error", summary: "playbook stream ended without results", data: null });
  });
});
