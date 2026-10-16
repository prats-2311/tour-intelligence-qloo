import { describe, expect, it } from "vitest";
import { toIcs } from "./ics";

const book = { title: "Lumen Vale: Mexico, Brazil, United States", chapters: [{ city: { id: "4005539", name: "Guadalajara", country: "MX" } }, { city: { id: "3448439", name: "São Paulo", country: "BR" } }] };

describe("toIcs", () => {
  const ics = toIcs(book, { start: "2027-03-12", end: "2027-04-18" }, "20261017T090000Z");
  it("is a CRLF calendar with one tentative all-day hold per city", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Tour Intelligence//Tour Book//EN\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("DTSTART;VALUE=DATE:20270312\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20270419\r\n");
    expect(ics).toContain("SUMMARY:Hold — Guadalajara\\, MX\r\n");
    expect(ics).toContain("STATUS:TENTATIVE\r\n");
    expect(ics).toContain("UID:4005539-2027-03-12@tour-intelligence\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });
  it("escapes commas and semicolons and folds long lines at 75 octets", () => {
    const lines = ics.split("\r\n");
    expect(lines.every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(ics).toContain("United States");   // survives folding when unfolded:
    expect(ics.replace(/\r\n /g, "")).toContain("DESCRIPTION:Tentative hold from Lumen Vale: Mexico\\, Brazil\\, United States. Dates are not scheduled.");
  });
});
