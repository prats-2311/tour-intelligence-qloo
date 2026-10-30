import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchStats, parseStats, postV2Tap, readTaps, rememberTap, STATS_OFF } from "./stats";

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

describe("stats client", () => {
  it("parses enabled:false, junk and failures as off", async () => {
    expect(parseStats("trust", { enabled: false })).toEqual(STATS_OFF);
    expect(parseStats("team", null)).toEqual(STATS_OFF);
    expect(await fetchStats("trust", { fetchImpl: vi.fn(async () => json({}, 500)) })).toEqual(STATS_OFF);
    expect(await fetchStats("trust", { fetchImpl: vi.fn(async () => { throw new Error("net"); }) })).toEqual(STATS_OFF);
  });
  it("parses trust, team and v2 defensively", () => {
    expect(parseStats("trust", { enabled: true, since: "2026-10-30T00:00:00Z", playbooks: 3, claimsChecked: "x", last24h: { playbooks: 1 } })).toMatchObject({ enabled: true, playbooks: 3, claimsChecked: 0, removedRate: null, last24h: { playbooks: 1, claimsChecked: 0 } });
    expect(parseStats("team", { enabled: true, statusCounts: { Confirmed: 2 }, notesByRole: { Manager: 4 } })).toMatchObject({ statusCounts: { Confirmed: 2, Dropped: 0 }, notesByRole: { Manager: 4 }, overridesByField: { top_zone: 0 } });
    expect(parseStats("v2", { enabled: true, byAction: { going: 2 }, byExperience: { listening: { going: 2 } } })).toMatchObject({ byAction: { going: 2, waitlist: 0, was_there: 0 }, byExperience: { listening: { going: 2, waitlist: 0, was_there: 0 } } });
  });
  it("fetches with the session header", async () => {
    const f = vi.fn(async (..._a: unknown[]) => json({ enabled: false }));
    await fetchStats("v2", { fetchImpl: f });
    expect(f.mock.calls[0]![0]).toBe("/api/qloo/stats/v2");
  });
});

describe("tap client", () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* node env without storage */ } });
  it("posts the action and experience, true only when counted", async () => {
    const f = vi.fn(async () => json({ enabled: true, ok: true }, 202));
    expect(await postV2Tap("waitlist", "listening", { fetchImpl: f })).toBe(true);
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ action: "waitlist", experience: "listening" });
    expect(await postV2Tap("going", "listening", { fetchImpl: vi.fn(async () => json({ enabled: false })) })).toBe(false);
    expect(await postV2Tap("going", "listening", { fetchImpl: vi.fn(async () => json({}, 429)) })).toBe(false);
    expect(await postV2Tap("going", "listening", { fetchImpl: vi.fn(async () => { throw new Error("x"); }) })).toBe(false);
  });
  it("reads and writes taps safely without storage", () => {
    expect(readTaps()).toEqual([]);
    expect(() => rememberTap("going")).not.toThrow();
  });
});
