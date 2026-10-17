#!/usr/bin/env bash
# Fails if Qloo response data is tracked (Qloo dev guide: "Do not store Qloo response data in a public repository").
#
#   scripts/check-public-data.sh                    check the working tree's tracked files (default repo: .)
#   scripts/check-public-data.sh --history <repo>   also scan every blob reachable from any ref (path + content)
#
# Exit 0 = clean. Exit 1 = offending paths / files listed. Real Qloo entity ids are UPPERCASE-hex UUIDs
# (e.g. in describe.json "entity_id"); synthetic fixtures use the 00000000- prefix and are allowed.
set -euo pipefail

FORBIDDEN_PATHS='(^|/)(fixtures/showcase\.json|fixtures/backtest\.json|backtest/results[^/]*\.json|test/fixtures/calibration/|private-data/)'
# Case-insensitive: real Qloo ids are uppercase, but a lowercased copy is the same data.
UUID_RE='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
# Allowed ids (matched on the id itself, case-insensitively):
#  - 00000000-...   synthetic ids from the fixture generators
#  - 672c258a-...   Dialogflow CX agent id (agent_builder/CLAUDE.md, orchestration_driver/run_campaign.py); not Qloo data
ALLOW_RE='^(00000000-|672c258a-7d63-4164-a4c6-a34f17490f53$)'

mode=tree
if [[ "${1:-}" == "--history" ]]; then
  mode=history
  repo="${2:-.}"
else
  repo="${1:-.}"
fi

bad=""
ids=""
if [[ "$mode" == "history" ]]; then
  # rev-list --objects names a blob once (its first path), so a renamed file hides its old path; the log
  # listing (--no-renames, every ref) adds every path that ever appeared in any commit.
  bad=$({ git -C "$repo" rev-list --objects --all | awk 'NF>1 {sub(/^[^ ]+ /,""); print}'
          git -C "$repo" log --all --no-renames --name-only --format= ; } | grep -E "$FORBIDDEN_PATHS" | sort -u || true)
  # Content scan: one pass per distinct blob (git grep over every commit re-reads shared blobs; cat-file --batch reads each once).
  scan_blob() {
    local sha="$1" path="$2" hit
    hit=$(git -C "$repo" cat-file blob "$sha" | grep -a -o -i -E "$UUID_RE" | grep -v -i -E "$ALLOW_RE" | head -1 || true)
    if [[ -n "$hit" ]]; then echo "$path: $hit"; fi
    return 0
  }
  ids=$(git -C "$repo" rev-list --objects --all \
    | git -C "$repo" cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' \
    | awk '$1=="blob" {print $2" "$4}' | sort -u -k1,1 \
    | while read -r sha path; do scan_blob "$sha" "$path"; done | sort -u | head -200 || true)
else
  bad=$(git -C "$repo" ls-files | grep -E "$FORBIDDEN_PATHS" || true)
  ids=$(git -C "$repo" grep -I -o -n -i -E "$UUID_RE" -- . ':!*package-lock.json' ':!*.png' 2>/dev/null \
    | awk -F: '{id=$3; print $1"\t"id}' | while IFS=$'\t' read -r f id; do printf '%s\n' "$id" | grep -q -i -E "$ALLOW_RE" || printf '%s:%s:%s\n' "$f" 0 "$id"; done \
    | awk -F: '{print $1": "$3}' | sort -u -t: -k1,1 || true)
fi

if [[ -n "$bad$ids" ]]; then
  echo "Qloo data found (Qloo terms forbid storing responses in a public repo):"
  [[ -n "$bad" ]] && { echo "-- forbidden paths:"; printf '%s\n' "$bad"; }
  [[ -n "$ids" ]] && { echo "-- real-looking Qloo entity ids in:"; printf '%s\n' "$ids"; }
  exit 1
fi
echo "public-data check: clean"
