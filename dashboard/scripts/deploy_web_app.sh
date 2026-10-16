#!/usr/bin/env bash
# Run by Prateek, never by agents. Fronts Cloud Run service tour-intel-qloo with Firebase Hosting.
# If the site id is taken, pick another and edit it here and in .firebaserc.
set -euo pipefail
PROJECT=liifecalling-academy
SITE=tour-intel-qloo
cd "$(dirname "$0")/../.."
npx firebase-tools@latest hosting:sites:create "$SITE" --project "$PROJECT" || true
npx firebase-tools@latest deploy --only hosting --project "$PROJECT"
echo "https://${SITE}.web.app"
