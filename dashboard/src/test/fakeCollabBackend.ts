import { vi } from "vitest";
import { applyLocal } from "@/lib/collab/optimistic";
import type { Seed } from "@/lib/collab/api";
import { emptySnapshot, type Op, type Snapshot } from "@/lib/collab/types";

/** In-memory stand-in for /api/qloo/ws/* in tests: the same shapes as the gateway, no network. */
export function fakeCollabBackend(opts: { status?: number; delayMs?: number } = {}) {
  const docs = new Map<string, Snapshot>();
  const calls: Array<{ method: string; path: string; body?: Record<string, unknown> }> = [];
  let n = 0;
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
  const seeded = (ws: string, seed?: Seed): Snapshot => {
    let s = emptySnapshot(ws);
    const now = Date.now();
    const demo = (a: { agoMin: number }) => now - a.agoMin * 60_000;
    const run = (op: Op, body: object, a: { agoMin: number; name: string; role: string }) => { s = applyLocal(s, op, body as Record<string, unknown>, { name: a.name, role: a.role as never }, demo(a), `d${(n += 1)}`); };
    for (const x of seed?.statuses ?? []) run("status", x, x);
    for (const t of seed?.threads ?? []) { for (const m of t.messages) run("message", { key: t.key, text: m.text }, m); if (t.resolved) run("resolve", { key: t.key, resolved: true }, t.resolved); }
    for (const o of seed?.overrides ?? []) run("override", o, o);
    for (const l of seed?.leads ?? []) run("lead", l, l);
    const mark = <T extends { demo?: true }>(x: T): T => ({ ...x, demo: true });
    return { ...s, statuses: Object.fromEntries(Object.entries(s.statuses).map(([k, v]) => [k, mark(v)])), threads: Object.fromEntries(Object.entries(s.threads).map(([k, t]) => [k, { ...t, messages: t.messages.map(mark) }])), activity: s.activity.map(mark) };
  };
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const path = url.replace(/^.*\/api\/qloo\/ws/, "");
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ method, path, body });
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (opts.status) return json({ error: "unavailable" }, opts.status);
    if (path === "" && method === "POST") { const ws = `testws${String((n += 1)).padStart(8, "0")}`; const s = seeded(ws, (body as { seed?: Seed } | undefined)?.seed); docs.set(ws, s); return json({ ws, snapshot: s }, 201); }
    const m = /^\/([A-Za-z0-9_-]+)(?:\/(.+))?$/.exec(path);
    const doc = m ? docs.get(m[1]!) : undefined;
    if (!doc) return json({ error: "Workspace not found or expired" }, 404);
    if (method === "GET") return json(doc);
    const op = ({ status: "status", message: "message", resolve: "resolve", override: "override", "override/clear": "override_clear", lead: "lead", "lead/remove": "lead_remove" } as Record<string, Op>)[m![2]!]!;
    const next = { ...applyLocal(doc, op, body!, { name: String(body!.name), role: body!.role as never }, Date.now(), `s${(n += 1)}`), rev: doc.rev + 1 };
    docs.set(doc.ws, next);
    return json(next);
  });
  return { fetchImpl, docs, calls, put: (s: Snapshot) => docs.set(s.ws, s) };
}
