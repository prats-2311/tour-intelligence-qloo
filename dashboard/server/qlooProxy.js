import { Readable } from "node:stream";

export function mountQlooProxy(app, { gatewayUrl, getToken, fetchImpl = fetch }) {
  const notConfigured = (res) => res.status(503).json({ error: "Qloo gateway not configured" });

  async function forward(req, res, { path, method, body, stream }) {
    if (!gatewayUrl) return notConfigured(res);
    const controller = new AbortController();
    res.on("close", () => controller.abort());
    let upstream;
    try {
      upstream = await fetchImpl(`${gatewayUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${await getToken()}`,
          "x-session-id": req.header("x-session-id") ?? "",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      if (!res.headersSent) res.status(502).json({ error: "Qloo gateway unavailable" });
      return;
    }
    const type = upstream.headers.get("content-type") ?? "";
    if (stream && upstream.ok && type.includes("text/event-stream") && upstream.body) {
      res.status(200).set({ "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" });
      res.flushHeaders();
      Readable.fromWeb(upstream.body).on("error", () => res.end()).pipe(res);
      return;
    }
    const text = await upstream.text();
    res.status(upstream.status).type(type.includes("json") ? "application/json" : "text/plain").send(text);
  }

  app.post("/api/qloo/tour-board", (req, res) => forward(req, res, { path: "/v1/tour-board", method: "POST", body: req.body ?? {}, stream: true }));
  app.get("/api/qloo/city-playbook", (req, res) => {
    const qs = new URLSearchParams(req.query).toString();
    return forward(req, res, { path: `/v1/city-playbook?${qs}`, method: "GET", stream: true });
  });
  app.post("/api/qloo/tools/:name", (req, res) => forward(req, res, { path: `/v1/tools/${encodeURIComponent(req.params.name)}`, method: "POST", body: req.body ?? {}, stream: false }));
}
