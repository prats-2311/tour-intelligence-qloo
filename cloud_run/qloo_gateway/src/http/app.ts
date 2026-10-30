import express, { type NextFunction, type Request, type Response } from "express";
import type { City } from "../geo/cities.js";
import { mountCollab, type CollabDeps } from "../collab/routes.js";
import { PUBLIC_SESSION_PREFIX } from "../budget.js";
import { runCityPlaybook } from "../pipeline/cityPlaybook.js";
import type { SponsorCandidate, SponsorVerdicts } from "../pipeline/sponsorCheck.js";
import { MAX_ROUTING_CITIES } from "../pipeline/routing.js";
import { runTourBoard } from "../pipeline/tourBoard.js";
import { ValidationError, type QlooCaller } from "../qlooCall.js";
import { isSafeContextText, LIMITS, sanitizeMessages, validateContext } from "../strategist/safety.js";
import type { ChatMessage, GatewayEvent, NarrateFn, StrategistContext, ThisWeek, WithoutQloo } from "../types.js";

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

export function createApp(deps: { qloo: QlooCaller; cities: City[]; health: () => Promise<{ connected: boolean; ready: boolean }>; narrate?: NarrateFn; thisWeek?: (input: { city: string; country: string; start: string; end: string; sessionId: string }) => Promise<ThisWeek>; strategist?: (input: { messages: ChatMessage[]; context: StrategistContext; sessionId: string }, signal: AbortSignal) => AsyncGenerator<GatewayEvent>; localActs?: (input: { artist: string; city: { name: string; country: string }; sessionId: string }) => Promise<string[] | null>; sponsorCheck?: (candidates: SponsorCandidate[], sessionId: string) => Promise<SponsorVerdicts>; withoutQloo?: (input: { artist: string; regions: string[]; cities: Array<{ name: string; country: string }>; sessionId: string }) => Promise<WithoutQloo>; collab?: CollabDeps }) {
  const app = express();
  app.use(express.json({ limit: "64kb" }));

  // Cloud Run reserves paths ending in "z" (Google answers 404 before the app), so /health is the deployed path; /healthz stays for local use.
  app.get(["/health", "/healthz"], async (_req, res, next) => { try { res.json(await deps.health()); } catch (err) { next(err); } });

  app.post("/v1/tour-board", async (req, res) => {
    const sessionId = req.header("x-session-id");
    const { artist, artistEntityId, regions, maxStops, cities } = req.body ?? {};
    if (!validSession(sessionId)) return void res.status(400).json({ error: "x-session-id header required (1-128 chars)" });
    const controller = new AbortController();
    const today = new Date().toISOString().slice(0, 10);
    const artistFields = { artist: typeof artist === "string" ? artist.trim() : "", ...(typeof artistEntityId === "string" && artistEntityId ? { artistEntityId } : {}) };
    if (cities !== undefined) {
      // "Paste your cities": 1-8 {name, country?}; regions (0-6) only disambiguate names. Everything else about the brief is fixed server-side.
      const entry = (c: unknown) => { const o = c as Record<string, unknown> | null; return !!o && typeof o === "object" && !Array.isArray(o) && isSafeContextText(o.name) && (o.country === undefined || isSafeContextText(o.country)); };
      if (!artistFields.artist) return void res.status(400).json({ error: "artist required" });
      if (!Array.isArray(cities) || cities.length < 1 || cities.length > MAX_ROUTING_CITIES || !cities.every(entry)) {
        return void res.status(400).json({ error: `cities must be 1-${MAX_ROUTING_CITIES} entries of {name, country?} with safe names` });
      }
      if (regions !== undefined && (!Array.isArray(regions) || regions.length > 6 || !regions.every(isSafeContextText))) {
        return void res.status(400).json({ error: "regions must be at most 6 safe names" });
      }
      const routing = cities.map((c: { name: string; country?: string }) => ({ name: c.name.trim(), ...(c.country !== undefined ? { country: c.country.trim() } : {}) }));
      await streamSse(res, runTourBoard({
        ...artistFields, regions: ((regions ?? []) as string[]).map((r) => r.trim()), maxStops: MAX_ROUTING_CITIES, sessionId, today, routing,
      }, { qloo: deps.qloo, cities: deps.cities, signal: controller.signal }), controller);
      return;
    }
    if (typeof artist !== "string" || !artist.trim() || !Array.isArray(regions) || regions.length === 0 || regions.length > 6
      || !regions.every((r: unknown) => typeof r === "string" && r.trim()) || !Number.isInteger(maxStops) || maxStops < 1 || maxStops > 20) {
      return void res.status(400).json({ error: "artist, regions[1-6], maxStops[1-20] required" });
    }
    await streamSse(res, runTourBoard({
      ...artistFields, regions, maxStops, sessionId, today,
    }, { qloo: deps.qloo, cities: deps.cities, signal: controller.signal }), controller);
  });

  app.get("/v1/city-playbook", async (req, res) => {
    const sessionId = req.header("x-session-id");
    const { artist, artistEntityId, city, country } = req.query;
    if (!validSession(sessionId) || [artist, artistEntityId, city, country].some((v) => typeof v !== "string" || !v)) {
      return void res.status(400).json({ error: "x-session-id, artist, artistEntityId, city, country required" });
    }
    const { cityId, lat, lon } = req.query;
    const coord = (v: unknown) => (typeof v === "string" && v !== "" ? Number(v) : undefined);
    const [latN, lonN] = [coord(lat), coord(lon)];
    if ((cityId !== undefined && (typeof cityId !== "string" || cityId.length > 32)) || [latN, lonN].some((n) => n !== undefined && !Number.isFinite(n))) {
      return void res.status(400).json({ error: "cityId must be a short string; lat and lon must be numbers" });
    }
    // Optional: the headliner's Qloo popularity (0-1), so support acts can be checked against it without a lookup.
    const popularityN = coord(req.query.artistPopularity);
    if (popularityN !== undefined && !(Number.isFinite(popularityN) && popularityN >= 0 && popularityN <= 1)) {
      return void res.status(400).json({ error: "artistPopularity must be a number from 0 to 1" });
    }
    const controller = new AbortController();
    const narrative = req.query.narrative !== "0";
    // narrative=0 means "no Gemini" and public sessions are the cheap path: both keep the city-pool-only talent card.
    const hybrid = deps.localActs && narrative && !sessionId!.startsWith(PUBLIC_SESSION_PREFIX);
    await streamSse(res, runCityPlaybook({ artist: String(artist), artistEntityId: String(artistEntityId), city: { name: String(city), country: String(country), ...(typeof cityId === "string" && cityId ? { id: cityId } : {}), ...(latN !== undefined && lonN !== undefined ? { lat: latN, lon: lonN } : {}) }, sessionId: sessionId!, narrative, ...(popularityN !== undefined ? { artistPopularity: popularityN } : {}) },
      { qloo: deps.qloo, cities: deps.cities, signal: controller.signal, narrate: deps.narrate, ...(deps.sponsorCheck && narrative ? { sponsorCheck: deps.sponsorCheck } : {}), ...(hybrid ? { localActs: deps.localActs! } : {}) }), controller);
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

  app.post("/v1/strategist", async (req, res) => {
    const sessionId = req.header("x-session-id");
    if (!validSession(sessionId)) return void res.status(400).json({ error: "x-session-id header required (1-128 chars)" });
    const messages = sanitizeMessages(req.body?.messages);
    if (!messages.ok) return void res.status(400).json({ error: messages.error });
    const context = validateContext(req.body?.context);
    if (!context.ok) return void res.status(400).json({ error: context.error });
    const controller = new AbortController();
    const gen = deps.strategist
      ? deps.strategist({ messages: messages.messages, context: context.context, sessionId }, controller.signal)
      : (async function* (): AsyncGenerator<GatewayEvent> {
        yield { type: "strategist_error", code: "UNAVAILABLE", message: "Strategist unavailable right now" };
        yield { type: "done", summary: { rounds: 0, toolCalls: 0, forcedFinal: false } };
      })();
    await streamSse(res, gen, controller);
  });

  app.post("/v1/without-qloo", async (req, res, next) => {
    const sessionId = req.header("x-session-id");
    if (!validSession(sessionId)) return void res.status(400).json({ error: "x-session-id header required (1-128 chars)" });
    const b = (req.body ?? {}) as Record<string, unknown>;
    const { artist, regions, cities } = b;
    const city = (c: unknown) => { const o = c as Record<string, unknown> | null; return !!o && typeof o === "object" && isSafeContextText(o.name) && isSafeContextText(o.country); };
    if (!isSafeContextText(artist) || !Array.isArray(regions) || regions.length < 1 || regions.length > LIMITS.regions || !regions.every(isSafeContextText)
      || !Array.isArray(cities) || cities.length < 1 || cities.length > LIMITS.cities || !cities.every(city)) {
      return void res.status(400).json({ error: "artist, regions (1-6) and cities (1-20 {name, country}) with safe names required" });
    }
    if (!deps.withoutQloo) return void res.json({ status: "unavailable", reason: "disabled", message: "Generic ranking unavailable" });
    const clean = cities.map((c: { name: string; country: string }) => ({ name: c.name.trim(), country: c.country.trim() }));
    try { res.json(await deps.withoutQloo({ artist: artist.trim(), regions: regions.map((r: string) => r.trim()), cities: clean, sessionId })); } catch (err) { next(err); }
  });

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  app.get("/v1/this-week", async (req, res, next) => {
    const sessionId = req.header("x-session-id");
    const { city, country, start, end } = req.query;
    if (!validSession(sessionId) || [city, country, start, end].some((v) => typeof v !== "string" || !v || v.length > 80)
      || !ISO_DATE.test(String(start)) || !ISO_DATE.test(String(end)) || String(end) < String(start)
      || !((Date.parse(String(end)) - Date.parse(String(start))) / 86_400_000 <= 62)) {
      return void res.status(400).json({ error: "x-session-id, city, country, start, end (YYYY-MM-DD, ≤ 62 days) required" });
    }
    if (!deps.thisWeek) return void res.json({ status: "unavailable", reason: "no_key", message: "Live web context unavailable — search is not configured" });
    try { res.json(await deps.thisWeek({ city: String(city), country: String(country), start: String(start), end: String(end), sessionId })); } catch (err) { next(err); }
  });

  // Team workspaces (/v1/ws): absent without a store, so the routes 404 and the dashboard hides collaboration.
  if (deps.collab) mountCollab(app, deps.collab);

  app.use((err: { status?: number; statusCode?: number; message?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return void res.end();
    const status = err.status ?? err.statusCode ?? 500;
    res.status(status).json({ error: status >= 500 ? "internal error" : String(err.message ?? "bad request") });
  });

  return app;
}