import { randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import { applyOp, CollabError, emptyDoc, seedDoc, toSnapshot, WS_ID, type Op } from "./model.js";
import { WindowLimiter } from "./limits.js";
import type { CollabStore } from "./store.js";
import { DISABLED_ANALYTICS, sha256, type Analytics } from "../analytics/bigquery.js";
import { teamEventRow } from "../analytics/teamLog.js";

export interface CollabDeps {
  store: CollabStore;
  now?: () => number;
  /** Writes per workspace per minute (default 30). */
  wsWritesPerMin?: number;
  /** Writes per x-session-id per minute (default 40). */
  sessionWritesPerMin?: number;
  /** Workspaces created per session per hour (default 10). */
  createsPerHour?: number;
  newId?: () => string;
  /** Optional BigQuery analytics: one counts-only row per real write. Absent or disabled means nothing is logged. */
  analytics?: Analytics;
  /** City id to display name and country, for the analytics row only. */
  cityOf?: (id: string) => { name: string; country: string } | undefined;
}

const OP_PATHS: Record<string, Op> = { status: "status", message: "message", resolve: "resolve", override: "override", "override/clear": "override_clear", lead: "lead", "lead/remove": "lead_remove" };

/** Team workspace routes under /v1/ws. The caller (the dashboard server) authenticates; `x-session-id` only scopes abuse limits. */
export function mountCollab(app: Express, deps: CollabDeps): void {
  const now = deps.now ?? Date.now;
  const wsLimit = new WindowLimiter(deps.wsWritesPerMin ?? 30, 60_000, now);
  const sessionLimit = new WindowLimiter(deps.sessionWritesPerMin ?? 40, 60_000, now);
  const createLimit = new WindowLimiter(deps.createsPerHour ?? 10, 3_600_000, now);
  const analytics = deps.analytics ?? DISABLED_ANALYTICS;
  const newId = deps.newId ?? (() => randomBytes(12).toString("base64url"));
  const session = (req: Request) => { const s = req.header("x-session-id"); return s && s.length <= 128 ? s : null; };
  const fail = (res: Response, err: unknown) => {
    if (err instanceof CollabError) return void res.status(err.status).json({ error: err.message });
    console.error("[collab]", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "internal error" });
  };
  const validWs = (req: Request, res: Response): string | null => {
    const ws = String(req.params.ws ?? "");
    if (!WS_ID.test(ws)) { res.status(400).json({ error: "ws is invalid" }); return null; }
    return ws;
  };

  app.post("/v1/ws", async (req, res) => {
    const sid = session(req);
    if (!sid) return void res.status(400).json({ error: "x-session-id header required (1-128 chars)" });
    try {
      const doc = req.body?.seed === undefined ? emptyDoc(now()) : seedDoc(req.body.seed, now());
      if (!createLimit.take(sid)) return void res.status(429).json({ error: "Too many workspaces created, try again later" });
      const ws = newId();
      if (!(await deps.store.create(ws, doc))) throw new Error("id collision");
      res.status(201).json({ ws, snapshot: toSnapshot(ws, doc) });
    } catch (err) { fail(res, err); }
  });

  app.get("/v1/ws/:ws", async (req, res) => {
    const ws = validWs(req, res);
    if (!ws) return;
    try {
      const doc = await deps.store.get(ws);
      if (!doc) return void res.status(404).json({ error: "Workspace not found or expired" });
      res.set("cache-control", "no-store").json(toSnapshot(ws, doc));
    } catch (err) { fail(res, err); }
  });

  for (const [path, op] of Object.entries(OP_PATHS)) {
    app.post(`/v1/ws/:ws/${path}`, async (req, res) => {
      const ws = validWs(req, res);
      if (!ws) return;
      const sid = session(req);
      if (!sid) return void res.status(400).json({ error: "x-session-id header required (1-128 chars)" });
      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) return void res.status(400).json({ error: "JSON object body required" });
      if (!wsLimit.take(ws) || !sessionLimit.take(sid)) return void res.status(429).json({ error: "Too many changes, slow down a moment" });
      try {
        const t = now();
        const doc = await deps.store.update(ws, (d) => applyOp(d, op, body as Record<string, unknown>, t), t);
        if (!doc) return void res.status(404).json({ error: "Workspace not found or expired" });
        // Real writes only: the demo seed is applied by `POST /v1/ws` and never reaches this handler. Fire and forget; a logging problem never touches the response.
        if (analytics.enabled) {
          try {
            const row = teamEventRow(op, body as Record<string, unknown>, doc, deps.cityOf);
            if (row) analytics.track("team_events", { ws_hash: sha256(ws), ...row });
          } catch { /* analytics must never affect a write */ }
        }
        res.set("cache-control", "no-store").json(toSnapshot(ws, doc));
      } catch (err) { fail(res, err); }
    });
  }
}
