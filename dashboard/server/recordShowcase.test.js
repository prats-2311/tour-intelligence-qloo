import { describe, expect, it } from "vitest";
import { parseArgs, record, sanitizeEvent, summarize } from "../scripts/record-showcase.mjs";

const TOKEN = "ya29.SECRET-TOKEN-VALUE";
const sse = (events) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
const city = (id, name, fan, win, verdict) => ({
  id, name, country: "MX", lat: 0, lon: 0, verdict, zones: [], warnings: [],
  fanHeat: { value: fan, refs: [] }, activation: { value: 50, refs: [], components: {} }, winnability: { value: win, refs: [] },
});
const BOARD = [
  { type: "tool_call", tool: "qloo_where_popular", args: { within: "Mexico", secret: "x", nested: { a: 1 } }, cached: false },
  { type: "tool_result", tool: "qloo_where_popular", status: "ok", resultCount: 3, cacheKey: "k", stale: false },
  { type: "resolve", entity: { entityId: "E1", name: "Test Artist" } },
  { type: "city_scored", city: city("1", "Alpha", 90, 60, "play") },
  { type: "city_scored", city: city("2", "Beta", 40, 80, "hidden_goldmine") },
  { type: "city_scored", city: city("3", "Gamma", 30, 20, "skip") },
  { type: "done", summary: {} },
];

function mockFetch(calls, { onWithoutQloo, withoutQlooStatus } = {}) {
  return async (url, init) => {
    calls.push({ url: String(url), init });
    const u = new URL(String(url));
    const body = (text, status = 200) => new Response(text, { status, headers: { "content-type": "text/event-stream" } });
    if (u.pathname === "/v1/tour-board") return body(sse(BOARD));
    if (u.pathname === "/v1/city-playbook") return body(sse([{ type: "tool_call", tool: "qloo_recommend", args: { target_type: "brand", signal_location: "x", junk: 1 }, cached: true }, { type: "done", summary: {} }]));
    if (u.pathname === "/v1/without-qloo") {
      if (withoutQlooStatus) return new Response("err", { status: withoutQlooStatus });
      const reqBody = JSON.parse(init.body);
      return new Response(JSON.stringify(onWithoutQloo ? onWithoutQloo(reqBody) : { status: "ok", ranked: reqBody.cities, model: "m", cached: false }), { status: 200 });
    }
    if (u.pathname === "/v1/this-week") return new Response(JSON.stringify({ status: "ok", items: [] }), { status: 200 });
    return new Response("nope", { status: 404 });
  };
}

