# Legacy proxy fail-closed report

Status: done. Test files 90/90, tests 999/999 (includes 11 new in dashboard/server/legacyFailClosed.test.js); tsc and build clean; check-public-data clean.

## Findings
- server/index.js already had the fail-closed code: `app.use(requireTourDataApi(TOUR_DATA_API))` (line 342) is app-wide for every /api path except /api/qloo/ and /api/recordings/, mounted before all legacy routes. With the URL unset every legacy route returns 503 `tour_data_api not configured`. The new test passed on first run, so there was no red step. The real gap was the deploy script, which kept the URLs set on the live service.
- Delight renderer (/api/tour-book, line ~575): behind the same guard, and also has its own 503 `delight renderer not configured`. No 500 or crash.
- Orchestrator job (POST /api/campaigns/:id/generate-briefs, line ~772): behind the same guard plus requireOrchestratorJob, which gives 503.
- Boot: no throw with all three unset. Module-level reads default to "". The test spawns the real index.js to prove it.
- Dead legacy route code: dashboard/server/index.js roughly lines 344-1033 (plus tour-book helpers). Left in place. Also callTool/token helpers lines 40-160.

## /api/tours
mountTours is mounted BEFORE the guard. POST /api/tours (the "Save as campaign" write) calls callTool("/qloo_tours"). callTool throws a 503 error when TOUR_DATA_API is unset, statusFromCallTool turns it into status 503, and the route returns 503 `{error:"tour_data_api not configured"}`. Source "sample" still returns 403 first. The Qloo tour flow (/api/qloo/*) is unaffected. The UI is not hidden; only the legacy save answers 503.

## Changes
- dashboard/scripts/deploy.sh: removed the three URL assignments and their --set-env-vars keys. Kept QLOO_GATEWAY_URL and RECORDINGS_BUCKET. Added a comment that --set-env-vars replaces the whole set. Not run.
- dashboard/server/legacyFailClosed.test.js: new.

## Concern
Live fix only takes effect when Prateek redeploys with the script (env set is replaced). Until then the live service still proxies.
