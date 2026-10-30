/** Sliding-window counter: at most `max` hits per `windowMs` per key. In memory, so each Cloud Run instance counts its own. */
export class WindowLimiter {
  private hits = new Map<string, number[]>();
  private readonly max: number;
  private readonly windowMs: number;
  private readonly clock: () => number;
  constructor(max: number, windowMs: number, clock: () => number = Date.now) { this.max = max; this.windowMs = windowMs; this.clock = clock; }
  /** True and counted when under the limit; false (not counted) when over. */
  take(key: string): boolean {
    const now = this.clock();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) { this.hits.set(key, recent); return false; }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (!v.some((t) => now - t < this.windowMs)) this.hits.delete(k);
    return true;
  }
}
