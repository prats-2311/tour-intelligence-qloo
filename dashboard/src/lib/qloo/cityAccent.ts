export const CITY_SLOTS = ["#ff3d00", "#0091ea", "#ff00aa", "#009e5c", "#7c4dff", "#c27c00", "#00a0b0", "#a39200"] as const;
export const NEUTRAL_ACCENT = "#a4a094";
export const SAMPLE_ACCENT_ORDER = ["3530597", "5368361", "4005539", "3448439", "3995465", "3451190", "3464975", "4671654"];

/** Slot by position in `order` (the run's city order as first scored), so re-sorting never repaints. */
export function accentFor(cityId: string, order: readonly string[]): string {
  const i = order.indexOf(cityId);
  return i >= 0 && i < CITY_SLOTS.length ? CITY_SLOTS[i]! : NEUTRAL_ACCENT;
}
