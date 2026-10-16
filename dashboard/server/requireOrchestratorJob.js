// The generate-briefs route triggers a Cloud Run job. There is deliberately no default job URL
// (the original hackathon orchestrator must never be run by accident): unset means 503.
export const JOB_NOT_CONFIGURED = "orchestrator job not configured";

export function requireOrchestratorJob(url) {
  return (_req, res, next) => {
    if (url) return next();
    res.status(503).json({ error: JOB_NOT_CONFIGURED });
  };
}
