import { afterEach, describe, expect, it, vi } from "vitest";
import { SHOWCASE_ASK_NOTE, SHOWCASE_STRATEGIST_NOTE, streamStrategist } from "./client";
import { PLACEHOLDER_SHOWCASE } from "./placeholderShowcase";
import { normaliseQuestion, parseShowcase, recordedQuestion, SHOWCASE, setShowcase, showcaseStrategist } from "./showcase";
import type { GatewayEvent } from "./types";

const collect = async (g: AsyncGenerator<GatewayEvent>) => { const out: GatewayEvent[] = []; for await (const e of g) out.push(e); return out; };
const EVENTS: GatewayEvent[] = [
  { type: "strategist_thinking", summary: "Invented reasoning." },
  { type: "strategist_tool_call", id: "a", name: "get_city_playbook", args: { city: "X" } },
  { type: "strategist_tool_result", id: "a", name: "get_city_playbook", status: "ok", summary: "3 cards", cached: false },
  { type: "strategist_message", text: "Invented answer.", unsupportedNumbers: [], stoppedEarly: false, model: "m" },
  { type: "done", summary: {} },
];
const REC = [{ question: "Why does Los Angeles rank above São Paulo here?", events: EVENTS }];
const original = SHOWCASE;
afterEach(() => setShowcase(original));

describe("parseShowcase strategist key", () => {
  it("is empty without the key and for malformed input", () => {
    expect(parseShowcase(PLACEHOLDER_SHOWCASE).strategist).toEqual([]);
    expect(parseShowcase({ strategist: "x" }).strategist).toEqual([]);
    expect(parseShowcase({ strategist: [{ question: "", events: EVENTS }, { question: "q", events: "no" }, null] }).strategist).toEqual([]);
  });
  it("keeps valid recordings and drops unknown events", () => {
    const s = parseShowcase({ strategist: [{ question: "Q?", events: [...EVENTS, { type: "bogus" }] }] }).strategist;
    expect(s).toHaveLength(1);
    expect(s[0]!.question).toBe("Q?");
    expect(s[0]!.events).toEqual(EVENTS);
  });
});

describe("question matching", () => {
  it("normalises case, punctuation and spacing but keeps letters", () => {
    expect(normaliseQuestion("  Why does Los Angeles  RANK above São Paulo here? ")).toBe(normaliseQuestion("why does los angeles rank above são paulo here"));
    expect(normaliseQuestion("São Paulo")).not.toBe(normaliseQuestion("Sao Paulo"));
  });
  it("finds a recorded question by its normalised text", () => {
    setShowcase(parseShowcase({ ...PLACEHOLDER_SHOWCASE, strategist: REC }));
    expect(recordedQuestion("why does LOS ANGELES rank above são paulo here")?.question).toBe(REC[0]!.question);
    expect(recordedQuestion("something else")).toBeNull();
    expect(showcaseStrategist().map((r) => r.question)).toEqual([REC[0]!.question]);
  });
});

describe("streamStrategist in the showcase", () => {
  it("replays the recorded events for a matching question with no fetch", async () => {
    setShowcase(parseShowcase({ ...PLACEHOLDER_SHOWCASE, strategist: REC }));
    const fetchImpl = vi.fn();
    const out = await collect(streamStrategist({ messages: [{ role: "user", text: "Why does Los Angeles rank above São Paulo here?" }], context: {} }, { sample: true, sampleSet: "showcase", delayMs: 0, fetchImpl: fetchImpl as unknown as typeof fetch }));
    expect(out).toEqual(EVENTS);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("an unrecorded question gets the replay note", async () => {
    setShowcase(parseShowcase({ ...PLACEHOLDER_SHOWCASE, strategist: REC }));
    const out = await collect(streamStrategist({ messages: [{ role: "user", text: "Tell me a joke" }], context: {} }, { sample: true, sampleSet: "showcase", delayMs: 0 }));
    expect(out[0]).toEqual({ type: "strategist_error", code: "UNAVAILABLE", message: SHOWCASE_ASK_NOTE });
    expect(SHOWCASE_ASK_NOTE).toBe("This example can replay the two recorded questions. Try your own artist to ask anything.");
  });
  it("without a strategist key the existing note stays", async () => {
    const out = await collect(streamStrategist({ messages: [{ role: "user", text: "anything" }], context: {} }, { sample: true, sampleSet: "showcase", delayMs: 0 }));
    expect(out[0]).toEqual({ type: "strategist_error", code: "UNAVAILABLE", message: SHOWCASE_STRATEGIST_NOTE });
  });
  it("a recording without done still ends with done", async () => {
    setShowcase(parseShowcase({ ...PLACEHOLDER_SHOWCASE, strategist: [{ question: "Q?", events: EVENTS.slice(0, 4) }] }));
    const out = await collect(streamStrategist({ messages: [{ role: "user", text: "Q?" }], context: {} }, { sample: true, sampleSet: "showcase", delayMs: 0 }));
    expect(out.at(-1)?.type).toBe("done");
  });
});
