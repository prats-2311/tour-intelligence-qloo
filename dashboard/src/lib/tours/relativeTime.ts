const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;

/** "just now", "5 minutes ago", "yesterday", "2 weeks ago"; a date after 60 days. `ms` is epoch milliseconds. */
export function relativeTime(ms: number, now: number = Date.now()): string {
  const d = now - ms;
  if (d < MIN) return "just now";
  if (d < HOUR) return plural(Math.floor(d / MIN), "minute");
  if (d < DAY) return plural(Math.floor(d / HOUR), "hour");
  if (d < 2 * DAY) return "yesterday";
  if (d < 14 * DAY) return plural(Math.floor(d / DAY), "day");
  if (d < 60 * DAY) return plural(Math.floor(d / (7 * DAY)), "week");
  return new Date(ms).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" });
}
