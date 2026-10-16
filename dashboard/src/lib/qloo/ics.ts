const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const ymd = (iso: string) => iso.replace(/-/g, "");
const nextDay = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    const limit = out.length === 0 ? 75 : 74;   // continuation lines start with a space
    if (enc.encode(cur + ch).length > limit) { out.push(cur); cur = ch; } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function toIcs(book: { title: string; chapters: Array<{ city: { id: string; name: string; country: string } }> }, window: { start: string; end: string }, stamp: string): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tour Intelligence//Tour Book//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const { city } of book.chapters) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${city.id}-${window.start}@tour-intelligence`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(window.start)}`,
      `DTEND;VALUE=DATE:${ymd(nextDay(window.end))}`,
      `SUMMARY:${esc(`Hold — ${city.name}, ${city.country}`)}`,
      `DESCRIPTION:${esc(`Tentative hold from ${book.title}. Dates are not scheduled.`)}`,
      "STATUS:TENTATIVE",
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
