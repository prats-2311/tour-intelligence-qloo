// Pure workspace model: validation and the apply-one-write functions. No I/O; the store and routes wrap it.
export const ROLES = ["Manager", "Booking agent", "Promoter", "Brand team", "Other"] as const;
export const STATUSES = ["considering", "confirmed", "on_hold", "dropped"] as const;
export const FIELDS = ["top_zone", "best_room", "support"] as const;
export type Role = (typeof ROLES)[number];
export type Status = (typeof STATUSES)[number];
export type Field = (typeof FIELDS)[number];

export const LIMITS = {
  messages: 500, activity: 200, leads: 100, threads: 200, statuses: 100, overrides: 300, seedMessages: 80, seedThreads: 30, seedStatuses: 12, seedLeads: 8, seedOverrides: 8,
  text: 1000, name: 40, value: 120, lead: 200, activityText: 80, docBytes: 900_000,
} as const;
export const TTL_DAYS = 30;

export interface Actor { name: string; role: Role }
export interface Message extends Actor { id: string; text: string; at: number; demo?: true }
export interface Thread { resolved: boolean; resolvedBy?: Actor; resolvedAt?: number; messages: Message[] }
export interface StatusEntry extends Actor { status: Status; at: number; demo?: true }
export interface OverrideEntry extends Actor { value: string; original: string; at: number; demo?: true }
export interface Lead extends Actor { id: string; text: string; at: number; demo?: true }
export interface ActivityEvent extends Actor { id: string; type: "status" | "message" | "resolve" | "reopen" | "override" | "override_clear" | "lead" | "lead_remove"; cityId?: string; key?: string; text?: string; at: number; demo?: true }
/** The stored document. `createdAt` and `expiresAt` are real dates so a Firestore TTL policy on `expiresAt` can delete it. */
export interface WorkspaceDoc {
  createdAt: Date; expiresAt: Date; rev: number; seq: number;
  statuses: Record<string, StatusEntry>;
  threads: Record<string, Thread>;
  overrides: Record<string, Partial<Record<Field, OverrideEntry>>>;
  leads: Record<string, Lead[]>;
  /** Oldest first in storage; the snapshot reverses it. */
  activity: ActivityEvent[];
}
export interface Snapshot extends Omit<WorkspaceDoc, "createdAt" | "expiresAt" | "activity" | "seq"> { ws: string; createdAt: number; activity: ActivityEvent[] }

export class CollabError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const bad = (m: string): never => { throw new CollabError(400, m); };

export const WS_ID = /^[A-Za-z0-9_-]{10,64}$/;
const CITY_ID = /^[A-Za-z0-9_-]{1,32}$/;
const THREAD_KEY = /^(tour:[a-z_]{1,24}|city:[A-Za-z0-9_-]{1,32}|card:[A-Za-z0-9_-]{1,32}:[a-z_]{1,24})$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/;

export function cleanText(v: unknown, max: number, what: string): string {
  if (typeof v !== "string") return bad(`${what} must be text`);
  const t = v.replace(/\r\n?/g, "\n").trim();
  if (!t) return bad(`${what} is empty`);
  if (t.length > max) return bad(`${what} is over ${max} characters`);
  if (CONTROL.test(t)) return bad(`${what} has control characters`);
  return t;
}
export function actorOf(b: Record<string, unknown>): Actor {
  const name = cleanText(b.name, LIMITS.name, "name").replace(/\s+/g, " ");
  if (!ROLES.includes(b.role as Role)) return bad("role is not one of the allowed roles");
  return { name, role: b.role as Role };
}
const cityId = (v: unknown): string => (typeof v === "string" && CITY_ID.test(v) ? v : bad("cityId is invalid"));
const threadKey = (v: unknown): string => (typeof v === "string" && THREAD_KEY.test(v) ? v : bad("thread key is invalid"));

const trim = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const messageCount = (d: WorkspaceDoc) => Object.values(d.threads).reduce((n, t) => n + t.messages.length, 0);
const leadCount = (d: WorkspaceDoc) => Object.values(d.leads).reduce((n, l) => n + l.length, 0);
const nextId = (d: WorkspaceDoc, p: string) => `${p}${(d.seq += 1).toString(36)}`;

