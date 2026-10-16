import type { ChatMessage, StrategistContext } from "../types.js";

export const LIMITS = { messages: 12, messageChars: 1000, nameChars: 100, cities: 20 } as const;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const NAME = /^[\p{L}\p{M}\p{N} '.,&()-]{1,100}$/u;
const VERDICTS = new Set(["play", "hidden_goldmine", "de_risk", "consider", "skip", "insufficient_data"]);
const rec = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const score = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v));

export function isSafeName(s: unknown): s is string {
  return typeof s === "string" && s.trim() !== "" && NAME.test(s.trim());
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
    if (!a || !isSafeName(a.name) || typeof a.entityId !== "string" || a.entityId.length > 128) return { ok: false, error: "context.artist invalid" };
    ctx.artist = { name: a.name.trim(), entityId: a.entityId };
  }
  if (c.regions !== undefined) {
    if (!Array.isArray(c.regions) || c.regions.length > 6 || !c.regions.every(isSafeName)) return { ok: false, error: "context.regions invalid" };
    ctx.regions = c.regions.map((r) => r.trim());
  }
  if (c.cities !== undefined) {
    if (!Array.isArray(c.cities) || c.cities.length > LIMITS.cities) return { ok: false, error: `context.cities must be at most ${LIMITS.cities}` };
    const cities = [];
    for (const raw of c.cities) {
      const x = rec(raw);
      if (!x || typeof x.id !== "string" || x.id.length > 32 || !isSafeName(x.name) || !isSafeName(x.country) || typeof x.verdict !== "string" || !VERDICTS.has(x.verdict)
        || !score(x.fanHeat) || !score(x.activation) || !score(x.winnability)) return { ok: false, error: "context.cities item invalid" };
      cities.push({ id: x.id, name: (x.name as string).trim(), country: (x.country as string).trim(), verdict: x.verdict, fanHeat: x.fanHeat as number | null, activation: x.activation as number | null, winnability: x.winnability as number | null });
    }
    ctx.cities = cities;
  }
  if (c.focusCityId !== undefined) {
    if (typeof c.focusCityId !== "string" || c.focusCityId.length > 32) return { ok: false, error: "context.focusCityId invalid" };
    ctx.focusCityId = c.focusCityId;
  }
  return { ok: true, context: ctx };
}
