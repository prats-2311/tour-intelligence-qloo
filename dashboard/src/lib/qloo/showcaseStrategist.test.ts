import { afterEach, describe, expect, it, vi } from "vitest";
import { SHOWCASE_STRATEGIST_NOTE, streamStrategist } from "./client";
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
  it("an unrecorded question runs live against the strategist endpoint with the example's context", async () => {
    setShowcase(parseShowcase({ ...PLACEHOLDER_SHOWCASE, strategist: REC }));
    const sse = `data: ${JSON.stringify({ type: "strategist_message", text: "Live.", unsupportedNumbers: [], stoppedEarly: false, model: "m" })}\n\ndata: ${JSON.stringify({ type: "done", summary: {} })}\n\n`;
    const fetchImpl = vi.fn(async (_url: string) => new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } }));
    const out = await collect(streamStrategist({ messages: [{ role: "user", text: "Tell me a joke" }], context: { artist: { name: "Mac DeMarco", entityId: "e" } } }, { sample: true, sampleSet: "showcase", delayMs: 0, fetchImpl: fetchImpl as unknown as typeof fetch }));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]![0])).toBe("/api/qloo/strategist");
    expect(out.map((e) => e.type)).toEqual(["strategist_message", "done"]);
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
