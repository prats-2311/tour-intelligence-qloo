#!/usr/bin/env bash
# One-time operator setup for the gateway's optional BigQuery analytics. Run by Prateek (not by agents, not at runtime).
# Re-runnable: existing datasets and tables are left alone. Then redeploy with scripts/deploy.sh, which sets BQ_DATASET.
set -euo pipefail
PROJECT=liifecalling-academy
LOCATION=us-central1
DATASET=${BQ_DATASET:-tour_intel}
SA=qloo-gateway-sa@${PROJECT}.iam.gserviceaccount.com
HERE="$(cd "$(dirname "$0")" && pwd)"

gcloud services enable bigquery.googleapis.com --project "$PROJECT"

# Dataset, in the same region as the gateway.
bq --project_id="$PROJECT" show --dataset "${PROJECT}:${DATASET}" >/dev/null 2>&1 || \
  bq --project_id="$PROJECT" --location="$LOCATION" mk --dataset --description "Tour Intelligence analytics: counts and metadata only, no Qloo data" "${PROJECT}:${DATASET}"

# Tables: schemas in scripts/bq_schemas/*.json (kept equal to src/analytics/bigquery.ts by a test), partitioned by day on ts.
for TABLE in playbook_runs team_events v2_outcome_taps; do
  bq --project_id="$PROJECT" show --table "${PROJECT}:${DATASET}.${TABLE}" >/dev/null 2>&1 || \
    bq --project_id="$PROJECT" mk --table --time_partitioning_type=DAY --time_partitioning_field=ts "${PROJECT}:${DATASET}.${TABLE}" "$HERE/bq_schemas/${TABLE}.json"
done

# IAM for the gateway's service account.
# Dataset level: WRITER on a dataset is roles/bigquery.dataEditor (insert rows, read them back). Added to the dataset's access list; existing entries are kept.
TMP=$(mktemp)
bq --project_id="$PROJECT" show --format=prettyjson "${PROJECT}:${DATASET}" > "$TMP"
python3 - "$TMP" "$SA" <<'PY'
import json, sys
path, sa = sys.argv[1:]
d = json.load(open(path))
entry = {"role": "WRITER", "userByEmail": sa}
if entry not in d.setdefault("access", []):
    d["access"].append(entry)
json.dump(d, open(path, "w"))
PY
bq --project_id="$PROJECT" update --source "$TMP" "${PROJECT}:${DATASET}"
rm -f "$TMP"
# Project level: running query jobs (the stats routes).
gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" --role roles/bigquery.jobUser --condition=None

echo "Done. Redeploy with scripts/deploy.sh (it sets BQ_DATASET=${DATASET})."
