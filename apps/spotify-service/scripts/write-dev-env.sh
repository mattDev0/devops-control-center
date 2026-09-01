#!/usr/bin/env bash
# Writes local dev credentials for the spotify service. Values are read from
# prompts (not echoed) and never printed, so they stay out of scrollback.
set -euo pipefail
cd "$(dirname "$0")/.."

read -rp  "SPOTIFY_CLIENT_ID: " CID
read -rsp "SPOTIFY_CLIENT_SECRET: " CSEC; echo

if [ -f scripts/spotify_refresh_token.txt ]; then
  RT=$(tr -d '\n' < scripts/spotify_refresh_token.txt)
  echo "Using refresh token from scripts/spotify_refresh_token.txt"
else
  read -rsp "SPOTIFY_REFRESH_TOKEN: " RT; echo
fi

umask 077
cat > .env <<EOF
SPOTIFY_CLIENT_ID=$CID
SPOTIFY_CLIENT_SECRET=$CSEC
SPOTIFY_REFRESH_TOKEN=$RT
SPOTIFY_DB_PATH=./spotify.db
SPOTIFY_SERVICE_KEY=dev-local-key
RUST_LOG=info
EOF
chmod 600 .env
echo "Wrote $(pwd)/.env (mode 600)."
