#!/usr/bin/env bash
# Builds and starts the web app against the Firebase emulators, then runs the auth e2e check.
# Run via: npx firebase-tools emulators:exec --project demo-calendar-sync --only auth,firestore "bash apps/web/scripts/e2e.sh"
set -euo pipefail
cd "$(dirname "$0")/.."

export APP_ENV=test OAUTH_MOCK=1 APP_URL=http://localhost:3000 GCLOUD_PROJECT=demo-calendar-sync FIREBASE_API_KEY=fake-api-key
export TOKEN_ENC_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
: "${FIREBASE_AUTH_EMULATOR_HOST:?run inside firebase emulators:exec}" "${FIRESTORE_EMULATOR_HOST:?run inside firebase emulators:exec}"

if curl -s -o /dev/null http://localhost:3000; then echo "port 3000 is already in use; stop that server first" >&2; exit 1; fi
[ -d .next ] || npm run build
LOG="${TMPDIR:-/tmp}/next-e2e.log"
./node_modules/.bin/next start -p 3000 > "$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -sf http://localhost:3000/api/health >/dev/null && break; sleep 1; done
node scripts/e2e-auth.mjs || { echo "--- next log ---"; tail -50 "$LOG"; exit 1; }