describe("record-showcase", () => {
  it("parses the CLI", () => {
    expect(parseArgs(["--artist", "A B", "--regions", "Mexico, Brazil", "--out", "o.json", "--window", "2027-03-12:2027-04-18"]))
      .toEqual({ artist: "A B", regions: ["Mexico", "Brazil"], out: "o.json", window: { start: "2027-03-12", end: "2027-04-18" }, maxPlaybooks: 4 });
    expect(() => parseArgs(["--artist", "A"])).toThrow(/--regions/);
  });

  it("writes the expected shape and calls the dashboard's routes with auth and session headers", async () => {
    const calls = [];
    const out = await record({ artist: "Test Artist", regions: ["Mexico"], window: { start: "2027-03-12", end: "2027-04-18" }, maxPlaybooks: 4, gatewayUrl: "https://gw.example", token: TOKEN, fetchImpl: mockFetch(calls), now: new Date("2026-10-16T10:00:00Z") });
    expect(Object.keys(out).sort()).toEqual(["artist", "boardEvents", "brief", "playbooks", "recordedAt", "thisWeek", "withoutQloo"]);
    expect(out.recordedAt).toBe("2026-10-16T10:00:00.000Z");
    expect(out.brief).toEqual({ artist: "Test Artist", regions: ["Mexico"], maxStops: 8, dateWindow: { start: "2027-03-12", end: "2027-04-18" } });
    expect(out.boardEvents).toHaveLength(BOARD.length);
    expect(Object.keys(out.playbooks).sort()).toEqual(["1", "2"]); // skip excluded
    expect(Object.keys(out.thisWeek).sort()).toEqual(["1", "2"]);
    const order = calls.filter((c) => c.url.includes("/v1/city-playbook")).map((c) => new URL(c.url).searchParams.get("city"));
    expect(order).toEqual(["Beta", "Alpha"]); // hidden goldmine first
    const pb = calls.find((c) => c.url.includes("/v1/city-playbook"));
    const q = new URL(pb.url).searchParams;
    expect([q.get("artist"), q.get("artistEntityId"), q.get("city"), q.get("country")]).toEqual(["Test Artist", "E1", "Beta", "MX"]);
    expect(pb.init.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(pb.init.headers["x-session-id"]).toMatch(/^showcase-2026-10-16-test-artist-[a-z0-9]{6}$/);
    expect(new URL(calls.find((c) => c.url.includes("/v1/this-week")).url).searchParams.get("start")).toBe("2027-03-12");
  });

  it("records the generic ranking after the board", async () => {
    const bodies = [];
    const calls = [];
    const fetchImpl = mockFetch(calls, { onWithoutQloo: (b) => { bodies.push(b); return { status: "ok", ranked: b.cities.slice().reverse(), model: "gemini-x", cached: false }; } });
    const out = await record({ artist: "Test Artist", regions: ["Mexico"], maxPlaybooks: 4, gatewayUrl: "https://gw.example", token: TOKEN, fetchImpl, now: new Date("2026-10-18T00:00:00Z"), sessionId: "s" });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({ artist: "Test Artist", regions: ["Mexico"], cities: [{ name: "Alpha", country: "MX" }, { name: "Beta", country: "MX" }, { name: "Gamma", country: "MX" }] });
    expect(out.withoutQloo.status).toBe("ok");
    const paths = calls.map((c) => new URL(c.url).pathname);
    expect(paths.indexOf("/v1/without-qloo")).toBeGreaterThan(paths.indexOf("/v1/tour-board"));
  });

  it("keeps recording when the generic ranking fails", async () => {
    const warnings = [];
    const out = await record({ artist: "Test Artist", regions: ["Mexico"], maxPlaybooks: 4, gatewayUrl: "https://gw.example", token: TOKEN, fetchImpl: mockFetch([], { withoutQlooStatus: 503 }), warn: (m) => warnings.push(m) });
    expect(out.withoutQloo).toEqual({ status: "unavailable", reason: "error", message: "Generic ranking unavailable" });
    expect(warnings).toHaveLength(1);
    expect(Object.keys(out.playbooks)).toHaveLength(2);
  });

  it("caps playbooks and skips this-week without a window", async () => {
    const calls = [];
    const out = await record({ artist: "Test Artist", regions: ["Mexico"], maxPlaybooks: 1, gatewayUrl: "https://gw.example", token: TOKEN, fetchImpl: mockFetch(calls) });
    expect(Object.keys(out.playbooks)).toEqual(["2"]);
    expect(out.thisWeek).toEqual({});
    expect(calls.some((c) => c.url.includes("/v1/this-week"))).toBe(false);
  });

  it("strips tool_call args to the keys the UI shows and never carries the token", async () => {
    const out = await record({ artist: "Test Artist", regions: ["Mexico"], maxPlaybooks: 4, gatewayUrl: "https://gw.example", token: TOKEN, fetchImpl: mockFetch([]) });
    expect(out.boardEvents[0].args).toEqual({ within: "Mexico" });
    expect(out.playbooks["1"][0].args).toEqual({ target_type: "brand", signal_location: "x" });
    expect(JSON.stringify(out)).not.toContain(TOKEN);
    expect(sanitizeEvent({ type: "tool_call", tool: "t", args: { entity: "A", token: TOKEN }, cached: false }).args).toEqual({ entity: "A" });
  });

  it("fails with the status only, never echoing the token", async () => {
    const fetchImpl = async () => new Response(`bad ${TOKEN}`, { status: 403 });
    const err = await record({ artist: "A", regions: ["Mexico"], maxPlaybooks: 4, gatewayUrl: "https://gw.example", token: TOKEN, fetchImpl }).catch((e) => e);
    expect(err.message).toContain("403");
    expect(err.message).not.toContain(TOKEN);
  });

  it("refuses a board with no resolved artist", async () => {
    const fetchImpl = async () => new Response(sse([{ type: "needs_input", field: "artist", candidates: [], summary: "pick" }]), { status: 200 });
    await expect(record({ artist: "A", regions: ["Mexico"], maxPlaybooks: 4, gatewayUrl: "https://gw.example", token: TOKEN, fetchImpl })).rejects.toThrow(/resolve/);
  });

  it("summarises density vs winnability ranks", async () => {
    const out = await record({ artist: "Test Artist", regions: ["Mexico"], maxPlaybooks: 4, gatewayUrl: "https://gw.example", token: TOKEN, fetchImpl: mockFetch([]) });
    const text = summarize(out);
    expect(text).toContain("Beta");
    expect(text).toMatch(/Beta.*hidden_goldmine.*density #2.*winnability #1/);
  });

  it("passes a scoring event through unchanged", () => {
    const e = { type: "scoring", scoring: { version: "v" } };
    expect(sanitizeEvent(e)).toEqual(e);
  });

  it("keeps signals, arrays and plain objects but drops anything secret-looking", () => {
    const e = sanitizeEvent({ type: "tool_call", tool: "qloo_recommend", cached: false, args: {
      signals: { location: "Mexico City, MX", weight: 2, apiKey: "k", auth_token: "t", nested: { a: 1 } },
      entity: ["A", "B"], within: ["x", 3], query: { text: "dream pop", secret: "s", token: TOKEN }, token: TOKEN, authorization: TOKEN,
    } });
    expect(e.args).toEqual({ signals: { location: "Mexico City, MX", weight: 2 }, entity: ["A", "B"], query: { text: "dream pop" } });
    expect(JSON.stringify(e)).not.toContain(TOKEN);
  });

  it("leaves out a playbook that never finished or ended in an error, and warns", async () => {
    const warnings = [];
    const bad = { 1: [{ type: "tool_call", tool: "t", args: {}, cached: false }], 2: [{ type: "playbook", playbook: {} }, { type: "done", summary: {} }, { type: "error", code: "X", message: "m" }] };
    const base = mockFetch([]);
    const fetchImpl = async (url, init) => {
      const u = new URL(String(url));
      if (u.pathname !== "/v1/city-playbook") return base(url, init);
      return new Response(sse(bad[u.searchParams.get("city") === "Alpha" ? 1 : 2]), { status: 200 });
    };
    const out = await record({ artist: "Test Artist", regions: ["Mexico"], maxPlaybooks: 4, gatewayUrl: "https://gw.example", token: TOKEN, fetchImpl, warn: (m) => warnings.push(m) });
    expect(out.playbooks).toEqual({});
    expect(warnings).toHaveLength(2);
  });

  describe("session id", () => {
    const run = async (artist, extra = {}) => {
      const calls = [];
      await record({ artist, regions: ["Mexico"], maxPlaybooks: 1, gatewayUrl: "https://gw.example", token: TOKEN, fetchImpl: mockFetch(calls), now: new Date("2026-10-16T10:00:00Z"), ...extra });
      return calls[0].init.headers["x-session-id"];
    };

    it("is unique per record() call even with the same day and artist", async () => {
      const a = await run("Test Artist");
      const b = await run("Test Artist");
      expect(a).not.toBe(b);
    });

    it("is readable, well-formed and at most 128 chars for a very long artist name", async () => {
      const id = await run("Ä ".repeat(100) + "x".repeat(200));
      expect(id).toMatch(/^showcase-\d{4}-\d{2}-\d{2}-[a-z0-9-]+-[a-z0-9]{6}$/);
      expect(id.length).toBeLessThanOrEqual(128);
      expect((await run("Test Artist!!")).startsWith("showcase-2026-10-16-test-artist-")).toBe(true);
    });

    it("uses an injected sessionId as given", async () => {
      expect(await run("Test Artist", { sessionId: "pinned-123" })).toBe("pinned-123");
    });
  });
});
