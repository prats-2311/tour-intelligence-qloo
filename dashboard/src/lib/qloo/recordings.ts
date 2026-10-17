import { setBacktest, getBacktest } from "./backtest";
import { parseShowcase, setShowcase } from "./showcase";

export type RecordingStatus = "ok" | "unavailable";

/**
 * Loads the private showcase and backtest recordings from the dashboard server (`GET /api/recordings/:name`).
 * Never throws and never takes longer than `timeoutMs`: a recording that fails to load leaves the placeholder
 * (showcase) or null (backtest) in place and is reported "unavailable".
 */
export async function loadRecordings({ fetchImpl = fetch, timeoutMs = 4000 }: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<{ showcase: RecordingStatus; backtest: RecordingStatus }> {
  // Each recording has its own cap, so one that hangs never discards another that already loaded.
  const get = (name: "showcase" | "backtest"): Promise<unknown> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const capped = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); });
    const load = (async () => {
      try {
        const r = await fetchImpl(`/api/recordings/${name}`, { signal: AbortSignal.timeout(timeoutMs) });
        return r.ok ? await r.json() : null;
      } catch { return null; }
    })();
    return Promise.race([load, capped]).finally(() => clearTimeout(timer));
  };
  const [show, bt] = await Promise.all([get("showcase"), get("backtest")]);
  const parsed = show ? parseShowcase(show) : null;
  if (parsed && parsed.recordedAt) setShowcase(parsed);
  if (bt) setBacktest(bt);
  return { showcase: parsed?.recordedAt ? "ok" : "unavailable", backtest: bt && getBacktest() ? "ok" : "unavailable" };
}
