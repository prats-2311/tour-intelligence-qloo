import { describe, expect, it } from "vitest";
import { SseParser } from "./sse";

describe("SseParser", () => {
  it("parses complete events", () => {
    const p = new SseParser();
    expect(p.feed('event: resolve\ndata: {"a":1}\n\n')).toEqual([{ event: "resolve", data: '{"a":1}' }]);
  });
  it("buffers partial chunks across feeds", () => {
    const p = new SseParser();
    expect(p.feed("event: done\nda")).toEqual([]);
    expect(p.feed('ta: {}\n\nevent: x\ndata: 1\n\n')).toEqual([{ event: "done", data: "{}" }, { event: "x", data: "1" }]);
  });
  it("joins multi-line data with newlines and defaults event to message", () => {
    const p = new SseParser();
    expect(p.feed("data: a\ndata: b\n\n")).toEqual([{ event: "message", data: "a\nb" }]);
  });
  it("handles CRLF and ignores comments", () => {
    const p = new SseParser();
    expect(p.feed(": ping\r\nevent: e\r\ndata: 2\r\n\r\n")).toEqual([{ event: "e", data: "2" }]);
  });
  it("preserves unicode payloads (Review Focus 2)", () => {
    const p = new SseParser();
    expect(p.feed('event: resolve\ndata: {"name":"Beyoncé · Sigur Rós"}\n\n')[0]!.data).toContain("Beyoncé · Sigur Rós");
  });
});
