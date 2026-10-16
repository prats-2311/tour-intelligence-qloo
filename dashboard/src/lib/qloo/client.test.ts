import { describe, expect, it, vi } from "vitest";
import { callQlooTool, fetchThisWeek, streamCityPlaybook, streamTourBoard } from "./client";
import type { GatewayEvent } from "./types";
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

describe("streamCityPlaybook sample mode and fetchThisWeek", () => {
  it("streamCityPlaybook in sample mode replays the city's fixture and never fetches", async () => {
    const fetchImpl = vi.fn();
    const out: GatewayEvent[] = [];
    for await (const e of streamCityPlaybook({ artist: "Lumen Vale", artistEntityId: "sample-lumen-vale", city: "Guadalajara", country: "MX" }, { sample: true, cityId: "4005539", delayMs: 0, fetchImpl })) out.push(e);
    expect(out.at(-1)?.type).toBe("done");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("streamCityPlaybook in sample mode for a city without a sample ends with NO_SAMPLE", async () => {
    const out: GatewayEvent[] = [];
    for await (const e of streamCityPlaybook({ artist: "Lumen Vale", artistEntityId: "sample-lumen-vale", city: "Chicago", country: "US" }, { sample: true, cityId: "4887398", delayMs: 0 })) out.push(e);
    expect(out).toEqual([{ type: "error", code: "NO_SAMPLE", message: "No sample playbook for Chicago" }]);
  });
  it("fetchThisWeek without a window is unavailable with no_window and makes no request", async () => {
    const fetchImpl = vi.fn();
    expect(await fetchThisWeek({ city: "Guadalajara", country: "MX" }, { fetchImpl })).toEqual({ status: "unavailable", reason: "no_window", message: "Add a date window to the brief to check this week in the city" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("fetchThisWeek calls the BFF with the window and session header", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status: "unavailable", reason: "capped", message: "m" }), { status: 200, headers: { "content-type": "application/json" } }));
    await fetchThisWeek({ city: "Guadalajara", country: "MX", window: { start: "2027-03-12", end: "2027-04-18" } }, { fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("/api/qloo/this-week?city=Guadalajara&country=MX&start=2027-03-12&end=2027-04-18");
    expect((init.headers as Record<string, string>)["x-session-id"]).toBeTruthy();
  });
  it("fetchThisWeek maps a non-JSON or failed response to unavailable error", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>", { status: 502 }));
    expect(await fetchThisWeek({ city: "G", country: "MX", window: { start: "2027-03-12", end: "2027-04-18" } }, { fetchImpl }))
      .toEqual({ status: "unavailable", reason: "error", message: "Live web context unavailable — search failed" });
  });
  it("fetchThisWeek maps a 400 to a window-too-long unavailable state", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "bad" }), { status: 400 }));
    expect(await fetchThisWeek({ city: "G", country: "MX", window: { start: "2027-01-01", end: "2027-06-01" } }, { fetchImpl }))
      .toEqual({ status: "unavailable", reason: "error", message: "Date window too long (max 62 days)" });
  });
  it("fetchThisWeek in sample mode returns the fixture", async () => {
    expect((await fetchThisWeek({ city: "Guadalajara", country: "MX", window: { start: "2027-03-12", end: "2027-04-18" } }, { sample: true, cityId: "4005539" })).status).toBe("ok");
  });
});
