import { setBacktest, getBacktest } from "./backtest";
import { parseShowcase, setShowcase } from "./showcase";

export type RecordingStatus = "ok" | "unavailable";

/**
 * Loads the private showcase and backtest recordings from the dashboard server (`GET /api/recordings/:name`).
 * Never throws and never takes longer than `timeoutMs`: a recording that fails to load leaves the placeholder
 * (showcase) or null (backtest) in place and is reported "unavailable".
 */
export async function loadRecordings({ fetchImpl = fetch, timeoutMs = 4000 }: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<{ showcase: RecordingStatus; backtest: RecordingStatus }> {
  const get = async (name: "showcase" | "backtest"): Promise<unknown> => {
    try {
      const r = await fetchImpl(`/api/recordings/${name}`, { signal: AbortSignal.timeout(timeoutMs) });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<[null, null]>((resolve) => { timer = setTimeout(() => resolve([null, null]), timeoutMs); });
  const [show, bt] = await Promise.race([Promise.all([get("showcase"), get("backtest")]), timeout]);
  clearTimeout(timer);
  const parsed = show ? parseShowcase(show) : null;
  if (parsed && parsed.recordedAt) setShowcase(parsed);
  if (bt) setBacktest(bt);
  return { showcase: parsed?.recordedAt ? "ok" : "unavailable", backtest: bt && getBacktest() ? "ok" : "unavailable" };
}