function log(d: WorkspaceDoc, e: Omit<ActivityEvent, "id" | "at">, at: number, demo?: boolean): void {
  d.activity.push({ ...e, id: nextId(d, "a"), at, ...(demo ? { demo: true as const } : {}) });
  if (d.activity.length > LIMITS.activity) d.activity.splice(0, d.activity.length - LIMITS.activity);
}

export function emptyDoc(now: number): WorkspaceDoc {
  return { createdAt: new Date(now), expiresAt: new Date(now + TTL_DAYS * 86_400_000), rev: 0, seq: 0, statuses: {}, threads: {}, overrides: {}, leads: {}, activity: [] };
}

export type Op = "status" | "message" | "resolve" | "override" | "override_clear" | "lead" | "lead_remove";
export const OPS: readonly Op[] = ["status", "message", "resolve", "override", "override_clear", "lead", "lead_remove"];

/** Applies one validated write to a copy-safe doc (mutates and returns it). Last write wins per field. */
export function applyOp(d: WorkspaceDoc, op: Op, body: Record<string, unknown>, now: number, opts: { demo?: boolean } = {}): WorkspaceDoc {
  const who = actorOf(body);
  const demo = opts.demo ? { demo: true as const } : {};
  switch (op) {
    case "status": {
      const id = cityId(body.cityId);
      if (!STATUSES.includes(body.status as Status)) return bad("status is invalid");
      if (!d.statuses[id] && Object.keys(d.statuses).length >= LIMITS.statuses) return bad("too many cities with a status");
      d.statuses[id] = { status: body.status as Status, ...who, at: now, ...demo };
      log(d, { type: "status", cityId: id, text: body.status as string, ...who }, now, opts.demo);
      break;
    }
    case "message": {
      const key = threadKey(body.key);
      const text = cleanText(body.text, LIMITS.text, "text");
      if (messageCount(d) >= LIMITS.messages) throw new CollabError(409, "This workspace is full of notes");
      if (!d.threads[key] && Object.keys(d.threads).length >= LIMITS.threads) return bad("too many threads");
      const t = (d.threads[key] ??= { resolved: false, messages: [] });
      t.messages.push({ id: nextId(d, "m"), ...who, text, at: now, ...demo });
      if (t.resolved) { t.resolved = false; delete t.resolvedBy; delete t.resolvedAt; } // a new note reopens the thread
      log(d, { type: "message", key, text: trim(text, LIMITS.activityText), ...who }, now, opts.demo);
      break;
    }
    case "resolve": {
      const key = threadKey(body.key);
      const t = d.threads[key];
      if (!t || t.messages.length === 0) throw new CollabError(404, "No such thread");
      const resolved = body.resolved === true;
      if (typeof body.resolved !== "boolean") return bad("resolved must be true or false");
      t.resolved = resolved;
      if (resolved) { t.resolvedBy = who; t.resolvedAt = now; } else { delete t.resolvedBy; delete t.resolvedAt; }
      log(d, { type: resolved ? "resolve" : "reopen", key, ...who }, now, opts.demo);
      break;
    }
    case "override": {
      const id = cityId(body.cityId);
      if (!FIELDS.includes(body.field as Field)) return bad("field is invalid");
      const value = cleanText(body.value, LIMITS.value, "value");
      const original = typeof body.original === "string" ? trim(body.original.trim(), LIMITS.value) : "";
      const cur = d.overrides[id]?.[body.field as Field];
      if (!cur && Object.values(d.overrides).reduce((n, o) => n + Object.keys(o).length, 0) >= LIMITS.overrides) return bad("too many overrides");
      // Qloo's own suggestion stays on record: re-editing keeps the first original.
      (d.overrides[id] ??= {})[body.field as Field] = { value, original: cur?.original ?? original, ...who, at: now, ...demo };
      log(d, { type: "override", cityId: id, key: body.field as string, text: trim(value, LIMITS.activityText), ...who }, now, opts.demo);
      break;
    }
    case "override_clear": {
      const id = cityId(body.cityId);
      if (!FIELDS.includes(body.field as Field)) return bad("field is invalid");
      const o = d.overrides[id];
      if (!o?.[body.field as Field]) throw new CollabError(404, "No such override");
      delete o[body.field as Field];
      if (Object.keys(o).length === 0) delete d.overrides[id];
      log(d, { type: "override_clear", cityId: id, key: body.field as string, ...who }, now, opts.demo);
      break;
    }
    case "lead": {
      const id = cityId(body.cityId);
      const text = cleanText(body.text, LIMITS.lead, "lead");
      if (leadCount(d) >= LIMITS.leads) throw new CollabError(409, "Too many sponsor leads");
      (d.leads[id] ??= []).push({ id: nextId(d, "l"), text, ...who, at: now, ...demo });
      log(d, { type: "lead", cityId: id, text: trim(text, LIMITS.activityText), ...who }, now, opts.demo);
      break;
    }
    case "lead_remove": {
      const id = cityId(body.cityId);
      const list = d.leads[id] ?? [];
      const hit = list.find((l) => l.id === body.id);
      if (!hit) throw new CollabError(404, "No such lead");
      d.leads[id] = list.filter((l) => l !== hit);
      if (d.leads[id]!.length === 0) delete d.leads[id];
      log(d, { type: "lead_remove", cityId: id, text: trim(hit.text, LIMITS.activityText), ...who }, now, opts.demo);
      break;
    }
  }
  d.rev += 1;
  if (JSON.stringify(d).length > LIMITS.docBytes) throw new CollabError(409, "This workspace is full");
  return d;
}

