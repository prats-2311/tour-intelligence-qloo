import { normaliseName } from "../claims/verify.js";
import type { ThisWeekItem, WebResult } from "../types.js";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function verifyWebItems(items: ThisWeekItem[], results: WebResult[], window: { start: string; end: string }) {
  const byId = new Map(results.map((r) => [r.id, normaliseName(`${r.title} ${r.content}`)]));
  const verified: ThisWeekItem[] = [];
  const removed: Array<{ item: ThisWeekItem; reason: string }> = [];
  for (const item of items) {
    if (item.citations.length === 0) { removed.push({ item, reason: "no citation" }); continue; }
    const unknown = item.citations.find((c) => !byId.has(c));
    if (unknown) { removed.push({ item, reason: `unknown citation ${unknown}` }); continue; }
    const text = item.citations.map((c) => byId.get(c)!).join(" ");
    const bad = item.entities.find((e) => { const n = normaliseName(e); return n === "" || !text.includes(n); });
    if (bad !== undefined) { removed.push({ item, reason: `entity not in cited source: ${bad}` }); continue; }
    if (item.date !== null && !ISO.test(item.date)) { removed.push({ item, reason: "date not ISO" }); continue; }
    if (item.date !== null && (item.date < window.start || item.date > window.end)) { removed.push({ item, reason: "date outside window" }); continue; }
    verified.push(item);
  }
  return { verified, removed };
}
