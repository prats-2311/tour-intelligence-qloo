import { describe, expect, it } from "vitest";
import { relativeTime } from "./relativeTime";

const NOW = Date.UTC(2026, 9, 31, 12, 0, 0);
describe("relativeTime", () => {
  it.each([
    [0, "just now"], [30_000, "just now"], [60_000, "1 minute ago"], [5 * 60_000, "5 minutes ago"], [60 * 60_000, "1 hour ago"],
    [3 * 3_600_000, "3 hours ago"], [24 * 3_600_000, "yesterday"], [3 * 86_400_000, "3 days ago"], [20 * 86_400_000, "2 weeks ago"],
  ])("%i ms ago reads %s", (ago, text) => expect(relativeTime(NOW - ago, NOW)).toBe(text));
  it("older than 60 days shows a date; a future time reads just now", () => {
    expect(relativeTime(NOW - 90 * 86_400_000, NOW)).toMatch(/\d{4}/);
    expect(relativeTime(NOW + 5000, NOW)).toBe("just now");
  });
});
