// Everything under /api except the Qloo proxy talks to tour_data_api. With no URL configured
// (there is deliberately no default) those routes answer 503 instead of calling out.
export const NOT_CONFIGURED = "tour_data_api not configured";

export function requireTourDataApi(url) {
  return (req, res, next) => {
    if (url) return next();
    const p = `${req.baseUrl}${req.path}`;
    if (!p.startsWith("/api/") || p.startsWith("/api/qloo/") || p.startsWith("/api/recordings/")) return next();
    res.status(503).json({ error: NOT_CONFIGURED });
  };
}
