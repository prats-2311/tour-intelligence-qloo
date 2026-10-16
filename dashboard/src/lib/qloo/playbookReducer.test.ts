import { describe, expect, it } from "vitest";
import { initialPlaybook, playbookReducer } from "./playbookReducer";
import { samplePlaybookEvents } from "./fixtures/lumenValePlaybooks";

describe("playbookReducer", () => {
  it("collects cards and narrative and ends done", () => {
    let s = playbookReducer(initialPlaybook, { type: "start", source: "sample" });
    for (const event of samplePlaybookEvents("4005539")!) s = playbookReducer(s, { type: "event", event });
    expect(s.status).toBe("done");
    expect(s.cards).toHaveLength(7);
    expect(s.narrative?.status).toBe("ok");
    expect(s.log.filter((e) => e.type === "tool_call").length).toBeGreaterThan(0);
  });
  it("keeps cards already received when an error arrives", () => {
    let s = playbookReducer(initialPlaybook, { type: "start", source: "live" });
    const ev = samplePlaybookEvents("4005539")!;
    s = playbookReducer(s, { type: "event", event: ev.find((e) => e.type === "playbook")! });
    s = playbookReducer(s, { type: "event", event: { type: "error", code: "BUDGET", message: "Session limit reached" } });
    expect(s).toMatchObject({ status: "error", error: { code: "BUDGET" } });
    expect(s.cards).toHaveLength(7);
  });
  it("interrupted only applies while streaming", () => {
    const done = { ...initialPlaybook, status: "done" as const };
    expect(playbookReducer(done, { type: "interrupted" }).status).toBe("done");
    expect(playbookReducer({ ...initialPlaybook, status: "streaming" }, { type: "interrupted" }).status).toBe("interrupted");
  });
});