/**
 * Builds a seeded doc from client-supplied demo content. The server stays dumb: it validates shape and caps, stamps every
 * entry `demo: true` and never trusts timestamps (`agoMin` is clamped to a week).
 */
export function seedDoc(seed: unknown, now: number): WorkspaceDoc {
  const d = emptyDoc(now);
  const s = (seed ?? {}) as Record<string, unknown>;
  const arr = (v: unknown, max: number, what: string): Record<string, unknown>[] => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.length > max) return bad(`seed.${what} must be at most ${max} entries`);
    return v.map((x) => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : bad(`seed.${what} entries must be objects`)));
  };
  const ago = (v: unknown) => now - Math.min(10_080, Math.max(0, Number.isFinite(v) ? Number(v) : 0)) * 60_000;
  const rows: Array<{ at: number; run: () => void }> = [];
  const add = (at: number, op: Op, body: Record<string, unknown>) => rows.push({ at, run: () => void applyOp(d, op, body, at, { demo: true }) });
  for (const x of arr(s.statuses, LIMITS.seedStatuses, "statuses")) add(ago(x.agoMin), "status", x);
  for (const t of arr(s.threads, LIMITS.seedThreads, "threads")) {
    const ms = arr(t.messages, LIMITS.seedMessages, "messages");
    ms.forEach((m) => add(ago(m.agoMin), "message", { ...m, key: t.key }));
    const r = t.resolved;
    if (r && typeof r === "object" && ms.length) { const o = r as Record<string, unknown>; add(ago(o.agoMin), "resolve", { ...o, key: t.key, resolved: true }); }
  }
  for (const o of arr(s.overrides, LIMITS.seedOverrides, "overrides")) add(ago(o.agoMin), "override", o);
  for (const l of arr(s.leads, LIMITS.seedLeads, "leads")) add(ago(l.agoMin), "lead", l);
  if (rows.length > LIMITS.seedMessages + 40) bad("seed is too large");
  // Oldest first, so the activity feed and every "reopened by a later note" rule play out in order.
  rows.sort((a, b) => a.at - b.at).forEach((r) => r.run());
  return d;
}

export function toSnapshot(ws: string, d: WorkspaceDoc): Snapshot {
  const { createdAt, expiresAt: _e, seq: _s, activity, ...rest } = d;
  return { ws, ...rest, createdAt: createdAt.getTime(), activity: [...activity].reverse() };
}
