import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSponsorsWithoutQloo, SEGMENTS_TIMEOUT_MS } from "./client";
import { COMPARE_NOTE, COMPARE_LIVE_LABEL, compareSummary, parseSponsorsCompare, pickLine, qlooLine, COMPARE_ERROR } from "./sponsorsCompare";
import { compareKey, getCompare, loadCompare, resetCompare } from "./compareStore";

afterEach(() => { vi.useRealTimers(); resetCompare(); vi.unstubAllGlobals(); });

const ok = (brands: unknown[], extra: Record<string, unknown> = {}) => ({ status: "ok", model: "gemini-x", prompt: "p", cached: false, note: "server note", qlooTop: { name: "Stüssy", fanRank: 1, cityRank: null }, brands, ...extra });

describe("copy", () => {
  it("has the honesty note verbatim and the live label", () => {
    expect(COMPARE_NOTE).toBe("Measured on Qloo's own fan ranking: this shows how far a model's memory strays from these fans' taste, not that the ranking is right.");
    expect(COMPARE_LIVE_LABEL).toBe("Live: asks Gemini once, cached after.");
  });
  it("never uses a percentage anywhere in the copy", () => {
    const all = [COMPARE_NOTE, COMPARE_LIVE_LABEL, pickLine({ name: "a", fanRank: 3, cityRank: null }), pickLine({ name: "a", fanRank: null, cityRank: null }), qlooLine({ name: "q", fanRank: 1, cityRank: 4 }), compareSummary([{ name: "a", fanRank: 14, cityRank: null }]) ?? ""];
    for (const t of all) expect(t).not.toMatch(/%|percent/i);
  });
});

describe("pickLine and qlooLine", () => {
  it("reads rank, absence and non-brands", () => {
    expect(pickLine({ name: "Nike", fanRank: 14, cityRank: null })).toBe("#14 with these fans");
    expect(pickLine({ name: "Nike", fanRank: null, cityRank: null })).toBe("not in these fans' top 20");
    expect(pickLine({ name: "Red Cross", fanRank: null, cityRank: null, nonSponsor: true })).toBe("not a brand");
  });
  it("qlooLine gives the fan rank and the city standing", () => {
    expect(qlooLine({ name: "Stüssy", fanRank: 1, cityRank: null })).toBe("fans rank it #1 · not in the city's top 20");
    expect(qlooLine({ name: "Stüssy", fanRank: 2, cityRank: 7 })).toBe("fans rank it #2 · city #7");
  });
});

describe("compareSummary", () => {
  const b = (fanRank: number | null, extra = {}) => ({ name: "x", fanRank, cityRank: null, ...extra });
  it("averages the ranked picks and counts the unranked ones", () => {
    expect(compareSummary([b(14), b(2), b(null), b(null), b(32)])).toBe("Gemini's picks average #16 with these fans; 2 of 5 aren't in their top 20.");
  });
  it("keeps one decimal only when needed", () => {
    expect(compareSummary([b(1), b(2), b(null), b(null), b(null)])).toBe("Gemini's picks average #1.5 with these fans; 3 of 5 aren't in their top 20.");
  });
  it("with no ranked pick, says only how many are outside the top 20", () => {
    expect(compareSummary([b(null), b(null), b(null), b(null), b(null)])).toBe("5 of 5 of Gemini's picks aren't in these fans' top 20.");
  });
  it("ignores non-brands in both counts and says so; no data at all gives null", () => {
    expect(compareSummary([b(10), b(null), b(null, { nonSponsor: true }), b(20), b(30)])).toBe("Gemini's picks average #20 with these fans; 1 of 4 aren't in their top 20.");
    expect(compareSummary([])).toBeNull();
    expect(compareSummary([b(null, { nonSponsor: true })])).toBeNull();
  });
});

describe("parseSponsorsCompare", () => {
  it("parses an ok answer and applies the display filter to names the gateway did not mark", () => {
    const r = parseSponsorsCompare(ok([{ name: "Nike", fanRank: 3, cityRank: 9 }, { name: "Red Cross", fanRank: null, cityRank: null }, { name: "Visa", fanRank: null, cityRank: null, nonSponsor: true }]));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.brands.map((x) => [x.name, x.fanRank, !!x.nonSponsor])).toEqual([["Nike", 3, false], ["Red Cross", null, true], ["Visa", null, true]]);
    expect(r.qlooTop).toEqual({ name: "Stüssy", fanRank: 1, cityRank: null });
  });
  it("anything malformed is the unavailable state", () => {
    expect(parseSponsorsCompare(null)).toEqual(COMPARE_ERROR);
    expect(parseSponsorsCompare({ status: "ok", brands: "x" })).toEqual(COMPARE_ERROR);
    expect(parseSponsorsCompare({ status: "unavailable", reason: "capped", message: "Comparison limit reached" })).toMatchObject({ status: "unavailable", reason: "capped" });
  });
});

describe("fetch, store, lazy", () => {
  const q = { artist: "Mac", artistId: "A", city: "Los Angeles", country: "US", cityId: "9", lat: 34, lon: -118 };
  it("calls the BFF route with the session header", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(ok([{ name: "Nike", fanRank: 3, cityRank: null }])), { status: 200 }));
    const r = await fetchSponsorsWithoutQloo(q, { fetchImpl: f as unknown as typeof fetch });
    expect(r.status).toBe("ok");
    const url = String((f.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("/api/qloo/sponsors-without-qloo?");
    expect(url).toContain("artistId=A"); expect(url).toContain("artist=Mac"); expect(url).toContain("cityId=9");
    expect(((f.mock.calls[0] as unknown[])[1] as RequestInit).headers).toHaveProperty("x-session-id");
  });
  it("504 and a hang are the timeout state after 60 s; other failures the error state", async () => {
    expect(await fetchSponsorsWithoutQloo(q, { fetchImpl: (async () => new Response("", { status: 504 })) as unknown as typeof fetch })).toMatchObject({ reason: "timeout" });
    expect(await fetchSponsorsWithoutQloo(q, { fetchImpl: (async () => { throw new Error("net"); }) as unknown as typeof fetch })).toEqual(COMPARE_ERROR);
    vi.useFakeTimers();
    const hang = vi.fn((_u: unknown, init?: RequestInit) => new Promise<Response>((_r, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("a", "AbortError")))));
    const p = fetchSponsorsWithoutQloo(q, { fetchImpl: hang as unknown as typeof fetch });
    await vi.advanceTimersByTimeAsync(SEGMENTS_TIMEOUT_MS + 1);
    expect(await p).toMatchObject({ status: "unavailable", reason: "timeout" });
  });
  it("the store keeps a good answer (one fetch) and allows a retry after an unavailable one", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "unavailable", reason: "error", message: "x" }), { status: 200 }))
      .mockResolvedValue(new Response(JSON.stringify(ok([{ name: "Nike", fanRank: 3, cityRank: null }])), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const req = { artistId: "A", artist: "Mac", city: { name: "LA", country: "US" } };
    expect(getCompare(compareKey(req.artistId, req.city)).status).toBe("idle");
    await loadCompare(req);
    await loadCompare(req);
    expect(f).toHaveBeenCalledTimes(2);
    await loadCompare(req);
    expect(f).toHaveBeenCalledTimes(2);
  });
});
