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
      if (!upstream.ok && !type.includes("json")) return res.status(upstream.status).json({ error: "Qloo gateway unavailable" });
      res.status(upstream.status).type(type.includes("json") ? "application/json" : "text/plain").send(text);
    } catch (err) {
      fail(err);
    }
  }

  const PLAYBOOK_PARAMS = ["artist", "artistEntityId", "artistPopularity", "city", "country", "narrative", "cityId", "lat", "lon"];

  app.post("/api/qloo/tour-board", (req, res) => forward(req, res, { route: "tour-board", path: "/v1/tour-board", method: "POST", body: req.body ?? {}, stream: true }));
  // Strategist chat: cheap shape checks here, full validation at the gateway.
  const MAX_STRATEGIST_BYTES = 64 * 1024;
  app.post("/api/qloo/strategist", (req, res) => {
    const body = req.body ?? {};
    if (!Array.isArray(body.messages) || body.messages.length > 12) return res.status(400).json({ error: "messages must be an array of at most 12" });
    if (Buffer.byteLength(JSON.stringify(body)) > MAX_STRATEGIST_BYTES) return res.status(400).json({ error: "request too large" });
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
    return forward(req, res, { route: "sponsor-segments", path: `/v1/sponsor-segments?${params}`, method: "GET" });
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
}
