import express from "express";

// The Tour Book snapshot (board_json) may be up to 200000 characters, so this route
// carries its own parser and must be mounted before the app-wide 100 kb one.
const toursJson = express.json({ limit: "512kb" });

// callTool throws "<path> failed (<status>): <body>" on non-2xx. mountTours wants
// { status, json } so a 400 validation message reaches the browser intact.
export function statusFromCallTool(callTool) {
  return async (path, options) => {
    try {
      return { status: 201, json: await callTool(path, options) };
    } catch (err) {
      const m = /failed \((\d{3})\): ([\s\S]*)$/.exec(err?.message ?? "");
      if (!m) throw err;
      let json;
      try { json = JSON.parse(m[2]); } catch { json = { error: m[2] }; }
      return { status: Number(m[1]), json };
    }
  };
}

// "Save as campaign" for live Qloo tours. callTool resolves { status, json } so
// validation errors (400) reach the browser intact; everything else is a 502.
export function mountTours(app, { callTool }) {
  app.post("/api/tours", toursJson, async (req, res) => {
    const { source, ...body } = req.body ?? {};
    // Sample tours are fictional showcase data: they never write to BigQuery.
    if (source === "sample") return res.status(403).json({ error: "Sample tours can't be saved" });
    try {
      const { status, json } = await callTool("/qloo_tours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (status === 201 || status === 400 || status === 503) return res.status(status).json(json);
      return res.status(502).json({ error: json?.error ?? "tour_data_api error" });
    } catch (err) {
      console.error("[tours]", err?.message ?? String(err));
      return res.status(502).json({ error: "tour_data_api unavailable" });
    }
  });
}
