import express from "express";
import { Readable } from "node:stream";

const STRATEGIST_PATH = "/api/qloo/strategist";
const parseDefault = express.json();
/** The app-wide JSON parser, except for the strategist route, which parses its own larger body (private documents travel in it). */
export function jsonExceptStrategist() {
  return (req, res, next) => (req.path === STRATEGIST_PATH ? next() : parseDefault(req, res, next));
}

/** A gateway on this machine (npm run dev:all) needs no Google identity token; never reach for gcloud or the metadata server for it. */
export function isLoopbackUrl(url) {
  try { return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname); } catch { return false; }
}

export function mountQlooProxy(app, { gatewayUrl, getToken, fetchImpl = fetch, collabDevUrl, segmentsTimeoutMs = 55000 }) {
  const notConfigured = (res) => res.status(503).json({ error: "Qloo gateway not configured" });

  async function forward(req, res, { route, path, method, body, stream, dev, timeoutMs }) {
    // dev: the COLLAB_FAKE in-memory server (never set in production): no gateway and no token needed.
    const base = dev ? collabDevUrl : gatewayUrl;
    if (!base) return notConfigured(res);
    const local = dev || isLoopbackUrl(base);
    const sessionId = req.header("x-session-id");
    if (!sessionId || sessionId.length > 128) {
      return res.status(400).json({ error: "x-session-id header required (1-128 chars)" });
    }
    const controller = new AbortController();
    res.on("close", () => controller.abort());
    // Per-route cap (above the gateway's own deadline): a hung upstream becomes a 504 the client can show, not an endless wait.
    let timedOut = false;
    const timer = timeoutMs ? setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs) : undefined;
    res.on("close", () => clearTimeout(timer));
    const fail = (err) => {
      clearTimeout(timer);
      if (timedOut && !res.headersSent) return res.status(504).json({ status: "unavailable", reason: "timeout", message: "This took too long. Try again.", indexes: {}, bands: [] });
      if (!controller.signal.aborted) console.error("[qlooProxy]", route, err?.message ?? String(err));
      if (!res.headersSent) res.status(502).json({ error: "Qloo gateway unavailable" });
      else res.end();
    };
    try {
      const upstream = await fetchImpl(`${base}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          ...(local ? {} : { authorization: `Bearer ${await getToken()}` }),
          "x-session-id": sessionId,
          // Our own test traffic (e2e, smoke): the gateway keeps it out of the analytics.
          ...(req.header("x-tiq-test") === "1" ? { "x-tiq-test": "1" } : {}),
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const type = upstream.headers.get("content-type") ?? "";
      if (stream && upstream.ok && type.includes("text/event-stream") && upstream.body) {
        res.status(200).set({ "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" });
        res.flushHeaders();
        Readable.fromWeb(upstream.body).on("error", fail).pipe(res);
        return;
      }
      const text = await upstream.text();
      clearTimeout(timer);
      if (!upstream.ok && !type.includes("json")) return res.status(upstream.status).json({ error: "Qloo gateway unavailable" });
      res.status(upstream.status).type(type.includes("json") ? "application/json" : "text/plain").send(text);
    } catch (err) {
      fail(err);
    }
  }

  const PLAYBOOK_PARAMS = ["artist", "artistEntityId", "artistPopularity", "city", "country", "narrative", "cityId", "lat", "lon"];

  app.post("/api/qloo/tour-board", (req, res) => forward(req, res, { route: "tour-board", path: "/v1/tour-board", method: "POST", body: req.body ?? {}, stream: true }));
  // Strategist chat: cheap shape checks here, full validation at the gateway.
  // Private documents (text only, up to 60,000 characters) make a larger body legitimate for this route alone.
  const MAX_STRATEGIST_BYTES = 64 * 1024;
  const MAX_STRATEGIST_DOCS_BYTES = 150 * 1024;
  app.post(STRATEGIST_PATH, express.json({ limit: "200kb" }), (req, res) => {
    const body = req.body ?? {};
    if (!Array.isArray(body.messages) || body.messages.length > 12) return res.status(400).json({ error: "messages must be an array of at most 12" });
    const max = Array.isArray(body.documents) && body.documents.length > 0 ? MAX_STRATEGIST_DOCS_BYTES : MAX_STRATEGIST_BYTES;
    if (Buffer.byteLength(JSON.stringify(body)) > max) return res.status(400).json({ error: "request too large" });
    return forward(req, res, { route: "strategist", path: "/v1/strategist", method: "POST", body, stream: true });
  });
  // Without-Qloo generic ranking: small JSON body, full validation at the gateway.
  const MAX_WITHOUT_QLOO_BYTES = 16 * 1024;
  app.post("/api/qloo/without-qloo", (req, res) => {
    const body = req.body ?? {};
    if (Buffer.byteLength(JSON.stringify(body)) > MAX_WITHOUT_QLOO_BYTES) return res.status(400).json({ error: "request too large" });
    return forward(req, res, { route: "without-qloo", path: "/v1/without-qloo", method: "POST", body });
  });
  app.get("/api/qloo/city-playbook", (req, res) => {
    const params = new URLSearchParams();
    for (const k of PLAYBOOK_PARAMS) if (typeof req.query[k] === "string") params.set(k, req.query[k]);
    const qs = params.toString();
    return forward(req, res, { route: "city-playbook", path: `/v1/city-playbook?${qs}`, method: "GET", stream: true });
  });
  const WEEK_PARAMS = ["city", "country", "start", "end"];
  app.get("/api/qloo/this-week", (req, res) => {
    const params = new URLSearchParams();
    for (const k of WEEK_PARAMS) {
      const v = req.query[k];
      if (typeof v !== "string" || !v || v.length > 80) return res.status(400).json({ error: "city, country, start, end required (≤ 80 chars)" });
      params.set(k, v);
    }
    return forward(req, res, { route: "this-week", path: `/v1/this-week?${params}`, method: "GET" });
  });
  // Advance & risks: same required params as this-week; artistCountry, lat and lon are optional.
  app.get("/api/qloo/advance", (req, res) => {
    const params = new URLSearchParams();
    for (const k of WEEK_PARAMS) {
      const v = req.query[k];
      if (typeof v !== "string" || !v || v.length > 80) return res.status(400).json({ error: "city, country, start, end required (≤ 80 chars)" });
      params.set(k, v);
    }
    const ac = req.query.artistCountry;
    if (ac !== undefined) {
      if (typeof ac !== "string" || ac.length > 80) return res.status(400).json({ error: "artistCountry must be ≤ 80 chars" });
      if (ac.trim()) params.set("artistCountry", ac.trim());
    }
    const { lat, lon } = req.query;
    if ((lat === undefined) !== (lon === undefined)) return res.status(400).json({ error: "lat and lon go together" });
    if (lat !== undefined) {
      const ok = (v, max) => typeof v === "string" && v !== "" && Number.isFinite(Number(v)) && Math.abs(Number(v)) <= max;
      if (!ok(lat, 90) || !ok(lon, 180)) return res.status(400).json({ error: "lat/lon out of range" });
      params.set("lat", lat);
      params.set("lon", lon);
    }
    const part = req.query.part;
    if (part !== undefined) {
      if (part !== "fast" && part !== "web") return res.status(400).json({ error: "part must be fast or web" });
      params.set("part", part);
    }
    return forward(req, res, { route: "advance", path: `/v1/advance?${params}`, method: "GET" });
  });
  // Sponsors by age group: GET with a short allowlist; the required ones are validated here, the optional city hints only forwarded when well formed.
  const SEGMENT_REQUIRED = ["artistId", "city", "country"];
  const SEGMENT_OPTIONAL = ["artist", "cityId", "lat", "lon"];
  app.get("/api/qloo/sponsor-segments", (req, res) => {
    const params = new URLSearchParams();
    for (const k of SEGMENT_REQUIRED) {
      const v = req.query[k];
      if (typeof v !== "string" || !v || v.length > 80) return res.status(400).json({ error: "artistId, city, country required (≤ 80 chars)" });
      params.set(k, v);
    }
    for (const k of SEGMENT_OPTIONAL) {
      const v = req.query[k];
      if (typeof v === "string" && v && v.length <= 80) params.set(k, v);
    }
    return forward(req, res, { route: "sponsor-segments", path: `/v1/sponsor-segments?${params}`, method: "GET", timeoutMs: segmentsTimeoutMs });
  });
  // Sponsors: the same model without Qloo. Lazy GET; same hint allowlist and the long forward timeout of sponsor-segments.
  app.get("/api/qloo/sponsors-without-qloo", (req, res) => {
    const params = new URLSearchParams();
    for (const k of ["artist", "artistId", "city", "country"]) {
      const v = req.query[k];
      if (typeof v !== "string" || !v || v.length > 80) return res.status(400).json({ error: "artist, artistId, city, country required (≤ 80 chars)" });
      params.set(k, v);
    }
    for (const k of ["cityId", "lat", "lon"]) {
      const v = req.query[k];
      if (typeof v === "string" && v && v.length <= 80) params.set(k, v);
    }
    return forward(req, res, { route: "sponsors-without-qloo", path: `/v1/sponsors-without-qloo?${params}`, method: "GET", timeoutMs: segmentsTimeoutMs });
  });
  // Optional BigQuery analytics: read-only stats (answer {enabled:false} when the gateway has it off) and the /v2 prototype tap.
  for (const name of ["trust", "team", "v2"]) {
    app.get(`/api/qloo/stats/${name}`, (req, res) => !gatewayUrl && req.header("x-session-id") ? res.json({ enabled: false }) : forward(req, res, { route: `stats-${name}`, path: `/v1/stats/${name}`, method: "GET" }));
  }
  const MAX_TAP_BYTES = 1024;
  const TAP_ACTIONS = new Set(["going", "waitlist", "was_there"]);
  app.post("/api/qloo/v2/tap", (req, res) => {
    const body = req.body ?? {};
    if (Buffer.byteLength(JSON.stringify(body)) > MAX_TAP_BYTES) return res.status(400).json({ error: "request too large" });
    if (typeof body.action !== "string" || !TAP_ACTIONS.has(body.action)) return res.status(400).json({ error: "action must be going, waitlist or was_there" });
    if (body.experience !== undefined && (typeof body.experience !== "string" || !/^[a-z0-9_]{1,40}$/.test(body.experience))) return res.status(400).json({ error: "experience must be a short id" });
    return forward(req, res, { route: "v2-tap", path: "/v1/v2/tap", method: "POST", body: { action: body.action, ...(body.experience !== undefined ? { experience: body.experience } : {}) } });
  });
  // Spec §8: raw Qloo tools are never exposed publicly — only the compare panel's tool is reachable.
  const PUBLIC_TOOLS = new Set(["qloo_compare_audiences"]);
  const MAX_GROUP = 3;

  app.post("/api/qloo/tools/:name", (req, res) => {
    if (!PUBLIC_TOOLS.has(req.params.name)) return res.status(404).json({ error: "Unknown tool" });
    const body = req.body ?? {};
    for (const k of ["group_a", "group_b"]) {
      if (Array.isArray(body[k]) && body[k].length > MAX_GROUP) return res.status(400).json({ error: "group_a and group_b allow at most 3 entries" });
    }
    return forward(req, res, { route: "tools", path: `/v1/tools/${encodeURIComponent(req.params.name)}`, method: "POST", body, stream: false });
  });

  // Team workspaces: small JSON bodies, ws id checked here, full validation at the gateway.
  const MAX_WS_BYTES = 8 * 1024;
  const MAX_WS_SEED_BYTES = 40 * 1024; // a create may carry the demo seed (about 60 short notes)
  const WS_ID = /^[A-Za-z0-9_-]{10,64}$/;
  const WS_OPS = ["status", "message", "resolve", "override", "override/clear", "lead", "lead/remove"];
  const sized = (req, res, max = MAX_WS_BYTES) => {
    const body = req.body ?? {};
    if (Buffer.byteLength(JSON.stringify(body)) > max) { res.status(400).json({ error: "request too large" }); return null; }
    return body;
  };
  const wsDev = Boolean(collabDevUrl);
  app.post("/api/qloo/ws", (req, res) => {
    const body = sized(req, res, MAX_WS_SEED_BYTES);
    if (body === null) return undefined;
    return forward(req, res, { route: "ws-create", path: "/v1/ws", method: "POST", body, dev: wsDev });
  });
  app.get("/api/qloo/ws/:ws", (req, res) => {
    if (!WS_ID.test(req.params.ws)) return res.status(400).json({ error: "ws is invalid" });
    return forward(req, res, { route: "ws-get", path: `/v1/ws/${req.params.ws}`, method: "GET", dev: wsDev });
  });
  for (const op of WS_OPS) {
    app.post(`/api/qloo/ws/:ws/${op}`, (req, res) => {
      if (!WS_ID.test(req.params.ws)) return res.status(400).json({ error: "ws is invalid" });
      const body = sized(req, res);
      if (body === null) return undefined;
      return forward(req, res, { route: `ws-${op}`, path: `/v1/ws/${req.params.ws}/${op}`, method: "POST", body, dev: wsDev });
    });
  }
}
