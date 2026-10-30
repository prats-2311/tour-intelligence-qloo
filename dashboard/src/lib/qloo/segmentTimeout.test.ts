import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSponsorSegments, SEGMENTS_TIMEOUT_MS } from "./client";
import { loadSegments, getSegments, resetSegments, segmentKey } from "./segmentStore";

afterEach(() => { vi.useRealTimers(); resetSegments(); });

const hanging = () => vi.fn((_u: unknown, init?: RequestInit) => new Promise<Response>((_res, rej) => {
  init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
}));
const q = { artistId: "A", city: "Los Angeles", country: "US" };

describe("sponsor segments timeout", () => {
  it("aborts after 60 s and answers unavailable/timeout with the retry copy", async () => {
    vi.useFakeTimers();
    const f = hanging();
    const p = fetchSponsorSegments(q, { fetchImpl: f as unknown as typeof fetch });
    await vi.advanceTimersByTimeAsync(SEGMENTS_TIMEOUT_MS - 1);
    let done = false; void p.then(() => { done = true; });
    await Promise.resolve();
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    const r = await p;
    expect(r).toMatchObject({ status: "unavailable", reason: "timeout", message: "This took too long. Try again." });
    expect(SEGMENTS_TIMEOUT_MS).toBe(60_000);
  });
  it("does not keep a timed-out answer as a result: the next load fetches again", async () => {
    vi.useFakeTimers();
    const f = hanging();
    vi.stubGlobal("fetch", f);
    const req = { artistId: "A", city: { name: "Los Angeles", country: "US" } };
    const p = loadSegments(req);
    await vi.advanceTimersByTimeAsync(SEGMENTS_TIMEOUT_MS + 1);
    const s = await p;
    expect(s.status === "done" && s.data.reason).toBe("timeout");
    void loadSegments(req);
    expect(f).toHaveBeenCalledTimes(2);
    expect(getSegments(segmentKey("A", req.city)).status).toBe("loading");
    vi.unstubAllGlobals();
  });
});
