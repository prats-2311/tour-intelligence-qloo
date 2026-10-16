#!/usr/bin/env bash
set -euo pipefail
DATASET="${1:?usage: apply_migration.sh <dataset> <file.sql>}"
FILE="${2:?usage: apply_migration.sh <dataset> <file.sql>}"
# Bare dataset ids only: no project prefix (. or :), slashes or spaces, which would
# both dodge the guard below and break the sed substitution.
if [[ ! "$DATASET" =~ ^[A-Za-z0-9_]+$ ]]; then echo "Refusing: dataset must be a bare id (letters, digits, underscore)"; exit 1; fi
# tour_intelligence is shared with the original Google-hackathon project: only with ALLOW_SHARED_DATASET=1 (exactly).
if [ "$(printf '%s' "$DATASET" | tr '[:upper:]' '[:lower:]')" = "tour_intelligence" ] && [ "${ALLOW_SHARED_DATASET:-}" != "1" ]; then
  echo "Refusing: tour_intelligence belongs to the original Google-hackathon project"; exit 1
fi
sed "s/{{DATASET}}/${DATASET}/g" "$FILE" | bq query --use_legacy_sql=false
