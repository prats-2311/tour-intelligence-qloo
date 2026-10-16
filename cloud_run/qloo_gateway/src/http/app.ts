import express, { type Response } from "express";
import type { City } from "../geo/cities.js";
import { runCityPlaybook } from "../pipeline/cityPlaybook.js";
import { runTourBoard } from "../pipeline/tourBoard.js";
import type { QlooCaller } from "../qlooCall.js";
import type { GatewayEvent } from "../types.js";

async function streamSse(res: Response, gen: AsyncGenerator<GatewayEvent>, controller: AbortController): Promise<void> {
  res.status(200).set({ "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  res.flushHeaders();
  res.on("close", () => controller.abort());
  for await (const event of gen) {
    if (controller.signal.aborted) break;
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  }
  res.end();
}

export function createApp(deps: { qloo: QlooCaller; cities: City[]; health: () => Promise<{ connected: boolean; ready: boolean }> }) {
  const app = express();
  app.use(express.json({ limit: "64kb" }));

  app.get("/healthz", async (_req, res) => { res.json(await deps.health()); });

  app.post("/v1/tour-board", async (req, res) => {
    const sessionId = req.header("x-session-id");
    const { artist, artistEntityId, regions, maxStops } = req.body ?? {};
    if (!sessionId) return void res.status(400).json({ error: "x-session-id header required" });
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
    if (!sessionId || [artist, artistEntityId, city, country].some((v) => typeof v !== "string" || !v)) {
      return void res.status(400).json({ error: "x-session-id, artist, artistEntityId, city, country required" });
    }
    const controller = new AbortController();
    await streamSse(res, runCityPlaybook({ artist: String(artist), artistEntityId: String(artistEntityId), city: { name: String(city), country: String(country) }, sessionId },
      { qloo: deps.qloo, cities: deps.cities, signal: controller.signal }), controller);
  });

  app.post("/v1/tools/:name", async (req, res) => {
    const sessionId = req.header("x-session-id");
    if (!sessionId) return void res.status(400).json({ error: "x-session-id header required" });
    try {
      res.json(await deps.qloo.call(req.params.name, req.body ?? {}, sessionId));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  return app;
}