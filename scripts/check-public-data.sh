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
UUID_RE='[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}'
SYNTH_RE='^00000000-'

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
  bad=$(git -C "$repo" rev-list --objects --all | awk 'NF>1 {sub(/^[^ ]+ /,""); print}' | grep -E "$FORBIDDEN_PATHS" | sort -u || true)
  # Content scan: one pass per distinct blob (git grep over every commit re-reads shared blobs; cat-file --batch reads each once).
  scan_blob() {
    local sha="$1" path="$2" hit
    case "$path" in
      *package-lock.json | *.png | *.jpg | *.jpeg | *.gif | *.ico | *.pdf | *.woff*) return 0 ;;
    esac
    hit=$(git -C "$repo" cat-file blob "$sha" | grep -a -o -E "$UUID_RE" | grep -v -E "$SYNTH_RE" | head -1 || true)
    if [[ -n "$hit" ]]; then echo "$path: $hit"; fi
    return 0
  }
  ids=$(git -C "$repo" rev-list --objects --all \
    | git -C "$repo" cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' \
    | awk '$1=="blob" && $3 < 5000000 {print $2" "$4}' | sort -u -k1,1 \
    | while read -r sha path; do scan_blob "$sha" "$path"; done | sort -u | head -200 || true)
else
  bad=$(git -C "$repo" ls-files | grep -E "$FORBIDDEN_PATHS" || true)
  ids=$(git -C "$repo" grep -I -o -n -E "$UUID_RE" -- . ':!*package-lock.json' ':!*.png' 2>/dev/null \
    | grep -v -E ":${SYNTH_RE#^}" | awk -F: '{print $1": "$3}' | sort -u -t: -k1,1 || true)
fi

if [[ -n "$bad$ids" ]]; then
  echo "Qloo data found (Qloo terms forbid storing responses in a public repo):"
  [[ -n "$bad" ]] && { echo "-- forbidden paths:"; printf '%s\n' "$bad"; }
  [[ -n "$ids" ]] && { echo "-- real-looking Qloo entity ids in:"; printf '%s\n' "$ids"; }
  exit 1
fi
echo "public-data check: clean"
