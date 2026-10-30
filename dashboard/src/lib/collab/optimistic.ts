import { LIMITS, type Actor, type Field, type Op, type Snapshot } from "./types";

const trim = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/**
 * Applies a write to a snapshot the way the gateway will, so the UI answers at once. The server's snapshot replaces
 * this one when the write comes back (and on every poll), so any difference is corrected, never kept.
 */
export function applyLocal(s: Snapshot, op: Op, body: Record<string, unknown>, who: Actor, now: number, tmpId: string): Snapshot {
  const n: Snapshot = { ...s, statuses: { ...s.statuses }, threads: { ...s.threads }, overrides: { ...s.overrides }, leads: { ...s.leads }, activity: [...s.activity] };
  const cityId = String(body.cityId ?? "");
  const key = String(body.key ?? "");
  const ev = (type: Snapshot["activity"][number]["type"], extra: { cityId?: string; key?: string; text?: string }) => n.activity.unshift({ id: tmpId, type, ...extra, ...who, at: now });
  switch (op) {
    case "status": n.statuses[cityId] = { status: body.status as never, ...who, at: now }; ev("status", { cityId, text: String(body.status) }); break;
    case "message": {
      const t = n.threads[key] ?? { resolved: false, messages: [] };
      const { resolvedBy: _b, resolvedAt: _a, ...open } = t;
      n.threads[key] = { ...open, resolved: false, messages: [...t.messages, { id: tmpId, ...who, text: String(body.text), at: now }] };
      ev("message", { key, text: trim(String(body.text), 80) });
      break;
    }
    case "resolve": {
      const t = n.threads[key];
      if (!t) break;
      const { resolvedBy: _b, resolvedAt: _a, ...open } = t;
      n.threads[key] = body.resolved === true ? { ...open, resolved: true, resolvedBy: who, resolvedAt: now } : { ...open, resolved: false };
      ev(body.resolved === true ? "resolve" : "reopen", { key });
      break;
    }
    case "override": {
      const f = body.field as Field;
      const cur = n.overrides[cityId]?.[f];
      n.overrides[cityId] = { ...n.overrides[cityId], [f]: { value: String(body.value), original: cur?.original ?? String(body.original ?? ""), ...who, at: now } };
      ev("override", { cityId, key: f, text: trim(String(body.value), 80) });
      break;
    }
    case "override_clear": {
      const { [body.field as Field]: _gone, ...rest } = n.overrides[cityId] ?? {};
      if (Object.keys(rest).length) n.overrides[cityId] = rest; else delete n.overrides[cityId];
      ev("override_clear", { cityId, key: String(body.field) });
      break;
    }
    case "lead": n.leads[cityId] = [...(n.leads[cityId] ?? []), { id: tmpId, text: String(body.text), ...who, at: now }]; ev("lead", { cityId, text: trim(String(body.text), LIMITS.lead) }); break;
    case "lead_remove": {
      const rest = (n.leads[cityId] ?? []).filter((l) => l.id !== body.id);
      if (rest.length) n.leads[cityId] = rest; else delete n.leads[cityId];
      ev("lead_remove", { cityId });
      break;
    }
  }
  if (n.activity.length > 200) n.activity.length = 200;
  return n;
}
