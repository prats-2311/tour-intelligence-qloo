import { haversineKm } from "@/lib/qloo/radius";

/** App assumption (not a market fact): up to this distance a leg is suggested as a drive, beyond it a flight. */
export const DRIVE_MAX_KM = 600;
/** App assumption: one driving day covers this many km. */
export const DRIVE_KM_PER_DAY = 700;

export type Mode = "drive" | "fly";
export interface Stop { id: string; name: string; lat: number; lon: number }
export interface Leg { key: string; from: string; to: string; fromName: string; toName: string; km: number | null; mode: Mode | null; days: number | null }

export const travelDays = (km: number, mode: Mode): number => (mode === "fly" ? 1 : Math.ceil(km / DRIVE_KM_PER_DAY));
export const legKey = (from: string, to: string): string => `${from}>${to}`;

/** Great-circle legs between consecutive stops. A stop without coordinates gives a leg with no distance (shown as "—"). */
export function buildLegs(stops: Stop[]): Leg[] {
  const out: Leg[] = [];
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]!, b = stops[i]!;
    const placed = [a.lat, a.lon, b.lat, b.lon].every(Number.isFinite);
    const km = placed ? haversineKm(a.lat, a.lon, b.lat, b.lon) : null;
    const mode: Mode | null = km === null ? null : km <= DRIVE_MAX_KM ? "drive" : "fly";
    out.push({ key: legKey(a.id, b.id), from: a.id, to: b.id, fromName: a.name, toName: b.name, km, mode, days: km === null || mode === null ? null : travelDays(km, mode) });
  }
  return out;
}

export function legTotals(legs: Leg[]): { legs: number; km: number; days: number; unknown: number } {
  return legs.reduce((t, l) => ({ legs: t.legs + 1, km: t.km + (l.km ?? 0), days: t.days + (l.days ?? 0), unknown: t.unknown + (l.km === null ? 1 : 0) }), { legs: 0, km: 0, days: 0, unknown: 0 });
}
