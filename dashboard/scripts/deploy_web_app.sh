#!/usr/bin/env bash
# Run by Prateek, never by agents. Publishes https://<site>.web.app as a short link (302) to the Cloud Run dashboard.
# The site id lives only in firebase.json ("hosting.site"); if it is taken, edit it there.
set -euo pipefail
PROJECT=liifecalling-academy
cd "$(dirname "$0")/../.."
SITE=$(node -p "require('./firebase.json').hosting.site")
FB="npx firebase-tools@14"
if ! OUT=$($FB hosting:sites:create "$SITE" --project "$PROJECT" 2>&1); then
  if printf '%s' "$OUT" | grep -qi "already exists"; then echo "Site $SITE already exists, continuing"; else printf '%s\n' "$OUT"; exit 1; fi
fi
$FB deploy --only hosting --project "$PROJECT"
echo "https://${SITE}.web.app"
