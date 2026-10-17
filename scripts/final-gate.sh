#!/usr/bin/env bash
# Final hard gate of make-public-clone.sh, run INSIDE the public clone: no skips, every object of every ref.
#   scripts/final-gate.sh [EXTRA_REPLACEMENTS_FILE]
# Exits 1 if a real-looking (non-allowlisted) UUID or any literal from EXTRA_REPLACEMENTS_FILE ("literal==>replacement") remains.
# Every grep stage that may legitimately match nothing is guarded: under pipefail an unguarded no-match would abort the
# script silently (and `grep -q` in a pipeline can SIGPIPE the producer and turn a real match into a false pass).
set -euo pipefail
EXTRA="${1:-}"
ALLOW_RE='^(00000000-|672c258a-7d63-4164-a4c6-a34f17490f53$)'
ID_RE='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
left=$( { git cat-file --batch-all-objects --batch | { grep -a -o -i -E "$ID_RE" || true; } | { grep -v -i -E "$ALLOW_RE" || true; } | sort -u | wc -l | tr -d ' '; } )
if [[ "$left" != 0 ]]; then echo "FINAL GATE FAILED: $left real-looking id(s) remain (objects incl. commit messages)" >&2; exit 1; fi
if [[ -n "$EXTRA" && -f "$EXTRA" ]]; then
  lit=$(mktemp); trap 'rm -f "$lit"' EXIT
  sed -n 's/==>.*//p' "$EXTRA" >"$lit"
  hits=0
  if [[ -s "$lit" ]]; then hits=$(git cat-file --batch-all-objects --batch | { grep -a -c -F -f "$lit" || true; }); fi
  if [[ "$hits" != 0 ]]; then echo "FINAL GATE FAILED: an extra literal remains" >&2; exit 1; fi
fi
echo "final gate: no real-looking ids in any object (no path or size skips)"
