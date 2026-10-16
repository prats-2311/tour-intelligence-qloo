import { describe, expect, it } from "vitest";
import { SAMPLE_QUESTIONS, sampleStrategistEvents } from "./fixtures/strategistSample";
import { strategistReducer } from "./strategistReducer";

describe("strategistReducer", () => {
  it("builds a turn from ask + events", () => {
    let s = strategistReducer({ turns: [] }, { type: "ask", question: SAMPLE_QUESTIONS[1]! });
    for (const event of sampleStrategistEvents(SAMPLE_QUESTIONS[1]!)) s = strategistReducer(s, { type: "event", event });
    const t = s.turns[0]!;
    expect(t.status).toBe("done");
    expect(t.tools.map((c) => [c.name, c.status])).toEqual([["qloo_recommend", "ok"], ["qloo_compare_audiences", "ok"]]);
    expect(t.answer?.text).toContain("Céu Aberto");
  });
  it("records errors and interruptions on the current turn only", () => {
    let s = strategistReducer({ turns: [] }, { type: "ask", question: "q" });
    s = strategistReducer(s, { type: "event", event: { type: "strategist_error", code: "CAPPED", message: "Strategist limit reached — try again tomorrow or use the showcase" } });
    expect(s.turns[0]).toMatchObject({ status: "error", error: { code: "CAPPED" } });
    s = strategistReducer(s, { type: "ask", question: "q2" });
    s = strategistReducer(s, { type: "interrupted" });
    expect(s.turns.map((t) => t.status)).toEqual(["error", "interrupted"]);
  });
  it("keeps thinking and tool args, and a later done does not override an error", () => {
    let s = strategistReducer({ turns: [] }, { type: "ask", question: "q" });
    s = strategistReducer(s, { type: "event", event: { type: "strategist_thinking", summary: "t1" } });
    s = strategistReducer(s, { type: "event", event: { type: "strategist_tool_call", id: "a", name: "x", args: { k: 1 } } });
    s = strategistReducer(s, { type: "event", event: { type: "strategist_error", code: "INTERNAL", message: "m" } });
    s = strategistReducer(s, { type: "event", event: { type: "done", summary: {} } });
    expect(s.turns[0]).toMatchObject({ status: "error", thinking: ["t1"], tools: [{ id: "a", args: { k: 1 } }] });
    expect(strategistReducer(s, { type: "reset" }).turns).toEqual([]);
  });
});
