#!/bin/sh
# Production launcher used by the login agent (see scripts/launchd.md).
# Runs the built app; builds first if no build is present yet.
set -e

cd "$(dirname "$0")/.."

# launchd hands processes a bare PATH, so put Homebrew's node back on it.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export NODE_ENV=production
PORT="${PORT:-3000}"

if [ ! -f .next-prod/BUILD_ID ]; then
  echo "[acadesk] no production build found - building first (this takes a moment)"
  npm run build
fi

echo "[acadesk] starting on http://localhost:$PORT"
exec node node_modules/next/dist/bin/next start --port "$PORT"
