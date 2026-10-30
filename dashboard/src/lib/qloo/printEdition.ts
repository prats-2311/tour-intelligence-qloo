import type { DateWindow, Source, Verdict } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "28 Oct 2026" from an ISO date or timestamp (calendar date as written, no time-zone shift). */
export function fmtDay(iso: string | Date): string {
  if (iso instanceof Date) return `${iso.getDate()} ${MONTHS[iso.getMonth()]} ${iso.getFullYear()}`;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso;
}

/** What the running footer says about where the numbers came from; the date is the recording's own. */
export function editionLabel(source: Source, recordedAt: string | null): string {
  if (source === "live") return "Live Qloo run";
  if (source === "showcase" && recordedAt) return `Recorded Qloo run, ${fmtDay(recordedAt)}`;
  return "Sample data, illustrative";
}

export const windowText = (w?: DateWindow): string | null => (w ? `${fmtDay(w.start)} to ${fmtDay(w.end)}` : null);

/** Print-safe verdict marks: a glyph plus the word, never colour alone. */
export const VERDICT_GLYPH: Record<Verdict, string> = { play: "●", hidden_goldmine: "◆", de_risk: "▲", consider: "○", skip: "✕", insufficient_data: "■" };

export const scoreText = (v: number | null | undefined): string => (v === null || v === undefined || !Number.isFinite(v) ? "—" : String(Math.round(v)));

/** CSS string literal for a margin-box `content`. */
export const cssString = (s: string): string => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ")}"`;

/** One @page rule per named page: running header top-right, edition label bottom-left, page number bottom-centre. */
export function pageRules(pages: Array<{ name: string; header?: string }>, footer: string): string {
  const mark = `font: 400 7.5pt Inter, sans-serif; color: #5a5a5a; vertical-align: top; padding-top: 4mm;`;
  return pages.map((p) => `@page ${p.name} { size: A4; margin: 18mm 16mm 20mm;
  @top-right { content: ${p.header ? cssString(p.header) : '""'}; font: 400 7.5pt Inter, sans-serif; color: #5a5a5a; vertical-align: bottom; padding-bottom: 4mm; }
  @bottom-left { content: ${cssString(footer)}; ${mark} }
  @bottom-center { content: counter(page); ${mark} font-variant-numeric: tabular-nums; }
}`).join("\n") + `\n@page pe-cover { size: A4; margin: 18mm 16mm 18mm; @bottom-left { content: ""; } @bottom-center { content: ""; } @top-right { content: ""; } }`;
}
