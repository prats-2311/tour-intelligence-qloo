import { describe, expect, it } from "vitest";
import { strategistReducer, type StrategistTurn } from "./strategistReducer";
import { stageLabel } from "./strategistStage";

const turn = (p: Partial<StrategistTurn> = {}): StrategistTurn => ({ question: "q", thinking: [], tools: [], status: "streaming", ...p });

describe("stageLabel", () => {
  it("starts with reading the question", () => { expect(stageLabel(turn())).toBe("Reading the question…"); });
  it("names the running tool and the city", () => {
    expect(stageLabel(turn({ tools: [{ id: "t1", name: "get_city_playbook", args: { city: "Los Angeles", country: "US" } }] }))).toBe("Looking up Playbook for Los Angeles…");
    expect(stageLabel(turn({ tools: [{ id: "t1", name: "qloo_where_popular", args: { within: "Lima, PE" } }] }))).toBe("Looking up Qloo · where popular for Lima…");
    expect(stageLabel(turn({ tools: [{ id: "t1", name: "qloo_trends", args: {} }] }))).toBe("Looking up Qloo · trends…");
  });
  it("says writing once the gateway reports it", () => {
    expect(stageLabel(turn({ stage: "writing", tools: [{ id: "t1", name: "qloo_trends", args: {}, status: "ok" }] }))).toBe("Writing the answer…");
  });
  it("after finished tools and before a stage event keeps the last honest state", () => {
    expect(stageLabel(turn({ tools: [{ id: "t1", name: "qloo_trends", args: {}, status: "ok" }] }))).toBe("Writing the answer…");
  });
});

describe("reducer stage", () => {
  it("tracks strategist_stage and carries redactedSentences onto the answer", () => {
    let s = strategistReducer({ turns: [] }, { type: "ask", question: "q" });
    s = strategistReducer(s, { type: "event", event: { type: "strategist_stage", stage: "writing" } });
    expect(s.turns[0]!.stage).toBe("writing");
    s = strategistReducer(s, { type: "event", event: { type: "strategist_message", text: "x", unsupportedNumbers: [], stoppedEarly: false, model: "m", redactedSentences: 2 } });
    expect(s.turns[0]!.answer!.redactedSentences).toBe(2);
  });
});
