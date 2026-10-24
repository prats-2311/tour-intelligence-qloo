import { describe, expect, it, vi } from "vitest";
import type { QlooCaller } from "../src/qlooCall.js";
import { executeTool } from "../src/strategist/tools.js";

vi.mock("../src/pipeline/cityPlaybook.js", () => ({
  runCityPlaybook: async function* () {
    yield { type: "playbook", playbook: { cards: [{ kind: "sponsors", status: "ok", items: [{ name: "A" }] }, { kind: "venues", status: "ok", items: [] }, { kind: "talent", status: "empty", items: [] }] } };
    yield { type: "done", summary: {} };
  },
}));

describe("get_city_playbook result count", () => {
  it("reports the card count as resultCount", async () => {
    const qloo: QlooCaller = { call: vi.fn() } as unknown as QlooCaller;
    const out = await executeTool({ name: "get_city_playbook", args: { artist: "A", artistEntityId: "Q1", city: "Lima", country: "PE" } }, { qloo, cities: [], sessionId: "s" });
    expect(out).toMatchObject({ status: "ok", summary: "3 cards", resultCount: 3 });
  });
});
