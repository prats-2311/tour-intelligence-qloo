import express from "express";
import { isLoopbackUrl } from "./qlooProxy.js";

const TOUR_ID = /^[A-Za-z0-9_-]{8,40}$/;
const toursJson = express.json({ limit: "5mb" });

/**
 * Saved tours: /api/owners and /api/tours* forward to the gateway's /v1/owners and /v1/tours*.
 * The gateway is IAM-private, so `Authorization` is this server's identity token; the browser's anonymous owner token
 * travels in its own `x-tiq-owner` header. Mount BEFORE the app-wide JSON parser and before the legacy `mountTours`
 * (Save as campaign): `POST /api/tours` is handled here only when `x-tiq-owner` is present, otherwise it falls through.
 * `devUrl` is the COLLAB_FAKE in-memory server (never set in production); it serves these routes too.
 */
export function mountSavedTours(app, { gatewayUrl, getToken, fetchImpl = fetch, devUrl }) {
  async function forward(req, res, { path, method, body, client }) {
    const base = devUrl || gatewayUrl;
    if (!base) return res.status(503).json({ error: "Qloo gateway not configured" });
    const local = Boolean(devUrl) || isLoopbackUrl(base);
    const sessionId = req.header("x-session-id");
    const controller = new AbortController();
    res.on("close", () => controller.abort());
    try {
      const owner = req.header("x-tiq-owner");
      const upstream = await fetchImpl(`${base}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          ...(local ? {} : { authorization: `Bearer ${await getToken()}` }),
          ...(sessionId && sessionId.length <= 128 ? { "x-session-id": sessionId } : {}),
          ...(owner ? { "x-tiq-owner": owner } : {}),
          // Only owner creation is limited per browser address, and the browser can never choose it: any incoming x-tiq-client is ignored.
          ...(client ? { "x-tiq-client": client } : {}),
          ...(req.header("x-tiq-test") === "1" ? { "x-tiq-test": "1" } : {}),
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      if (upstream.status === 204) return res.status(204).end();
      const type = upstream.headers.get("content-type") ?? "";
      const text = await upstream.text();
      if (!upstream.ok && !type.includes("json")) return res.status(502).json({ error: "gateway unavailable" });
      res.status(upstream.status).type(type.includes("json") ? "application/json" : "text/plain").send(text);
    } catch (err) {
      if (!controller.signal.aborted) console.error("[savedTours]", err?.message ?? String(err));
      if (!res.headersSent) res.status(502).json({ error: "Qloo gateway unavailable" });
      else res.end();
    }
  }
  const validId = (req, res) => {
    if (TOUR_ID.test(req.params.id)) return true;
    res.status(400).json({ error: "id is invalid" });
    return false;
  };

  // Cloud Run sets x-forwarded-for; the first entry is the browser address (the gateway only sees this server).
  const clientAddress = (req) => (req.header("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 128) || String(req.ip ?? "");
  app.post("/api/owners", (req, res) => forward(req, res, { path: "/v1/owners", method: "POST", client: clientAddress(req) }));
  app.post("/api/tours", (req, res, next) => (req.header("x-tiq-owner") ? next() : next("route")), toursJson, (req, res) => forward(req, res, { path: "/v1/tours", method: "POST", body: req.body ?? {} }));
  app.get("/api/tours", (req, res) => {
    const params = new URLSearchParams();
    for (const k of ["q", "status"]) if (typeof req.query[k] === "string" && req.query[k]) params.set(k, req.query[k].slice(0, 200));
    const qs = params.toString();
    return forward(req, res, { path: `/v1/tours${qs ? `?${qs}` : ""}`, method: "GET" });
  });
  app.get("/api/tours/:id", (req, res) => validId(req, res) && forward(req, res, { path: `/v1/tours/${req.params.id}`, method: "GET" }));
  app.patch("/api/tours/:id", (req, res, next) => (validId(req, res) ? next() : undefined), toursJson, (req, res) => forward(req, res, { path: `/v1/tours/${req.params.id}`, method: "PATCH", body: req.body ?? {} }));
  app.delete("/api/tours/:id", (req, res) => validId(req, res) && forward(req, res, { path: `/v1/tours/${req.params.id}`, method: "DELETE" }));
  // Body-parser failures on the routes above: JSON, never an HTML page or stack.
  app.use((err, req, res, next) => {
    if (err?.type === "entity.too.large") return res.status(413).json({ error: "tour too large" });
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "invalid JSON" });
    return next(err);
  });
}
