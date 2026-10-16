import express, { type NextFunction, type Request, type Response } from "express";
import type { City } from "../geo/cities.js";
import { runCityPlaybook } from "../pipeline/cityPlaybook.js";
import { runTourBoard } from "../pipeline/tourBoard.js";
import { ValidationError, type QlooCaller } from "../qlooCall.js";
import type { GatewayEvent } from "../types.js";

function validSession(id: string | undefined): id is string {
  return typeof id === "string" && id.length >= 1 && id.length <= 128;
}

async function streamSse(res: Response, gen: AsyncGenerator<GatewayEvent>, controller: AbortController): Promise<void> {
  res.status(200).set({ "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  res.flushHeaders();
  res.on("close", () => controller.abort());
  try {
    for await (const event of gen) {
      if (controller.signal.aborted) break;
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    }
  } catch {
    res.write(`event: error\ndata: ${JSON.stringify({ type: "error", code: "INTERNAL", message: "stream failed" })}\n\n`);
  }
  res.end();
}

export function createApp(deps: { qloo: QlooCaller; cities: City[]; health: () => Promise<{ connected: boolean; ready: boolean }> }) {
  const app = express();
  app.use(express.json({ limit: "64kb" }));

  app.get("/healthz", async (_req, res, next) => { try { res.json(await deps.health()); } catch (err) { next(err); } });

  app.post("/v1/tour-board", async (req, res) => {
    const sessionId = req.header("x-session-id");
    const { artist, artistEntityId, regions, maxStops } = req.body ?? {};
    if (!validSession(sessionId)) return void res.status(400).json({ error: "x-session-id header required (1-128 chars)" });
    if (typeof artist !== "string" || !artist.trim() || !Array.isArray(regions) || regions.length === 0 || regions.length > 6
      || !regions.every((r: unknown) => typeof r === "string" && r.trim()) || !Number.isInteger(maxStops) || maxStops < 1 || maxStops > 20) {
      return void res.status(400).json({ error: "artist, regions[1-6], maxStops[1-20] required" });
    }
    const controller = new AbortController();
    await streamSse(res, runTourBoard({
      artist: artist.trim(), ...(typeof artistEntityId === "string" && artistEntityId ? { artistEntityId } : {}),
      regions, maxStops, sessionId, today: new Date().toISOString().slice(0, 10),
    }, { qloo: deps.qloo, cities: deps.cities, signal: controller.signal }), controller);
  });

  app.get("/v1/city-playbook", async (req, res) => {
    const sessionId = req.header("x-session-id");
    const { artist, artistEntityId, city, country } = req.query;
    if (!validSession(sessionId) || [artist, artistEntityId, city, country].some((v) => typeof v !== "string" || !v)) {
      return void res.status(400).json({ error: "x-session-id, artist, artistEntityId, city, country required" });
    }
    const controller = new AbortController();
    await streamSse(res, runCityPlaybook({ artist: String(artist), artistEntityId: String(artistEntityId), city: { name: String(city), country: String(country) }, sessionId },
      { qloo: deps.qloo, cities: deps.cities, signal: controller.signal }), controller);
  });

  app.post("/v1/tools/:name", async (req, res) => {
    const sessionId = req.header("x-session-id");
    if (!validSession(sessionId)) return void res.status(400).json({ error: "x-session-id header required (1-128 chars)" });
    try {
      res.json(await deps.qloo.call(req.params.name, req.body ?? {}, sessionId));
    } catch (err) {
      if (err instanceof ValidationError) res.status(400).json({ error: err.message });
      else res.status(500).json({ error: "internal error" });
    }
  });

  app.use((err: { status?: number; statusCode?: number; message?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return void res.end();
    const status = err.status ?? err.statusCode ?? 500;
    res.status(status).json({ error: status >= 500 ? "internal error" : String(err.message ?? "bad request") });
  });

  return app;
}