import { describe, expect, it } from "vitest";
import { parseShowcase } from "./showcase";

// The recorder is a plain .mjs script; load it by variable path so tsc does not type-check it.
const SCRIPT = "../../../scripts/record-showcase.mjs";
const SYNTH = "../../../scripts/make-synthetic-recording.mjs";
const rec = (await import(/* @vite-ignore */ SCRIPT)) as {
  parseArgs(argv: string[]): { questions?: string[] };
  strategistContext(boardEvents: unknown[], brief: { regions: string[] }): Record<string, unknown>;
  record(o: Record<string, unknown>): Promise<{ strategist?: Array<{ question: string; events: Array<{ type: string }> }> }>;
};
const synth = (await import(/* @vite-ignore */ SYNTH)) as { makeSynthetic(input: unknown, kind: string): { strategist?: unknown[] } };

const BASE = ["--artist", "A", "--regions", "X", "--out", "o.json"];
const city = (n: number) => ({ id: `c${n}`, name: `City ${n}`, country: "ZZ", verdict: "play", lat: 1, lon: 2, fanHeat: { value: n, refs: [] }, activation: { value: n + 1, refs: [] }, winnability: { value: n + 2, refs: [] } });
const sse = (events: unknown[]) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), { status: 200 });

describe("record-showcase --questions", () => {
  it("parses Q1|Q2, trims, drops blanks, and is absent by default", () => {
    expect(rec.parseArgs(BASE).questions).toBeUndefined();
    expect(rec.parseArgs([...BASE, "--questions", " One? | Two? ||"]).questions).toEqual(["One?", "Two?"]);
  });
  it("builds the context exactly like the dashboard's TourBoardProvider", () => {
    const events = [{ type: "resolve", entity: { entityId: "e1", name: "A", popularity: 0.5 } }, ...Array.from({ length: 22 }, (_, i) => ({ type: "city_scored", city: city(i) })), { type: "done", summary: {} }];
    const ctx = rec.strategistContext(events, { regions: ["X"] }) as { artist: unknown; regions: string[]; cities: Array<Record<string, unknown>> };
    expect(ctx.artist).toEqual({ name: "A", entityId: "e1" });
    expect(ctx.regions).toEqual(["X"]);
    expect(ctx.cities).toHaveLength(20);
    expect(ctx.cities[1]).toEqual({ id: "c1", name: "City 1", country: "ZZ", verdict: "play", fanHeat: 1, activation: 2, winnability: 3 });
  });
  it("posts each question to /v1/strategist in its own -ask-n session and stores the events", async () => {
    const calls: Array<{ url: string; session: string; body?: { messages: unknown; context: { cities: unknown[] } } }> = [];
    const board = [{ type: "resolve", entity: { entityId: "e1", name: "A" } }, { type: "city_scored", city: city(1) }, { type: "done", summary: {} }];
    const answer = (t: string) => [{ type: "strategist_thinking", summary: "s" }, { type: "strategist_message", text: t, unsupportedNumbers: [], stoppedEarly: false, model: "m" }, { type: "done", summary: {} }];
    const fetchImpl = async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      calls.push({ url, session: headers["x-session-id"]!, body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (url.endsWith("/v1/tour-board")) return sse(board);
      if (url.endsWith("/v1/without-qloo")) return new Response(JSON.stringify({ status: "unavailable", reason: "error", message: "m" }));
      if (url.endsWith("/v1/strategist")) return sse(answer(`reply ${calls.filter((c) => c.url.endsWith("/v1/strategist")).length}`));
      return sse([{ type: "done", summary: {} }]);
    };
    const out = await rec.record({ artist: "A", regions: ["X"], maxPlaybooks: 0, questions: ["Q one?", "Q two?"], gatewayUrl: "https://g", token: "t", fetchImpl, sessionId: "sess", warn: () => {} });
    const asks = calls.filter((c) => c.url.endsWith("/v1/strategist"));
    expect(asks.map((c) => c.session)).toEqual(["sess-ask-1", "sess-ask-2"]);
    expect(asks[0]!.body!.messages).toEqual([{ role: "user", text: "Q one?" }]);
    expect(asks[0]!.body!.context.cities).toHaveLength(1);
    expect(out.strategist!.map((s) => s.question)).toEqual(["Q one?", "Q two?"]);
    expect(out.strategist![0]!.events.map((e) => e.type)).toEqual(["strategist_thinking", "strategist_message", "done"]);
    // The private JSON round-trips through the dashboard parser.
    expect(parseShowcase(out).strategist).toHaveLength(2);
  });
  it("leaves out a question whose stream gave no answer, and records none without --questions", async () => {
    const fetchImpl = async (url: string) => {
      if (url.endsWith("/v1/tour-board")) return sse([{ type: "resolve", entity: { entityId: "e1", name: "A" } }, { type: "done", summary: {} }]);
      if (url.endsWith("/v1/without-qloo")) return new Response(JSON.stringify({ status: "unavailable", reason: "error", message: "m" }));
      if (url.endsWith("/v1/strategist")) return sse([{ type: "strategist_error", code: "UNAVAILABLE", message: "x" }, { type: "done", summary: {} }]);
      return sse([]);
    };
    const warns: string[] = [];
    const base = { artist: "A", regions: ["X"], maxPlaybooks: 0, gatewayUrl: "https://g", token: "t", fetchImpl, sessionId: "s", warn: (m: string) => warns.push(m) };
    expect((await rec.record({ ...base, questions: ["Q?"] })).strategist).toEqual([]);
    expect(warns.join()).toContain("Q?");
    expect((await rec.record(base)).strategist).toBeUndefined();
  });
});

describe("synthetic strategist section", () => {
  it("adds invented Q&As with a reasoning summary, tool lines and an answer, once", () => {
    const src = { recordedAt: "2026-10-16T00:00:00.000Z", artist: "Real Artist", brief: { artist: "Real Artist", regions: [], maxStops: 8 }, boardEvents: [{ type: "done", summary: {} }], playbooks: {}, thisWeek: {} };
    const out = synth.makeSynthetic(src, "showcase");
    const s = parseShowcase(out).strategist;
    expect(s).toHaveLength(2);
    const types = s[0]!.events.map((e) => e.type);
    expect(types).toContain("strategist_thinking");
    expect(types).toContain("strategist_tool_result");
    expect(types).toContain("strategist_message");
    expect(types.at(-1)).toBe("done");
    expect(JSON.stringify(out.strategist)).not.toMatch(/Real Artist/);
    expect(synth.makeSynthetic(out, "showcase").strategist).toEqual(out.strategist);
  });
});
