#!/usr/bin/env bash
# Deploys the public MCP demo as a NEW service. Run by Prateek, never by an agent.
# Usage: deploy_public.sh <QLOO_GATEWAY_URL>
set -euo pipefail
PROJECT=liifecalling-academy
REGION=us-central1
SERVICE=${PUBLIC_SERVICE_NAME:-tour-intel-mcp-public}
SA_NAME=tour-intel-mcp-public-sa
SA=${SA_NAME}@${PROJECT}.iam.gserviceaccount.com
GATEWAY_URL=${1:-}

if [ -z "$GATEWAY_URL" ]; then
  echo "Usage: $0 <QLOO_GATEWAY_URL>   (e.g. the qloo-gateway Cloud Run URL; required, no default)"
  exit 1
fi
GATEWAY_URL=${GATEWAY_URL%/}

# Never overwrite one of the original services.
case "$SERVICE" in
  agent-mcp-server|tour-data-api|tour-dashboard|delight-card-renderer)
    echo "Refusing to deploy over existing service '$SERVICE'"; exit 1 ;;
esac

# Dedicated identity for the public service (never the private agent-mcp-server-sa): created if missing,
# and its only grant is run.invoker on qloo-gateway.
if ! gcloud iam service-accounts describe "$SA" --project "$PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" --project "$PROJECT" \
    --display-name "Public MCP demo (taste tools only)"
fi

# Resource-level: the public service's SA may call the gateway (the gateway stays IAM-gated).
gcloud run services add-iam-policy-binding qloo-gateway --project "$PROJECT" --region "$REGION" \
  --member "serviceAccount:$SA" --role roles/run.invoker

gcloud run deploy "$SERVICE" --source "$(dirname "$0")/.." --region "$REGION" --project "$PROJECT" \
  --service-account "$SA" --allow-unauthenticated --max-instances 2 \
  --set-env-vars "MCP_PUBLIC=1,QLOO_GATEWAY_URL=${GATEWAY_URL}"

URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT" --format='value(status.url)')
echo "MCP endpoint: ${URL}/mcp"
echo "Connect: claude mcp add --transport http tour-intel ${URL}/mcp"
