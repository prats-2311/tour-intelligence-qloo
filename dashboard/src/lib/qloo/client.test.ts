import { describe, expect, it, vi } from "vitest";
import { callQlooTool, streamTourBoard } from "./client";
import { LONG_NAMES_SAMPLE, LUMEN_VALE_SAMPLE, SAMPLE_BRIEF } from "./fixtures/lumenVale";

function sseResponse(chunks: string[], status = 200) {
  const body = new ReadableStream<Uint8Array>({
    start(c) { const enc = new TextEncoder(); chunks.forEach((x) => c.enqueue(enc.encode(x))); c.close(); },
  });
  return new Response(body, { status, headers: { "content-type": "text/event-stream" } });
}

describe("streamTourBoard", () => {
  it("posts the brief with a session id and yields parsed events", async () => {
    const fetchImpl = vi.fn(async () => sseResponse(['event: resolve\ndata: {"type":"resolve","entity":{"entityId":"A","name":"X"}}\n\n', 'event: done\ndata: {"type":"done","summary":{}}\n\n']));
    const out = [];
    for await (const e of streamTourBoard(SAMPLE_BRIEF, { fetchImpl: fetchImpl as unknown as typeof fetch })) out.push(e.type);
    expect(out).toEqual(["resolve", "done"]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/qloo/tour-board");
    expect((init.headers as Record<string, string>)["x-session-id"]).toBeTruthy();
    expect(JSON.parse(String(init.body))).toMatchObject({ artist: "Lumen Vale", regions: ["Mexico", "Brazil", "United States"] });
  });
  it("turns a non-OK response into a single error event", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "artist, regions[1-6], maxStops[1-20] required" }), { status: 400 }));
    const out = [];
    for await (const e of streamTourBoard(SAMPLE_BRIEF, { fetchImpl: fetchImpl as unknown as typeof fetch })) out.push(e);
    expect(out).toEqual([{ type: "error", code: "HTTP_400", message: "artist, regions[1-6], maxStops[1-20] required" }]);
  });
  it("sample mode yields the labelled fixture without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const types = [];
    for await (const e of streamTourBoard(SAMPLE_BRIEF, { fetchImpl: fetchImpl as unknown as typeof fetch, sample: true, delayMs: 0 })) types.push(e.type);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(types.at(-1)).toBe("done");
    expect(types.filter((t) => t === "city_scored")).toHaveLength(10);
  });
  it("sampleSet 'long' yields the long-names fixture; default yields the standard one", async () => {
    const names = async (sampleSet?: "default" | "long") => {
      const out: string[] = [];
      for await (const e of streamTourBoard(SAMPLE_BRIEF, { sample: true, sampleSet, delayMs: 0 })) if (e.type === "city_scored") out.push(e.city.name);
      return out;
    };
    expect(await names()).toContain("Mexico City");
    expect(await names("default")).toContain("Los Angeles");
    const long = await names("long");
    expect(long).toHaveLength(10);
    expect(long).toEqual(expect.arrayContaining(["Santiago de Querétaro", "Los Angeles–Long Beach", "San Juan de los Lagos"]));
    expect(long).not.toContain("Monterrey");
  });
  it("LONG_NAMES_SAMPLE keeps coordinates and scores, renames the artist", () => {
    const scored = (evs: typeof LUMEN_VALE_SAMPLE) => evs.flatMap((e) => (e.type === "city_scored" ? [e.city] : []));
    const a = scored(LUMEN_VALE_SAMPLE), b = scored(LONG_NAMES_SAMPLE);
    expect(b.map((c) => [c.lat, c.lon, c.winnability.value])).toEqual(a.map((c) => [c.lat, c.lon, c.winnability.value]));
    const resolve = LONG_NAMES_SAMPLE.find((e) => e.type === "resolve");
    expect(resolve && resolve.type === "resolve" && resolve.entity.name).toBe("Lumen Vale & The Extraordinarily Long Orchestra");
  });
  it("skips malformed JSON payloads instead of throwing", async () => {
    const fetchImpl = vi.fn(async () => sseResponse(["event: resolve\ndata: {not json\n\n", 'event: done\ndata: {"type":"done","summary":{}}\n\n']));
    const out = [];
    for await (const e of streamTourBoard(SAMPLE_BRIEF, { fetchImpl: fetchImpl as unknown as typeof fetch })) out.push(e.type);
    expect(out).toEqual(["done"]);
  });
  it("keeps multi-byte characters intact when bytes split across chunks", async () => {
    const bytes = new TextEncoder().encode('event: resolve\ndata: {"type":"resolve","entity":{"entityId":"A","name":"Beyoncé 🎤"}}\n\n');
    const cut = bytes.indexOf(0xc3) + 1; // mid-"é"
    const cut2 = bytes.indexOf(0xf0) + 2; // mid-emoji
    const parts = [bytes.slice(0, cut), bytes.slice(cut, cut2), bytes.slice(cut2)];
    const body = new ReadableStream<Uint8Array>({ start(c) { parts.forEach((x) => c.enqueue(x)); c.close(); } });
    const fetchImpl = vi.fn(async () => new Response(body, { status: 200 }));
    const out = [];
    for await (const e of streamTourBoard(SAMPLE_BRIEF, { fetchImpl: fetchImpl as unknown as typeof fetch })) out.push(e);
    expect(out[0]).toMatchObject({ type: "resolve", entity: { name: "Beyoncé 🎤" } });
  });
});

describe("callQlooTool", () => {
  const ff = (r: Response) => vi.fn(async () => r) as unknown as typeof fetch;
  it("returns the envelope on success", async () => {
    const r = await callQlooTool("qloo_compare_audiences", { group_a: ["A"], group_b: ["B"] }, { fetchImpl: ff(new Response(JSON.stringify({ envelope: { status: "ok" }, cached: true }), { status: 200 })) });
    expect(r).toEqual({ envelope: { status: "ok" }, cached: true, stale: false });
  });
  it("throws the JSON error message on a non-OK JSON response", async () => {
    await expect(callQlooTool("qloo_compare_audiences", {}, { fetchImpl: ff(new Response(JSON.stringify({ error: "Unknown tool" }), { status: 404 })) })).rejects.toThrow("Unknown tool");
  });
  it("throws 'Qloo gateway unavailable' on a non-OK non-JSON body", async () => {
    await expect(callQlooTool("qloo_compare_audiences", {}, { fetchImpl: ff(new Response("<html>502 Bad Gateway</html>", { status: 502 })) })).rejects.toThrow("Qloo gateway unavailable");
  });
  it("throws 'Qloo gateway unavailable' on an OK non-JSON body", async () => {
    await expect(callQlooTool("qloo_compare_audiences", {}, { fetchImpl: ff(new Response("not json", { status: 200 })) })).rejects.toThrow("Qloo gateway unavailable");
  });
});
