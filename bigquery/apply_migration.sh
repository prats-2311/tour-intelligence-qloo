#!/usr/bin/env bash
set -euo pipefail
DATASET="${1:?usage: apply_migration.sh <dataset> <file.sql>}"
FILE="${2:?usage: apply_migration.sh <dataset> <file.sql>}"
if [ "$DATASET" = "tour_intelligence" ]; then echo "Refusing: tour_intelligence belongs to the original Google-hackathon project"; exit 1; fi
sed "s/{{DATASET}}/${DATASET}/g" "$FILE" | bq query --use_legacy_sql=false
