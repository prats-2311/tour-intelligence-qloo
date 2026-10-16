// "Save as campaign" for live Qloo tours. callTool resolves { status, json } so
// validation errors (400) reach the browser intact; everything else is a 502.
export function mountTours(app, { callTool }) {
  app.post("/api/tours", async (req, res) => {
    const { source, ...body } = req.body ?? {};
    // Sample tours are fictional showcase data: they never write to BigQuery.
    if (source === "sample") return res.status(403).json({ error: "Sample tours can't be saved" });
    try {
      const { status, json } = await callTool("/qloo_tours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (status === 201 || status === 400) return res.status(status).json(json);
      return res.status(502).json({ error: json?.error ?? "tour_data_api error" });
    } catch (err) {
      console.error("[tours]", err?.message ?? String(err));
      return res.status(502).json({ error: "tour_data_api unavailable" });
    }
  });
}
