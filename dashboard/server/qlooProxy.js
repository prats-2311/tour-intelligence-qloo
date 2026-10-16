import { Readable } from "node:stream";

export function mountQlooProxy(app, { gatewayUrl, getToken, fetchImpl = fetch }) {
  const notConfigured = (res) => res.status(503).json({ error: "Qloo gateway not configured" });

  async function forward(req, res, { route, path, method, body, stream }) {
    if (!gatewayUrl) return notConfigured(res);
    const sessionId = req.header("x-session-id");
    if (!sessionId || sessionId.length > 128) {
      return res.status(400).json({ error: "x-session-id header required (1-128 chars)" });
    }
    const controller = new AbortController();
    res.on("close", () => controller.abort());
    const fail = (err) => {
      if (!controller.signal.aborted) console.error("[qlooProxy]", route, err?.message ?? String(err));
      if (!res.headersSent) res.status(502).json({ error: "Qloo gateway unavailable" });
      else res.end();
    };
    try {
      const upstream = await fetchImpl(`${gatewayUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${await getToken()}`,
          "x-session-id": sessionId,
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
      res.status(upstream.status).type(type.includes("json") ? "application/json" : "text/plain").send(text);
    } catch (err) {
      fail(err);
    }
  }

  const PLAYBOOK_PARAMS = ["artist", "artistEntityId", "city", "country"];

  app.post("/api/qloo/tour-board", (req, res) => forward(req, res, { route: "tour-board", path: "/v1/tour-board", method: "POST", body: req.body ?? {}, stream: true }));
  app.get("/api/qloo/city-playbook", (req, res) => {
    const params = new URLSearchParams();
    for (const k of PLAYBOOK_PARAMS) if (typeof req.query[k] === "string") params.set(k, req.query[k]);
    const qs = params.toString();
    return forward(req, res, { route: "city-playbook", path: `/v1/city-playbook?${qs}`, method: "GET", stream: true });
  });
  app.post("/api/qloo/tools/:name", (req, res) => forward(req, res, { route: "tools", path: `/v1/tools/${encodeURIComponent(req.params.name)}`, method: "POST", body: req.body ?? {}, stream: false }));
}
