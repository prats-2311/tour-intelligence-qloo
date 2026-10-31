import { createHash, randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import { TEST_HEADER, isTestTraffic } from "../analytics/bigquery.js";
import { WindowLimiter } from "../collab/limits.js";
import { MAX_RUN_CHARS, MAX_TOURS_PER_OWNER, TOUR_ID, TTL_DAYS, ToursError, chunkString, defaultTitle, foldText, parseStatus, parseSummary, parseTitle, searchText, serializeRun, type Summary, type TourDoc } from "./model.js";
import type { ToursStore } from "./store.js";

export const TOURS_JSON_LIMIT = "5mb";
const DAY = 86_400_000;
const HOUR = 3_600_000;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export interface ToursDeps {
  store: ToursStore;
  now?: () => number;
  newId?: () => string;
  newToken?: () => string;
  /** Owners created per x-session-id (or client address) per hour (default 20). */
  ownersPerHour?: number;
}

/**
 * Saved tours under /v1/owners and /v1/tours. The caller (the dashboard server) authenticates to the service with its own
 * Authorization header; the browser's anonymous owner token travels separately in `x-tiq-owner`. Only sha256(token) is stored or logged.
 */
export function mountTours(app: Express, deps: ToursDeps): void {
  const { store } = deps;
  const now = deps.now ?? Date.now;
  const newId = deps.newId ?? (() => randomBytes(12).toString("base64url"));
  const newToken = deps.newToken ?? (() => randomBytes(32).toString("base64url"));
  const ownerLimit = new WindowLimiter(deps.ownersPerHour ?? 20, HOUR, now);
  const fail = (res: Response, err: unknown) => {
    if (err instanceof ToursError) return void res.status(err.status).json({ error: err.message });
    console.error("[tours]", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "internal error" });
  };
  const sid = (req: Request) => { const s = req.header("x-session-id"); return s && s.length <= 128 ? s : undefined; };
  const isTest = (req: Request) => isTestTraffic(sid(req), req.header(TEST_HEADER));

  /** Resolves the owner hash from x-tiq-owner, or answers 401. Refreshes lastSeenAt at most hourly. */
  async function auth(req: Request, res: Response): Promise<string | null> {
    const tok = req.header("x-tiq-owner");
    if (!tok || tok.length > 200) { res.status(401).json({ error: "owner required" }); return null; }
    const hash = sha256(tok);
    const owner = await store.getOwner(hash);
    if (!owner) { res.status(401).json({ error: "owner required" }); return null; }
    if (now() - owner.lastSeenAt.getTime() >= HOUR) await store.touchOwner(hash, new Date(now()));
    return hash;
  }
  const idOf = (req: Request, res: Response): string | null => {
    const id = String(req.params.id ?? "");
    if (!TOUR_ID.test(id)) { res.status(400).json({ error: "id is invalid" }); return null; }
    return id;
  };
  const meta = (id: string, t: TourDoc) => ({ id, title: t.title, status: t.status, artist: t.artist, regions: t.regions, cities: t.cities, createdAt: t.createdAt.getTime(), updatedAt: t.updatedAt.getTime(), runBytes: t.runBytes });
  const live = (t: TourDoc | null, hash: string): t is TourDoc => !!t && t.ownerHash === hash && t.expiresAt.getTime() > now();
  const serializedRun = (run: unknown): string => {
    if (run === undefined) throw new ToursError(400, "run required");
    const s = serializeRun(run);
    if (s.length > MAX_RUN_CHARS) throw new ToursError(413, "run too large");
    return s;
  };
  const jsonBody = (req: Request): Record<string, unknown> => {
    const b = req.body;
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new ToursError(400, "JSON object body required");
    return b as Record<string, unknown>;
  };

  app.post("/v1/owners", async (req, res) => {
    try {
      if (!ownerLimit.take(sid(req) ?? `ip:${req.ip ?? "?"}`)) return void res.status(429).json({ error: "Too many requests, try again later" });
      const token = newToken();
      const at = new Date(now());
      await store.createOwner(sha256(token), { createdAt: at, lastSeenAt: at, ...(isTest(req) ? { test: true as const } : {}) });
      res.status(201).set("cache-control", "no-store").json({ ownerToken: token });
    } catch (err) { fail(res, err); }
  });

  app.post("/v1/tours", async (req, res) => {
    try {
      const hash = await auth(req, res);
      if (!hash) return;
      const b = jsonBody(req);
      const summary = parseSummary(b.summary);
      const title = b.title === undefined ? defaultTitle(summary) : parseTitle(b.title);
      const status = b.status === undefined ? "draft" : parseStatus(b.status);
      const run = serializedRun(b.run);
      if ((await store.listTours(hash)).length >= MAX_TOURS_PER_OWNER) return void res.status(409).json({ error: `tour limit reached (${MAX_TOURS_PER_OWNER})` });
      const chunks = chunkString(run);
      const at = new Date(now());
      const doc: TourDoc = { ownerHash: hash, title, status, artist: summary.artist, artistLower: foldText(summary.artist), regions: summary.regions, cities: summary.cities, search: searchText(title, summary), createdAt: at, updatedAt: at, expiresAt: new Date(at.getTime() + TTL_DAYS * DAY), runBytes: run.length, chunkCount: chunks.length, ...(isTest(req) ? { test: true as const } : {}) };
      const id = newId();
      await store.saveTour(id, doc, chunks);
      res.status(201).json({ id, updatedAt: at.getTime() });
    } catch (err) { fail(res, err); }
  });

  app.get("/v1/tours", async (req, res) => {
    try {
      const hash = await auth(req, res);
      if (!hash) return;
      const q = typeof req.query.q === "string" ? foldText(req.query.q).split(/\s+/).filter(Boolean) : [];
      const status = typeof req.query.status === "string" && req.query.status ? req.query.status : undefined;
      const rows = (await store.listTours(hash))
        .filter((t) => t.expiresAt.getTime() > now() && (!status || t.status === status) && q.every((w) => t.search.includes(w)))
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      res.set("cache-control", "no-store").json({ tours: rows.map((t) => meta(t.id, t)) });
    } catch (err) { fail(res, err); }
  });

  app.get("/v1/tours/:id", async (req, res) => {
    try {
      const hash = await auth(req, res);
      if (!hash) return;
      const id = idOf(req, res);
      if (!id) return;
      const t = await store.getTour(id);
      if (!live(t, hash)) return void res.status(404).json({ error: "Tour not found" });
      const run = JSON.parse((await store.readChunks(id)).join(""));
      res.set("cache-control", "no-store").json({ ...meta(id, t), run });
    } catch (err) { fail(res, err); }
  });

  app.patch("/v1/tours/:id", async (req, res) => {
    try {
      const hash = await auth(req, res);
      if (!hash) return;
      const id = idOf(req, res);
      if (!id) return;
      const b = jsonBody(req);
      const newSummary = b.summary !== undefined ? parseSummary(b.summary) : undefined;
      const newTitle = b.title !== undefined ? parseTitle(b.title) : undefined;
      const newStatus = b.status !== undefined ? parseStatus(b.status) : undefined;
      const run = b.run !== undefined ? serializedRun(b.run) : undefined;
      const cur = await store.getTour(id);
      if (!live(cur, hash)) return void res.status(404).json({ error: "Tour not found" });
      const next: TourDoc = { ...cur };
      let summary: Summary = { artist: cur.artist, regions: cur.regions, cities: cur.cities };
      if (newSummary) { summary = newSummary; next.artist = summary.artist; next.artistLower = foldText(summary.artist); next.regions = summary.regions; next.cities = summary.cities; }
      if (newTitle !== undefined) next.title = newTitle;
      if (newStatus !== undefined) next.status = newStatus;
      let chunks: string[] | undefined;
      if (run !== undefined) { chunks = chunkString(run); next.runBytes = run.length; next.chunkCount = chunks.length; }
      next.search = searchText(next.title, summary);
      next.updatedAt = new Date(now());
      next.expiresAt = new Date(next.updatedAt.getTime() + TTL_DAYS * DAY);
      await store.saveTour(id, next, chunks);
      res.json({ id, updatedAt: next.updatedAt.getTime() });
    } catch (err) { fail(res, err); }
  });

  app.delete("/v1/tours/:id", async (req, res) => {
    try {
      const hash = await auth(req, res);
      if (!hash) return;
      const id = idOf(req, res);
      if (!id) return;
      const t = await store.getTour(id);
      if (!t || t.ownerHash !== hash) return void res.status(404).json({ error: "Tour not found" });
      await store.deleteTour(id);
      res.status(204).end();
    } catch (err) { fail(res, err); }
  });
}
