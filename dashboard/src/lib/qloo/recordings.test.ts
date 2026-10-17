import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import syntheticShowcase from "@/test/fixtures/showcase.synthetic.json";
import syntheticBacktest from "@/test/fixtures/backtest.synthetic.json";
import { PLACEHOLDER_SHOWCASE } from "./placeholderShowcase";
import { getBacktest, setBacktest } from "./backtest";
import { loadRecordings } from "./recordings";
import { parseShowcase, setShowcase, SHOWCASE, showcaseAvailable } from "./showcase";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const reset = () => { setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE)); setBacktest(null); };
beforeEach(reset);
afterEach(() => { reset(); vi.useRealTimers(); });

describe("loadRecordings", () => {
  it("applies both recordings and flips showcaseAvailable", async () => {
    expect(showcaseAvailable()).toBe(false);
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => (String(url).endsWith("/showcase") ? json(syntheticShowcase) : json(syntheticBacktest))) as unknown as typeof fetch;
    const r = await loadRecordings({ fetchImpl });
    expect(r).toEqual({ showcase: "ok", backtest: "ok" });
    expect(showcaseAvailable()).toBe(true);
    expect(SHOWCASE.recordedAt).toBe(syntheticShowcase.recordedAt);
    expect(getBacktest()?.runs.length).toBeGreaterThan(0);
    expect(fetchImpl).toHaveBeenCalledWith("/api/recordings/showcase", expect.anything());
  });
  it("a 503 on the showcase leaves the placeholder and does not throw", async () => {
    const fetchImpl = (async (url: RequestInfo | URL) => (String(url).endsWith("/showcase") ? json({ error: "recording unavailable" }, 503) : json(syntheticBacktest))) as unknown as typeof fetch;
    const r = await loadRecordings({ fetchImpl });
    expect(r.showcase).toBe("unavailable");
    expect(r.backtest).toBe("ok");
    expect(SHOWCASE.recordedAt).toBeNull();
    expect(showcaseAvailable()).toBe(false);
  });
  it("a body that is not a recording stays unavailable", async () => {
    const fetchImpl = (async () => json({ nope: true })) as unknown as typeof fetch;
    expect(await loadRecordings({ fetchImpl })).toEqual({ showcase: "unavailable", backtest: "unavailable" });
    expect(getBacktest()).toBeNull();
  });
  it("gives up after timeoutMs when fetch never resolves", async () => {
    vi.useFakeTimers();
    const fetchImpl = (() => new Promise(() => {})) as unknown as typeof fetch;
    const p = loadRecordings({ fetchImpl, timeoutMs: 4000 });
    await vi.advanceTimersByTimeAsync(4000);
    expect(await p).toEqual({ showcase: "unavailable", backtest: "unavailable" });
  });
});
