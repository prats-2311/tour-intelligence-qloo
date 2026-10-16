import type { EvidenceRef, Score } from "../types.js";

export type ComponentName = "sponsor_fit" | "local_hooks" | "fan_concentration" | "venue_fit";
export const DEFAULT_WEIGHTS: Record<ComponentName, number> = { sponsor_fit: 0.3, local_hooks: 0.25, fan_concentration: 0.25, venue_fit: 0.2 };

export function meanTopK(values: number[], k: number): number | null {
  const finite = values.filter(Number.isFinite).sort((a, b) => b - a).slice(0, k);
  return finite.length === 0 ? null : finite.reduce((a, b) => a + b, 0) / finite.length;
}

export function fanConcentration(shares: number[]): number | null {
  if (shares.length === 0) return null;
  return [...shares].sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
}

export function activation(
  components: Partial<Record<ComponentName, { value: number; refs: EvidenceRef[] }>>,
  weights: Record<ComponentName, number> = DEFAULT_WEIGHTS,
): Score & { components: Partial<Record<ComponentName, number>> } {
  const present = (Object.keys(components) as ComponentName[]).filter((k) => Number.isFinite(components[k]?.value));
  const refs = present.flatMap((k) => components[k]!.refs);
  const values = Object.fromEntries(present.map((k) => [k, Math.min(1, Math.max(0, components[k]!.value))])) as Partial<Record<ComponentName, number>>;
  if (present.length < 2) return { value: null, reason: "insufficient_data", refs, components: values };
  const totalWeight = present.reduce((sum, k) => sum + weights[k], 0);
  const value = 100 * present.reduce((sum, k) => sum + (weights[k] / totalWeight) * Math.min(1, Math.max(0, components[k]!.value)), 0);
  return { value, refs, components: values };
}
