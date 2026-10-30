#!/usr/bin/env bash
# Operator script (run by Prateek, not by agents, not at runtime): adds the nullable BOOL column `test` to the three existing analytics tables.
# Idempotent: a table that already has the column is skipped. Fresh tables made by bq_setup.sh already include it.
# Existing rows get NULL, which the stats queries count as real traffic; delete pre-column test rows by hand if they matter (see CLAUDE.md, Analytics).
set -euo pipefail
PROJECT=liifecalling-academy
DATASET=${BQ_DATASET:-tour_intel}

for TABLE in playbook_runs team_events v2_outcome_taps; do
  REF="${PROJECT}:${DATASET}.${TABLE}"
  TMP=$(mktemp)
  bq --project_id="$PROJECT" show --schema --format=prettyjson "$REF" > "$TMP"
  if python3 - "$TMP" <<'PY'
import json, sys
fields = json.load(open(sys.argv[1]))
if any(f["name"] == "test" for f in fields):
    sys.exit(0)
fields.append({"name": "test", "type": "BOOL", "mode": "NULLABLE"})
json.dump(fields, open(sys.argv[1], "w"))
sys.exit(1)
PY
  then
    echo "${TABLE}: already has test, skipped"
  else
    bq --project_id="$PROJECT" update "$REF" "$TMP"
    echo "${TABLE}: added test BOOL"
  fi
  rm -f "$TMP"
done
