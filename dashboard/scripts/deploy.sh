#!/usr/bin/env bash
# Run by Prateek, never by agents. Deploys the judge-facing dashboard.
set -euo pipefail
PROJECT=liifecalling-academy
REGION=us-central1
SERVICE="${SERVICE:-tour-intel-qloo}"
SA=dashboard-sa@${PROJECT}.iam.gserviceaccount.com
if [[ "$SERVICE" =~ ^tour-dashboard ]]; then echo "Refusing: tour-dashboard is the original Google-hackathon submission"; exit 1; fi
: "${QLOO_GATEWAY_URL:?set QLOO_GATEWAY_URL to the qloo-gateway Cloud Run URL (e.g. https://qloo-gateway-602700957663.us-central1.run.app)}"
TOUR_DATA_API_URL=https://tour-data-api-602700957663.us-central1.run.app
DELIGHT_RENDERER_URL=https://delight-card-renderer-602700957663.us-central1.run.app
ORCHESTRATOR_JOB_URL=https://run.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/jobs/tour-campaign-orchestrator:run

BUILD_ENV="PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1"
# VITE_WEBMCP_OT_TOKEN may hold several origin-trial tokens separated by SPACES (never commas: gcloud --set-build-env-vars splits on commas).
# vite.config.ts writes one <meta http-equiv="origin-trial"> per token. Example: VITE_WEBMCP_OT_TOKEN="tokenForOriginA tokenForOriginB" ./deploy.sh
[[ -n "${VITE_WEBMCP_OT_TOKEN:-}" ]] && BUILD_ENV="${BUILD_ENV},VITE_WEBMCP_OT_TOKEN=${VITE_WEBMCP_OT_TOKEN}"

gcloud run deploy "$SERVICE" --source="$(dirname "$0")/.." --region="$REGION" --project="$PROJECT" \
  --service-account="$SA" --set-build-env-vars="$BUILD_ENV" --allow-unauthenticated \
  --set-env-vars="TOUR_DATA_API_URL=${TOUR_DATA_API_URL},DELIGHT_RENDERER_URL=${DELIGHT_RENDERER_URL},QLOO_GATEWAY_URL=${QLOO_GATEWAY_URL},ORCHESTRATOR_JOB_URL=${ORCHESTRATOR_JOB_URL},RECORDINGS_BUCKET=liifecalling-academy-tour-intel-private"

echo "Note: the qloo-gateway Cloud Run service must already exist (deploy cloud_run/qloo_gateway/scripts/deploy.sh first)."
gcloud run services add-iam-policy-binding qloo-gateway --region="$REGION" --project="$PROJECT" \
  --member="serviceAccount:${SA}" --role=roles/run.invoker
