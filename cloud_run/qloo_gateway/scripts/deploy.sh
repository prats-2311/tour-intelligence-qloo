#!/usr/bin/env bash
set -euo pipefail
PROJECT=liifecalling-academy
REGION=us-central1
SA=qloo-gateway-sa@${PROJECT}.iam.gserviceaccount.com

# Fail fast, before any mutation.
gcloud secrets describe qloo-api-key --project "$PROJECT" >/dev/null || { echo "Create the qloo-api-key secret first (see CLAUDE.md)"; exit 1; }

gcloud iam service-accounts describe "$SA" --project "$PROJECT" >/dev/null 2>&1 || \
  gcloud iam service-accounts create qloo-gateway-sa --project "$PROJECT" --display-name "qloo_gateway"
gcloud services enable firestore.googleapis.com --project "$PROJECT"
TYPE=$(gcloud firestore databases describe --database="(default)" --project "$PROJECT" --format='value(type)' 2>/dev/null || true)
if [ -z "$TYPE" ]; then
  gcloud firestore databases create --database="(default)" --location=nam5 --type=firestore-native --project "$PROJECT"
elif [ "$TYPE" != "FIRESTORE_NATIVE" ]; then
  echo "Existing (default) database is $TYPE, not Firestore Native — stop and ask Prateek"
  exit 1
fi
# Re-runnable: enabling TTL when already enabled can error, so tolerate that.
gcloud firestore fields ttls update expireAt --collection-group=qloo_cache --enable-ttl --project "$PROJECT" --quiet \
  || echo "TTL already configured (or update in progress)"
gcloud secrets add-iam-policy-binding qloo-api-key --project "$PROJECT" --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor
# Project-level: Firestore's default database has no resource-level IAM binding.
gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" --role roles/datastore.user --condition=None

gcloud run deploy qloo-gateway --source "$(dirname "$0")/.." --region "$REGION" --project "$PROJECT" \
  --service-account "$SA" --no-allow-unauthenticated --min-instances 1 --max-instances 3 --memory 1Gi \
  --set-secrets QLOO_API_KEY=qloo-api-key:latest --set-env-vars QLOO_CACHE_BACKEND=firestore,QLOO_DAILY_CEILING=2000
