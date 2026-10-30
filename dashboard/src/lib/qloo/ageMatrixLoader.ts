import { getSegments, loadSegments, segmentKey, type SegmentRequest } from "./segmentStore";

export const MATRIX_CONCURRENCY = 2;
export const MATRIX_MAX_CITIES = 10;
export interface MatrixProgress { cityId: string; done: number; total: number }

/**
 * Loads the age groups of up to 10 cities, two lookups at a time, through the shared session store (so the 60 s timeout and the
 * "unavailable answers may be retried" rule apply unchanged). A city that fails or times out is recorded in the store and never stops the others.
 * Cities already answered are skipped and not counted.
 */
export async function loadAllSegments(requests: SegmentRequest[], opts: { fetchImpl?: typeof fetch; onProgress?: (p: MatrixProgress) => void } = {}): Promise<void> {
  const todo = requests.slice(0, MATRIX_MAX_CITIES).filter((r) => {
    const s = getSegments(segmentKey(r.artistId, r.city));
    return !(s.status === "done" && s.data.status !== "unavailable");
  });
  let next = 0, done = 0;
  const worker = async () => {
    while (next < todo.length) {
      const r = todo[next++]!;
      try { await loadSegments(r, { fetchImpl: opts.fetchImpl }); } catch { /* the store already holds the error state */ }
      done++;
      opts.onProgress?.({ cityId: r.city.id ?? r.city.name, done, total: todo.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(MATRIX_CONCURRENCY, todo.length) }, worker));
}
