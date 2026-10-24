import type { DateWindow } from "./types";

/** Stated once in the Tour Book and in the "Why this score?" footer. */
export const CLOCK_RULE = "Dates assume a 6-week on-sale lead before the first show; change the window in the brief.";
const ON_SALE_LEAD_DAYS = 42, POSTERS_LEAD_DAYS = 28, SPONSOR_BEFORE_ON_SALE_DAYS = 7;
const DAY_MS = 86_400_000;

export interface Clock { /** ISO yyyy-mm-dd. */ date: string; /** Whole days from today (negative = past). */ days: number }
export interface VerdictClocks { onSale: Clock; postersBy: Clock; confirmSponsor: Clock }

const isoToUtc = (iso: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(t) ? null : t;
};

/** Clocks from the tour window start S: on-sale S-42, posters by S-28, confirm the sponsor a week before on-sale. Null when the window is missing or unreadable. */
export function verdictClocks(window: DateWindow | undefined, now: Date = new Date()): VerdictClocks | null {
  const start = window ? isoToUtc(window.start) : null;
  if (start === null) return null;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const clock = (offsetDays: number): Clock => {
    const t = start - offsetDays * DAY_MS;
    return { date: new Date(t).toISOString().slice(0, 10), days: Math.round((t - today) / DAY_MS) };
  };
  return {
    onSale: clock(ON_SALE_LEAD_DAYS),
    postersBy: clock(POSTERS_LEAD_DAYS),
    confirmSponsor: clock(ON_SALE_LEAD_DAYS + SPONSOR_BEFORE_ON_SALE_DAYS),
  };
}

const dayMonth = (iso: string, locale?: string): string => new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" });

export function onSalePhrase(days: number): string {
  if (days === 0) return "on-sale today";
  if (days === 1) return "on-sale tomorrow";
  if (days > 1) return `on-sale in ${days} days`;
  return `on-sale ${-days} ${days === -1 ? "day" : "days"} ago`;
}

/** "on-sale in 23 days · posters by 12 Feb · confirm sponsor by 22 Jan" (dates by locale). */
export function clockLine(c: VerdictClocks, locale?: string): string {
  return `${onSalePhrase(c.onSale.days)} · posters by ${dayMonth(c.postersBy.date, locale)} · confirm sponsor by ${dayMonth(c.confirmSponsor.date, locale)}`;
}
