#!/usr/bin/env bash
# Runs the full test suite: Python services (sdk/, cloud_run/*, orchestration_driver/)
# via pytest, and the dashboard's pure-logic tests via vitest.
set -euo pipefail
cd "$(dirname "$0")"

echo "=== Python test suite (pytest) ==="
if [ ! -d .venv ]; then
  echo "No .venv found — create one first:"
  echo "  python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt"
  exit 1
fi
.venv/bin/pytest "$@"

echo ""
echo "=== Dashboard test suite (vitest) ==="
(cd dashboard && npm test)

echo ""
echo "=== qloo_gateway test suite (vitest) ==="
(cd cloud_run/qloo_gateway && npm test)

echo ""
echo "=== public-data guard (no Qloo response data tracked) ==="
bash scripts/check-public-data.sh

echo ""
echo "=== public-data guard tests ==="
bash scripts/test-check-public-data.sh

echo ""
echo "=== graft freshness ==="
if command -v graft >/dev/null 2>&1 && [ -d graft ]; then
  graft check
else
  echo "graft not installed or graft/ not built — skipping freshness check"
fi
