import { blankBudget, blankCity, CURRENCIES, type Budget } from "./math";

/** Browser-only: the budget never goes to a server. */
export const storageKey = (tourKey: string): string => `tiq.budget.${tourKey}`;

export function loadBudget(tourKey: string, cityIds: string[]): Budget {
  const base = blankBudget(cityIds);
  try {
    const raw = localStorage.getItem(storageKey(tourKey));
    if (!raw) return base;
    const s = JSON.parse(raw) as Partial<Budget>;
    if (!s || typeof s !== "object") return base;
    const str = (v: unknown): string => (typeof v === "string" ? v : "");
    const cities = Object.fromEntries(cityIds.map((id) => [id, { ...blankCity(), ...Object.fromEntries(Object.entries(s.cities?.[id] ?? {}).filter(([, v]) => typeof v === "string")) }]));
    return {
      currency: CURRENCIES.includes(s.currency as never) ? s.currency! : "USD", cities,
      legs: Object.fromEntries(Object.entries(s.legs ?? {}).filter(([, v]) => typeof v === "string")),
      perDiem: str(s.perDiem), crewSize: str(s.crewSize), hotel: str(s.hotel), rooms: str(s.rooms), example: s.example === true,
    };
  } catch { return base; }
}

export function saveBudget(tourKey: string, b: Budget): void {
  try { localStorage.setItem(storageKey(tourKey), JSON.stringify(b)); } catch { /* storage blocked: the budget just does not persist */ }
}
export function clearBudget(tourKey: string): void {
  try { localStorage.removeItem(storageKey(tourKey)); } catch { /* storage blocked */ }
}
