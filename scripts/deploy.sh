#!/bin/bash
set -e

# The caller (CI) passes the commit to deploy. Capture it before sourcing .env,
# which may carry a stale COMMIT_SHA from a previous deploy and would otherwise
# silently overwrite it.
_incoming_sha="${COMMIT_SHA:-}"

# Fail closed: load .env if present, and refuse to deploy without required secrets
if [ -f /opt/devops-control-center/.env ]; then
  set -a; . /opt/devops-control-center/.env; set +a
fi

# Incoming value wins; .env is only a fallback for manual runs.
COMMIT_SHA="${_incoming_sha:-${COMMIT_SHA:-}}"
export COMMIT_SHA

: "${JWT_SECRET:?JWT_SECRET is not set - refusing to deploy}"
: "${ADMIN_PASSWORD:?ADMIN_PASSWORD is not set - refusing to deploy}"
: "${AGENT_SECRET_KEY:?AGENT_SECRET_KEY is not set - refusing to deploy}"
: "${COMMIT_SHA:?COMMIT_SHA is not set - refusing to deploy}"

echo "Starting deployment of ${COMMIT_SHA:-<unset>}"

# Navigate to devops-control-center directory
cd /opt/devops-control-center

# --- Stage 1: sync the checkout, then re-exec ------------------------------
# This script updates its own file via "git reset --hard". Bash reads a script
# incrementally by byte offset, so continuing after the swap would execute a
# mixture of the old and new file. Sync first, then re-exec the fresh copy and
# skip straight to stage 2.
if [ "${DCC_DEPLOY_STAGE:-sync}" = "sync" ]; then
  # The repository is public, so a token is optional. Use it when supplied so
  # this still works if the repository is ever made private.
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    git remote set-url origin "https://x-access-token:${GITHUB_TOKEN}@github.com/mattDev0/devops-control-center.git"
  else
    git remote set-url origin "https://github.com/mattDev0/devops-control-center.git"
  fi

  git fetch origin main
  git checkout main
  git reset --hard origin/main

  # Never leave a token sitting in .git/config
  git remote set-url origin "https://github.com/mattDev0/devops-control-center.git"

  chmod +x scripts/*.sh

  echo "Checkout synced; re-executing the updated deploy script."
  export DCC_DEPLOY_STAGE=run
  exec bash scripts/deploy.sh
fi

# --- Stage 2: deploy the synced checkout -----------------------------------
# GHCR images for this repository are public; authenticate only if we can.
if [ -n "${GITHUB_TOKEN:-}" ] && [ -n "${GITHUB_ACTOR:-}" ]; then
  echo "Logging in to GitHub Container Registry..."
  echo "${GITHUB_TOKEN}" | docker login ghcr.io -u "${GITHUB_ACTOR}" --password-stdin
else
  echo "No GITHUB_TOKEN supplied; pulling anonymously."
fi

echo "Pulling latest Docker images..."
COMMIT_SHA="${COMMIT_SHA}" docker compose -f docker-compose.yml -f docker-compose.prod.yml pull

echo "Updating containers..."
COMMIT_SHA="${COMMIT_SHA}" docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

echo "Running post-deploy health check..."
bash scripts/health-check.sh

echo "Cleaning up dangling images..."
docker image prune -f

echo "Docker Compose deployment successfully executed!"
