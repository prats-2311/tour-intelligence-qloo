import type { EvidenceRef, Score } from "../types.js";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function fanHeat(markets: Array<{ id: string; affinity: number; popularity: number; refs: EvidenceRef[] }>): Map<string, Score> {
  const out = new Map<string, Score>();
  const norm = (values: number[]) => {
    const min = Math.min(...values), max = Math.max(...values);
    return (x: number) => (values.length < 2 || max === min ? clamp01(x) : (x - min) / (max - min));
  };
  const na = norm(markets.map((m) => m.affinity));
  const np = norm(markets.map((m) => m.popularity));
  for (const m of markets) {
    if (!Number.isFinite(m.affinity) || !Number.isFinite(m.popularity)) {
      out.set(m.id, { value: null, reason: "insufficient_data", refs: m.refs });
      continue;
    }
    out.set(m.id, { value: 100 * (0.7 * na(m.affinity) + 0.3 * np(m.popularity)), refs: m.refs });
  }
  return out;
}
