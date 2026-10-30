import { afterEach, describe, expect, it, vi } from "vitest";
import { loadAllSegments, MATRIX_CONCURRENCY, MATRIX_MAX_CITIES } from "./ageMatrixLoader";
import { getSegments, resetSegments, segmentKey, type SegmentRequest } from "./segmentStore";

afterEach(() => { resetSegments(); vi.useRealTimers(); });

const reqs = (n: number): SegmentRequest[] => Array.from({ length: n }, (_, i) => ({ artistId: "A", city: { id: `c${i}`, name: `City ${i}`, country: "US" } }));
const okBody = { status: "ok", indexes: { "25_to_29": 0.9 }, bands: [{ band: "25_to_29", phrase: "", index: 0.9, status: "ok", items: [{ name: "B", entityId: "1", artistRank: 1, cityRank: null }], hiddenCount: 0, newInTop5: 1, lifted: false }] };
const res = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

/** Fake fetch that records how many calls are in flight at once; each answer waits one macrotask. */
function tracker(answer: (url: string) => Response | Promise<Response> = () => res(okBody)) {
  let active = 0, peak = 0; const urls: string[] = [];
  const f = vi.fn(async (u: unknown) => { active++; peak = Math.max(peak, active); urls.push(String(u)); await new Promise((r) => setTimeout(r, 5)); try { return await answer(String(u)); } finally { active--; } });
  return { f: f as unknown as typeof fetch, peak: () => peak, urls };
}

describe("loadAllSegments", () => {
  it("caps the work at 10 cities and runs at most 2 lookups at a time", async () => {
    expect(MATRIX_CONCURRENCY).toBe(2);
    expect(MATRIX_MAX_CITIES).toBe(10);
    const t = tracker();
    await loadAllSegments(reqs(12), { fetchImpl: t.f });
    expect(t.urls).toHaveLength(10);
    expect(t.peak()).toBe(2);
  });
  it("a failing or hanging-then-failed city does not block the others, and reports per-city progress", async () => {
    const t = tracker((u) => (u.includes("City+1") ? res({ error: "x" }, 502) : res(okBody)));
    const seen: Array<[string, number, number]> = [];
    await loadAllSegments(reqs(4), { fetchImpl: t.f, onProgress: (p) => seen.push([p.cityId, p.done, p.total]) });
    expect(seen.map((s) => s[1])).toEqual([1, 2, 3, 4]);
    expect(seen.every((s) => s[2] === 4)).toBe(true);
    for (let i = 0; i < 4; i++) {
      const s = getSegments(segmentKey("A", reqs(4)[i]!.city));
      expect(s.status).toBe("done");
      expect(s.status === "done" && s.data.status).toBe(i === 1 ? "unavailable" : "ok");
    }
  });
  it("a fetch that throws is isolated too", async () => {
    const t = tracker((u) => { if (u.includes("City+0")) throw new Error("boom"); return res(okBody); });
    await loadAllSegments(reqs(3), { fetchImpl: t.f });
    const st = (i: number) => { const s = getSegments(segmentKey("A", reqs(3)[i]!.city)); return s.status === "done" ? s.data.status : s.status; };
    expect([st(0), st(1), st(2)]).toEqual(["unavailable", "ok", "ok"]);
  });
  it("skips cities already answered (cached), only unavailable ones are fetched again", async () => {
    const first = tracker((u) => (u.includes("City+1") ? res({}, 500) : res(okBody)));
    await loadAllSegments(reqs(3), { fetchImpl: first.f });
    const second = tracker();
    await loadAllSegments(reqs(3), { fetchImpl: second.f });
    expect(second.urls).toHaveLength(1);
    expect(second.urls[0]).toContain("City+1");
  });
});
