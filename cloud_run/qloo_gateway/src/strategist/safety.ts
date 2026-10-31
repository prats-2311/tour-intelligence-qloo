import type { ChatMessage, StrategistContext, UserDocument } from "../types.js";

export const LIMITS = { messages: 12, messageChars: 1000, nameChars: 100, cities: 20, regions: 6 } as const;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u2028\u2029\u202A-\u202E\u2066-\u2069]/g;
const ID = /^[A-Za-z0-9_:.-]{1,128}$/;
const NAME = /^[\p{L}\p{M}\p{N} '.,&()-]{1,100}$/u;
const TEAM_STATUS = /^[a-z_]{1,24}$/;
const VERDICTS = new Set(["play", "hidden_goldmine", "de_risk", "consider", "skip", "insufficient_data"]);
const rec = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const score = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v));

export function isSafeName(s: unknown): s is string {
  return typeof s === "string" && s.trim() !== "" && NAME.test(s.trim());
}

const BAD_CONTEXT_CHARS = /[\u0000-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069<>]/;
/** Printable display text for client-supplied names (artist, regions, cities). Goes to Gemini only as JSON data, so punctuation like + ! $ / is fine; markup and control/bidi characters are not. */
export function isSafeContextText(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const t = s.trim();
  return t.length >= 1 && t.length <= LIMITS.nameChars && !BAD_CONTEXT_CHARS.test(t);
}

export function sanitizeMessages(input: unknown): { ok: true; messages: ChatMessage[] } | { ok: false; error: string } {
  if (!Array.isArray(input) || input.length === 0 || input.length > LIMITS.messages) return { ok: false, error: `messages must be 1-${LIMITS.messages} items` };
  const out: ChatMessage[] = [];
  for (const m of input) {
    const r = rec(m);
    if (!r || (r.role !== "user" && r.role !== "assistant") || typeof r.text !== "string") return { ok: false, error: "each message needs role user|assistant and text" };
    const text = r.text.replace(CONTROL, "").trim();
    if (text === "" || text.length > LIMITS.messageChars) return { ok: false, error: `message text must be 1-${LIMITS.messageChars} characters` };
    out.push({ role: r.role, text });
  }
  if (out.at(-1)!.role !== "user") return { ok: false, error: "the last message must be from the user" };
  return { ok: true, messages: out };
}

export function validateContext(input: unknown): { ok: true; context: StrategistContext } | { ok: false; error: string } {
  if (input === undefined || input === null) return { ok: true, context: {} };
  const c = rec(input);
  if (!c) return { ok: false, error: "context must be an object" };
  const ctx: StrategistContext = {};
  if (c.artist !== undefined) {
    const a = rec(c.artist);
    if (!a || !isSafeContextText(a.name) || typeof a.entityId !== "string" || !ID.test(a.entityId)) return { ok: false, error: "context.artist invalid" };
    ctx.artist = { name: a.name.trim(), entityId: a.entityId };
  }
  if (c.regions !== undefined) {
    if (!Array.isArray(c.regions) || c.regions.length > LIMITS.regions) return { ok: false, error: "context.regions invalid" };
    ctx.regions = c.regions.filter(isSafeContextText).map((r) => r.trim());
  }
  if (c.cities !== undefined) {
    if (!Array.isArray(c.cities) || c.cities.length > LIMITS.cities) return { ok: false, error: `context.cities must be at most ${LIMITS.cities}` };
    const cities = [];
    for (const raw of c.cities) {
      const x = rec(raw);
      if (!x) continue;
      if (typeof x.id !== "string" || x.id.length > 32 || !ID.test(x.id) || !isSafeContextText(x.name) || !isSafeContextText(x.country) || typeof x.verdict !== "string" || !VERDICTS.has(x.verdict)
        || !score(x.fanHeat) || !score(x.activation) || !score(x.winnability)) continue;
      cities.push({
        id: x.id, name: (x.name as string).trim(), country: (x.country as string).trim(), verdict: x.verdict, fanHeat: x.fanHeat as number | null, activation: x.activation as number | null, winnability: x.winnability as number | null,
        ...(typeof x.teamStatus === "string" && TEAM_STATUS.test(x.teamStatus) ? { teamStatus: x.teamStatus } : {}),
        ...(x.closeCall === true ? { closeCall: true } : {}), ...(x.partialData === true ? { partialData: true } : {}), ...(x.majorMarket === true ? { majorMarket: true } : {}),
      });
    }
    ctx.cities = cities;
  }
  if (c.focusCityId !== undefined) {
    if (typeof c.focusCityId !== "string" || c.focusCityId.length > 32 || !ID.test(c.focusCityId)) return { ok: false, error: "context.focusCityId invalid" };
    ctx.focusCityId = c.focusCityId;
  }
  return { ok: true, context: ctx };
}

export const DOCUMENT_LIMITS = { docs: 3, pagesPerDoc: 40, totalChars: 60_000, nameChars: 120 } as const;
const DOC_ID = /^[A-Za-z0-9_-]{1,40}$/;
const TEXT_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u2028\u2029\u202A-\u202E\u2066-\u2069]/g;

/** Private documents sent with one strategist request. Text is cleaned of control characters and of look-alike citation markers so a page cannot forge a `[doc:x p.n]` source. */
export function validateDocuments(input: unknown): { ok: true; documents: UserDocument[] } | { ok: false; error: string } {
  if (input === undefined || input === null) return { ok: true, documents: [] };
  if (!Array.isArray(input) || input.length > DOCUMENT_LIMITS.docs) return { ok: false, error: `documents must be an array of at most ${DOCUMENT_LIMITS.docs}` };
  const seen = new Set<string>();
  const out: UserDocument[] = [];
  let total = 0;
  for (const raw of input) {
    const d = rec(raw);
    if (!d || typeof d.id !== "string" || !DOC_ID.test(d.id) || seen.has(d.id)) return { ok: false, error: "each document needs a unique short id" };
    seen.add(d.id);
    const name = typeof d.name === "string" ? d.name.replace(TEXT_CONTROL, "").trim() : "";
    if (name === "" || name.length > DOCUMENT_LIMITS.nameChars) return { ok: false, error: `document names must be 1-${DOCUMENT_LIMITS.nameChars} characters` };
    if (!Array.isArray(d.pages) || d.pages.length < 1 || d.pages.length > DOCUMENT_LIMITS.pagesPerDoc) return { ok: false, error: `each document needs 1-${DOCUMENT_LIMITS.pagesPerDoc} pages` };
    const pages: UserDocument["pages"] = [];
    for (const rawPage of d.pages) {
      const p = rec(rawPage);
      if (!p || typeof p.n !== "number" || !Number.isInteger(p.n) || p.n < 1 || p.n > 9999 || typeof p.text !== "string") return { ok: false, error: "each page needs an integer number and text" };
      const text = p.text.replace(TEXT_CONTROL, "").replace(/\[doc:/gi, "[ doc:");
      total += text.length;
      pages.push({ n: p.n, text });
    }
    out.push({ id: d.id, name, pages });
  }
  if (total > DOCUMENT_LIMITS.totalChars) return { ok: false, error: `documents may total at most ${DOCUMENT_LIMITS.totalChars} characters` };
  return { ok: true, documents: out };
}
